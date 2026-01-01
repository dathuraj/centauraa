# AI Therapist Context Integration Guide

Complete guide to integrate intelligent context management with your NestJS chat service.

---

## 🏗️ Architecture

```
┌─────────────────────┐
│   NestJS Backend    │
│                     │
│  ┌──────────────┐   │
│  │ ChatService  │   │      HTTP Request
│  └──────┬───────┘   │ ──────────────────►  ┌──────────────────────┐
│         │           │                      │  Python Context API  │
│  ┌──────▼───────┐   │ ◄──────────────────  │   (FastAPI)          │
│  │ Therapist    │   │   Formatted Context  │                      │
│  │ Context      │   │                      │  ┌────────────────┐  │
│  │ Service      │   │                      │  │ Context Manager│  │
│  └──────────────┘   │                      │  └────────────────┘  │
└─────────────────────┘                      └──────────────────────┘
                                                       │
                                        ┌──────────────┴──────────────┐
                                        │                             │
                                   ┌────▼────┐                  ┌─────▼─────┐
                                   │   PostgreSQL   │            │  Weaviate  │
                                   │ (Conversations)│            │ (Embeddings)│
                                   └────────────────┘            └────────────┘
```

---

## 📦 Step 1: Install Dependencies

### Python API
```bash
cd data-pipeline
pip install fastapi uvicorn psycopg2-binary weaviate-client python-dotenv
```

### NestJS Backend
```bash
cd backend
npm install axios
```

---

## ⚙️ Step 2: Configure Environment

Add to your `.env` file:

```env
# Enable Context API
ENABLE_CONTEXT_API=true
CONTEXT_API_URL=http://localhost:8001

# Python Context API Settings (for data-pipeline/.env)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_user
DB_PASSWORD=your_password
WEAVIATE_URL=http://localhost:8080
CONTEXT_API_HOST=0.0.0.0
CONTEXT_API_PORT=8001
```

---

## 🚀 Step 3: Start Services

### Terminal 1: Start Python Context API
```bash
cd data-pipeline
python context_api.py
```

You should see:
```
============================================================
AI THERAPIST CONTEXT API
============================================================
Starting server on 0.0.0.0:8001

API Documentation: http://localhost:8001/docs
Health Check: http://localhost:8001/health
============================================================

INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8001
✅ Ready to serve context!
```

### Terminal 2: Start NestJS Backend
```bash
cd backend
npm run start:dev
```

---

## 🔧 Step 4: Update Your Chat Module

### 4.1 Add TherapistContextService to Module

Edit `backend/src/chat/chat.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { RAGService } from './rag.service';
import { TherapistContextService } from './therapist-context.service'; // Add this

@Module({
  imports: [
    // ... your existing imports
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    RAGService,
    TherapistContextService, // Add this
    // ... other providers
  ],
  exports: [ChatService],
})
export class ChatModule {}
```

### 4.2 Update ChatService

Edit `backend/src/chat/chat.service.ts`:

**Add import:**
```typescript
import { TherapistContextService } from './therapist-context.service';
```

**Add to constructor:**
```typescript
constructor(
  // ... existing injections
  private therapistContextService: TherapistContextService, // Add this
) {
  // ... existing constructor code
}
```

**Replace `getUserContext()` method** (around line 382):

```typescript
private async getUserContext(user: User, conversationId: string): Promise<any> {
  // Check cache first
  const cacheKey = `user_context:${user.id}:${conversationId}`;
  const cached = await this.cacheManager.get(cacheKey);
  if (cached) {
    return cached;
  }

  const startTime = Date.now();

  // NEW: Try to get intelligent context from Context API
  let therapistContext = '';
  if (this.therapistContextService.isEnabled()) {
    try {
      // Get recent messages for context building
      const recentMessages = await this.messageRepository.find({
        where: { conversation: { id: conversationId } },
        order: { createdAt: 'ASC' },
        take: 20, // Last 20 messages
      });

      // Build intelligent context
      therapistContext = await this.therapistContextService.buildContext(
        recentMessages,
        user.id,
        conversationId,
        6000, // 6K token budget
      );

      this.logger.log(`Got intelligent context from Context API (${Date.now() - startTime}ms)`);
    } catch (error) {
      this.logger.warn('Context API unavailable, falling back to basic context');
    }
  }

  // Fetch remaining data in parallel
  const [preferences, recentMoods] = await Promise.all([
    this.preferenceRepository.find({ where: { user } }),
    this.moodLogRepository.find({
      where: { user },
      order: { createdAt: 'DESC' },
      take: 7,
    }),
  ]);

  const context = {
    userName: user.name || 'Friend',
    conversationContext: user.conversationContext || null,
    therapistContext, // NEW: Add intelligent context
    preferences: preferences.reduce((acc, pref) => {
      acc[pref.key] = pref.value;
      return acc;
    }, {}),
    recentMoods: recentMoods.map(mood => ({
      mood: mood.mood,
      date: mood.createdAt,
      note: mood.note,
    })),
  };

  // Cache for 5 minutes
  await this.cacheManager.set(cacheKey, context, 300000);

  return context;
}
```

**Update `buildSystemPrompt()` method** (around line 431):

```typescript
private buildSystemPrompt(context: any, ragContext?: string, crisisDetection?: any): string {
  const angelPrompts = this.promptsService.getPrompts();

  let prompt = `${angelPrompts.angelRoleDescription}

User Context:
- Name: ${context.userName}
- Recent mood patterns: ${JSON.stringify(context.recentMoods)}
- Preferences: ${JSON.stringify(context.preferences)}
`;

  // Add user's conversation context if available
  if (context.conversationContext) {
    prompt += `- Background: ${context.conversationContext}\n`;
  }

  // NEW: Add intelligent therapist context from Context API
  if (context.therapistContext && context.therapistContext.trim().length > 0) {
    prompt += `\n${context.therapistContext}\n`;
  }

  // CRITICAL: Add crisis protocol if crisis detected
  if (crisisDetection?.requiresIntervention) {
    prompt += `\n${angelPrompts.crisisProtocol}\n`;
    prompt += `\n⚠️ ACTIVE CRISIS: Level ${crisisDetection.level}, Confidence: ${(crisisDetection.confidence * 100).toFixed(0)}%\n`;
    prompt += `Emergency resources have already been provided to the user.\n`;
  }

  // Add safety guidelines
  prompt += `\n${angelPrompts.safetyGuidelines}\n`;

  // Add RAG context if available (optional, you may want to remove this if using Context API)
  if (ragContext && ragContext.trim().length > 0) {
    prompt += `\n${ragContext}\n`;
    prompt += angelPrompts.ragInstruction;
  }

  prompt += `\n${angelPrompts.angelCoreGuidelines}`;
  return prompt;
}
```

---

## 🧪 Step 5: Test the Integration

### 5.1 Test Context API Health

```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "postgres": "connected",
  "weaviate": "connected",
  "max_context_tokens": 8000
}
```

### 5.2 Test Context Building

Create a test script `test_context.sh`:

```bash
curl -X POST http://localhost:8001/context/build \
  -H "Content-Type: application/json" \
  -d '{
    "current_session": [
      {"sender_type": "USER", "content": "I'\''ve been feeling really anxious lately"},
      {"sender_type": "BOT", "content": "I hear you. Can you tell me more about that?"},
      {"sender_type": "USER", "content": "It'\''s mostly about work. I can'\''t sleep."}
    ],
    "user_id": "your-user-uuid-here",
    "include_similar": true,
    "token_budget": 6000
  }'
```

### 5.3 Test Chat Flow

Send a message through your NestJS chat endpoint:

```bash
curl -X POST http://localhost:3000/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "userId": "your-user-uuid",
    "content": "I'\''m feeling anxious today"
  }'
```

Check logs for:
```
[ChatService] Got intelligent context from Context API (150ms)
[ChatService] Context breakdown: 3 recent sessions, 2 similar moments
```

---

## 📊 Monitoring & Debugging

### Check Context API Logs
```bash
# Python API logs
tail -f data-pipeline/logs/context_api.log
```

### Check NestJS Logs
Look for:
- `[TherapistContextService] initialized`
- `[ChatService] Got intelligent context from Context API`
- `[TherapistContextService] Built context in Xms`

### FastAPI Interactive Docs
Visit: `http://localhost:8001/docs`

Test endpoints interactively with Swagger UI.

---

## ⚡ Performance Expectations

| Operation | Expected Time |
|-----------|---------------|
| Context API health check | < 50ms |
| Build context (no history) | 50-150ms |
| Build context (with history) | 150-400ms |
| Semantic search | 100-300ms |
| Total impact on chat | +200-500ms |

---

## 🔒 Production Considerations

### 1. Security

```typescript
// Add API key authentication
app.add_middleware(
  CORSMiddleware,
  allow_origins=["https://your-domain.com"],  // Restrict origins
  allow_credentials=True,
)

// Add rate limiting
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@app.post("/context/build")
@limiter.limit("100/minute")
async def build_context(request: ContextRequest):
    ...
```

### 2. Deployment

**Option A: Same Server**
```bash
# Use PM2 or systemd to run both services
pm2 start data-pipeline/context_api.py --name context-api --interpreter python3
pm2 start npm -- run start:prod
```

**Option B: Separate Containers**
```yaml
# docker-compose.yml
services:
  context-api:
    build: ./data-pipeline
    ports:
      - "8001:8001"
    environment:
      - DB_HOST=postgres
      - WEAVIATE_URL=http://weaviate:8080

  nestjs:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - CONTEXT_API_URL=http://context-api:8001
```

### 3. Caching

Add Redis caching to Context API:

```python
import redis
from functools import lru_cache

redis_client = redis.Redis(host='localhost', port=6379)

@lru_cache(maxsize=100)
def get_cached_context(user_id: str, cache_key: str):
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)
    return None
```

### 4. Monitoring

Add metrics:

```python
from prometheus_client import Counter, Histogram

context_requests = Counter('context_requests_total', 'Total context requests')
context_duration = Histogram('context_build_duration_seconds', 'Time to build context')

@app.post("/context/build")
async def build_context(request: ContextRequest):
    context_requests.inc()
    with context_duration.time():
        # ... build context
```

---

## 🆚 Comparison: Context API vs RAG Service

| Feature | RAG Service (Current) | Context API (New) |
|---------|----------------------|-------------------|
| Semantic search | ✅ Yes | ✅ Yes (better) |
| Recent history | ❌ No | ✅ Yes |
| Token management | ❌ No | ✅ Yes |
| User summaries | ❌ No | ✅ Yes |
| Crisis context | ❌ No | ✅ Could add |
| Performance | Fast (GraphQL) | Medium (REST) |

**Recommendation:** Use **both**:
- Context API for comprehensive context building
- RAG Service for real-time semantic search within conversations

---

## 🐛 Troubleshooting

### Context API not responding
```bash
# Check if running
ps aux | grep context_api

# Check logs
tail -f data-pipeline/logs/*.log

# Test health
curl http://localhost:8001/health
```

### "Connection refused" errors
- Ensure Context API is running on correct port
- Check firewall rules
- Verify CONTEXT_API_URL in .env

### Empty context returned
- Check PostgreSQL has conversation data
- Verify Weaviate has embeddings (run embeddings.py)
- Check user_id matches database records

### Slow response times
- Add caching to Context API
- Reduce `token_budget` parameter
- Limit `days_back` for recent conversations
- Add database indexes

---

## 📚 Additional Resources

- **API Documentation**: http://localhost:8001/docs
- **Context Manager README**: `data-pipeline/THERAPIST_CONTEXT_README.md`
- **Usage Examples**: `data-pipeline/example_simple_usage.py`

---

## 🎉 You're Done!

Your AI therapist now has:
✅ Recent conversation history
✅ Semantically similar past moments
✅ Intelligent token budget management
✅ Production-ready API
✅ Full integration with NestJS

**Next Steps:**
1. Monitor performance in production
2. Tune `token_budget` and `similarity_threshold` based on results
3. Add custom prompts based on context type
4. Implement caching for frequently accessed users

---

**Need help?** Check the logs or create an issue!
