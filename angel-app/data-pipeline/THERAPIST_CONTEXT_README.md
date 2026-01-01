# AI Therapist Context Management System

Intelligent context management for AI therapist applications using PostgreSQL and Weaviate.

## 🎯 What It Does

Automatically builds optimal conversation context for your AI therapist by:
- ✅ Retrieving recent conversation history from PostgreSQL
- ✅ Finding semantically similar past conversations using Weaviate embeddings
- ✅ Managing token budgets to fit within LLM context windows
- ✅ Prioritizing relevant information (current session, safety data, patterns)

## 📋 Prerequisites

- **PostgreSQL** with your conversation data
- **Weaviate** with embeddings (from `embeddings.py`)
- **Python 3.8+**
- Required packages: `psycopg2-binary`, `weaviate-client`, `python-dotenv`

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install psycopg2-binary weaviate-client python-dotenv
```

### 2. Set Up Environment Variables

Create a `.env` file:

```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_user
DB_PASSWORD=your_password

# Weaviate
WEAVIATE_URL=http://localhost:8080
# WEAVIATE_API_KEY=your_key  # Optional

# OpenAI (for your therapist)
OPENAI_API_KEY=your_openai_key
```

### 3. Basic Usage

```python
from therapist_context_manager import TherapistContextManager

# Initialize
manager = TherapistContextManager(max_context_tokens=6000)

# Current conversation
current_session = [
    {
        "sender_type": "USER",
        "content": "I've been feeling anxious lately..."
    },
    {
        "sender_type": "BOT",
        "content": "I hear you. Can you tell me more about what's causing the anxiety?"
    }
]

# Build context
context = manager.build_context(
    current_session=current_session,
    user_id="user-uuid-here",
    include_similar=True
)

# Format for LLM
llm_prompt = manager.format_for_llm(context)

# Use with OpenAI/Claude/etc
# ... send llm_prompt to your LLM ...

manager.close()
```

## 📊 Context Structure

The context manager builds a structured context with:

### 1. Current Session (40% of tokens)
The ongoing conversation - highest priority

### 2. Recent History (35% of tokens)
Last 3-4 conversations with summaries

### 3. Relevant Past Context (25% of tokens)
Semantically similar moments from past conversations where patient made progress

## 🎛️ Token Budget Management

Different scenarios need different context sizes:

| Scenario | Token Budget | Use Case |
|----------|-------------|----------|
| Quick check-in | 2,000 | Daily mood tracking |
| Standard session | 6,000 | Regular therapy session |
| Deep dive | 12,000 | Complex issues, crisis |
| Crisis intervention | 8,000 | Safety-critical context |

Example:

```python
# For a quick check-in
manager = TherapistContextManager(max_context_tokens=2000)

# For a full therapy session
manager = TherapistContextManager(max_context_tokens=6000)

# For crisis with extensive history
manager = TherapistContextManager(max_context_tokens=12000)
```

## 🔍 Semantic Search

Find similar past conversations:

```python
results = manager.search_similar_conversations(
    query="I'm having panic attacks",
    user_id="user-uuid",
    limit=5,
    similarity_threshold=0.7  # 70% similarity minimum
)

for result in results:
    print(f"Similarity: {result['similarity']*100:.0f}%")
    print(f"Text: {result['text_chunk']}")
```

## 🔗 Integration with OpenAI

Complete example:

```python
from openai import OpenAI
from therapist_context_manager import TherapistContextManager

# Initialize
manager = TherapistContextManager(max_context_tokens=6000)
openai_client = OpenAI(api_key="your-key")

# Build context
context = manager.build_context(
    current_session=current_messages,
    user_id=user_id,
    include_similar=True
)

# System prompt
system_prompt = """You are a compassionate AI therapist.
Use evidence-based approaches (CBT, DBT).
Always prioritize patient safety."""

# Format context
context_prompt = manager.format_for_llm(context)

# Call OpenAI
response = openai_client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": context_prompt}
    ],
    temperature=0.7
)

therapist_response = response.choices[0].message.content
```

## 📝 Database Schema

The context manager expects these PostgreSQL tables:

### `conversation`
```sql
- id (uuid, primary key)
- userId (uuid, foreign key to user)
- title (varchar)
- createdAt (timestamp)
```

### `message`
```sql
- id (uuid, primary key)
- conversationId (uuid, foreign key)
- senderType (enum: 'USER', 'BOT')
- content (text)
- createdAt (timestamp)
```

### Weaviate `ConversationEmbedding` Class
```
- conversationId (text)
- turnIndex (number)
- speaker (text)
- textChunk (text)
- timestamp (number)
- vector (embedding)
```

## 🎯 API Reference

### `TherapistContextManager`

#### `__init__(postgres_connection_string, weaviate_url, max_context_tokens)`
Initialize the context manager.

**Parameters:**
- `postgres_connection_string` (str, optional): PostgreSQL connection string
- `weaviate_url` (str, default: "http://localhost:8080"): Weaviate URL
- `weaviate_api_key` (str, optional): Weaviate API key
- `max_context_tokens` (int, default: 8000): Maximum token budget

#### `build_context(current_session, conversation_id, user_id, include_similar, token_budget)`
Build complete therapeutic context.

**Parameters:**
- `current_session` (List[Dict]): Current messages
- `conversation_id` (str, optional): Current conversation UUID
- `user_id` (str, optional): User UUID
- `include_similar` (bool, default: True): Include semantic search results
- `token_budget` (int, optional): Override default token budget

**Returns:** Dict with structured context

#### `format_for_llm(context)`
Format context dictionary into LLM-ready prompt string.

**Parameters:**
- `context` (Dict): Context from `build_context()`

**Returns:** Formatted string for LLM

#### `search_similar_conversations(query, user_id, limit, similarity_threshold)`
Semantic search for similar past conversations.

**Parameters:**
- `query` (str): Search query
- `user_id` (str, optional): Filter by user
- `limit` (int, default: 5): Max results
- `similarity_threshold` (float, default: 0.7): Minimum similarity (0-1)

**Returns:** List of similar conversation chunks

#### `get_conversation(conversation_id)`
Get full conversation from PostgreSQL.

**Parameters:**
- `conversation_id` (str): Conversation UUID

**Returns:** Dict with conversation and messages

#### `get_recent_conversations(user_id, limit, days_back)`
Get recent conversations for a user.

**Parameters:**
- `user_id` (str): User UUID
- `limit` (int, default: 5): Max conversations
- `days_back` (int, default: 90): How many days to look back

**Returns:** List of conversation summaries

## ⚠️ Best Practices

### ✅ DO:
- **Always close connections**: Call `manager.close()` when done
- **Monitor token usage**: Check `context['token_usage']` to ensure you're within limits
- **Use appropriate budgets**: Smaller for check-ins, larger for complex sessions
- **Include semantic search**: Helps provide continuity and relevant past context
- **Filter by user**: Always pass `user_id` to protect patient privacy

### ❌ DON'T:
- Load unnecessary history for quick interactions
- Exceed your LLM's context window
- Mix patients' data (always filter by user_id)
- Forget to handle connection errors
- Hard-code sensitive credentials (use environment variables)

## 🔒 Privacy & Security

- **Patient isolation**: All queries filter by `user_id` to prevent data leakage
- **No PII in logs**: Sensitive information is not logged
- **Secure connections**: Use SSL for production databases
- **Token limits**: Context is truncated to fit budgets, preventing over-exposure

## 🐛 Troubleshooting

### "Connection refused" error
- Check PostgreSQL and Weaviate are running
- Verify connection strings in `.env`
- Test with `psql` or Weaviate console

### "No results found" from semantic search
- Ensure embeddings were created (run `embeddings.py` first)
- Lower `similarity_threshold` (try 0.6 instead of 0.7)
- Check that Weaviate has data: Visit `http://localhost:8080/v1/schema`

### Token budget exceeded
- Reduce `max_context_tokens`
- Limit `days_back` for recent conversations
- Reduce `limit` for semantic search

### Slow performance
- Add database indexes on `userId` and `createdAt`
- Reduce `days_back` parameter
- Use connection pooling for high-traffic applications

## 📚 Examples

See the example files:
- `example_simple_usage.py` - Basic examples
- `example_therapist_context.py` - Advanced scenarios (MongoDB version, needs updating)

Run examples:
```bash
python example_simple_usage.py
```

## 🚀 Performance Tips

1. **Connection pooling**: For production, use `psycopg2.pool`
2. **Caching**: Cache user summaries for frequently active users
3. **Async queries**: Use `asyncpg` for better performance
4. **Index optimization**: Ensure indexes on `userId`, `createdAt`, `conversationId`

## 📈 Monitoring

Track these metrics:
- Average token usage per context build
- Semantic search relevance scores
- Context build time
- Cache hit rates (if caching)

## 🤝 Integration with NestJS Backend

Your NestJS backend already has `RAGService`. You can either:

**Option 1**: Use this Python context manager for batch processing or analysis

**Option 2**: Port the logic to TypeScript for native integration

**Option 3**: Create a Python microservice that your NestJS app calls

Example NestJS integration:

```typescript
// In your chat service
import { exec } from 'child_process';

async buildTherapyContext(userId: string, currentMessages: Message[]) {
  // Call Python script
  const context = await this.callPythonContextManager(userId, currentMessages);
  return context;
}
```

## 📞 Support

- Check logs: Context manager logs to console with level INFO
- Enable debug: `logging.basicConfig(level=logging.DEBUG)`
- Review database: Check PostgreSQL and Weaviate have data

## 📄 License

Part of the Centauraa Angel App project.

---

**Built with ❤️ for better mental health support**
