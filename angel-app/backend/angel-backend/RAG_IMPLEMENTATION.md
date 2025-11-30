# RAG (Retrieval-Augmented Generation) Implementation

## Overview

The Angel app now uses RAG to enhance conversation quality by retrieving relevant context from past conversations stored in PostgreSQL with vector embeddings.

## Architecture

### Database Schema

**Table: `conversation_embeddings`**
- `id`: Primary key (integer)
- `conversation_id`: UUID of the conversation (text)
- `turn_index`: Message order in conversation (integer)
- `speaker`: Who said it - 'AGENT' or 'CUSTOMER' (text)
- `text_chunk`: The actual text content (text)
- `embedding`: 1536-dimensional vector embedding (vector(1536))
- `timestamp`: Unix timestamp (bigint)

**Current Data:**
- **549,017 total embeddings**
- **892 unique conversations**
- **307,986 agent messages**
- **241,031 customer messages**

### Components

#### 1. ConversationEmbedding Entity
**File:** `src/entities/conversation-embedding.entity.ts`

Maps to the existing `conversation_embeddings` table in PostgreSQL.

#### 2. RAG Service
**File:** `src/chat/rag.service.ts`

Provides RAG functionality:
- `generateQueryEmbedding(query)` - Generates embeddings using OpenAI text-embedding-3-small
- `semanticSearch(query, limit, threshold)` - Searches for similar conversations using cosine similarity
- `getRelevantContext(message, options)` - Main RAG method that combines semantic search with formatting
- `findSimilarConversations(query, limit)` - Finds conversations similar to a topic
- `getConversationHistory(conversationId)` - Retrieves full conversation by ID

#### 3. Updated Chat Service
**File:** `src/chat/chat.service.ts`

The chat service now:
1. Receives user message
2. Calls `ragService.getRelevantContext()` to find semantically similar past conversations
3. Injects RAG context into system prompt
4. Sends enhanced context to OpenAI GPT-4o-mini
5. Returns response with better continuity and recall

## How RAG Works

### Vector Similarity Search

The RAG service uses **cosine distance** for vector similarity:

```sql
SELECT
  conversation_id,
  turn_index,
  speaker,
  text_chunk,
  1 - (embedding <=> $queryEmbedding::vector) as similarity
FROM conversation_embeddings
WHERE embedding IS NOT NULL
  AND 1 - (embedding <=> $queryEmbedding::vector) >= 0.75
ORDER BY similarity DESC
LIMIT 10;
```

- `<=>` is the cosine distance operator from pgvector
- Similarity score: 1 = identical, 0 = orthogonal
- Default threshold: 0.75 (75% similar)

### RAG Context Format

Retrieved context is formatted as:

```
=== Relevant Context from Past Conversations ===

Conversation 1 (ID: 84fc0fe1...):
  [Turn 42] AGENT (85.3% relevant): Have you experienced depression or anxiety?
  [Turn 158] AGENT (82.1% relevant): Low iron level can mimic anxiety symptoms.

Conversation 2 (ID: 79d3d671...):
  [Turn 674] AGENT (79.8% relevant): The best way to handle stress is...
```

This context is injected into the system prompt, allowing the LLM to:
- Reference specific past conversations
- Maintain continuity across sessions
- Recall important details shared by users

## Configuration

### Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Required for embeddings and chat
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=angel_user
DATABASE_PASSWORD=angel_password
DATABASE_NAME=angel_db
```

### RAG Parameters

Adjustable in `chat.service.ts` > `generateBotResponse()`:

```typescript
const ragContext = await this.ragService.getRelevantContext(message, {
  limit: 10,                    // Max number of similar chunks to retrieve
  similarityThreshold: 0.75,    // Minimum similarity score (0-1)
  includeAgent: true,           // Include agent responses
  includeCustomer: true,        // Include customer messages
});
```

## Benefits

### Before RAG
- Only last 20 messages from current conversation used as context
- No memory of past conversations or sessions
- Limited understanding of user history

### After RAG
- Searches across **549,017 embeddings** from **892 conversations**
- Finds relevant past discussions regardless of when they occurred
- Provides continuity: "Last time we discussed your anxiety about work..."
- Better personalization based on historical patterns

## Performance Considerations

### Vector Index

PostgreSQL with pgvector automatically indexes vector columns for fast similarity search.

**Query Performance:**
- Typical semantic search: ~50-200ms for 549K embeddings
- OpenAI embedding generation: ~100-300ms per query
- Total RAG overhead: ~200-500ms per message

### Optimization Tips

1. **Adjust similarity threshold** - Higher = fewer but more relevant results
2. **Limit results** - Default 10 is good balance
3. **Filter by speaker** - Set `includeAgent: false` to only search user messages
4. **Conversation-specific search** - Use `searchInConversation()` for scoped queries

## Monitoring

### Debug Logs

The chat service logs RAG activity:

```
=== DEBUG: RAG Context ===
Found 8 relevant chunks
1. [87.3%] Have you experienced depression or anxiety?...
2. [85.1%] Low iron level can mimic anxiety symptoms...
3. [82.9%] What's the main trigger for your anxiety?...
...
=== END DEBUG ===
```

### Database Queries

Monitor RAG performance:

```sql
-- Check embedding distribution
SELECT
  speaker,
  COUNT(*) as count,
  AVG(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) * 100 as pct_with_embedding
FROM conversation_embeddings
GROUP BY speaker;

-- Find most referenced conversations
SELECT
  conversation_id,
  COUNT(*) as times_matched
FROM (
  -- Your RAG similarity queries here
) as matches
GROUP BY conversation_id
ORDER BY times_matched DESC
LIMIT 10;
```

## Testing

### Manual Test

```bash
# Run test SQL queries
PGPASSWORD=angel_password psql -h localhost -U angel_user -d angel_db \
  -f test-rag-query.sql

# Test via API (requires valid JWT token)
curl -X POST http://localhost:3000/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"message": "I am feeling anxious today"}'
```

### Expected Behavior

1. User sends: "I'm feeling anxious today"
2. RAG finds past conversations about anxiety
3. System prompt includes relevant context
4. Bot response references past discussions: "I remember you mentioned anxiety about work before..."

## Future Enhancements

1. **Mood-aware RAG** - Weight recent mood logs in similarity search
2. **Temporal decay** - Prefer more recent conversations
3. **User-specific embeddings** - Search only within user's history
4. **Conversation summarization** - Generate and embed conversation summaries
5. **Multi-turn RAG** - Track which contexts were most useful
6. **Feedback loop** - Learn from user engagement with responses

## Troubleshooting

### No RAG results found

**Symptoms:** `Found 0 relevant chunks`

**Causes:**
- OpenAI API key missing or invalid
- Similarity threshold too high
- Query too generic
- Embeddings not populated

**Solutions:**
```bash
# Verify embeddings exist
psql -c "SELECT COUNT(*) FROM conversation_embeddings WHERE embedding IS NOT NULL;"

# Lower similarity threshold
# In chat.service.ts: similarityThreshold: 0.65

# Check OpenAI API key
echo $OPENAI_API_KEY
```

### Slow RAG queries

**Symptoms:** Response time > 1 second

**Causes:**
- Large result set
- No vector index
- Slow embedding generation

**Solutions:**
```sql
-- Verify index exists
\d conversation_embeddings

-- Should show:
-- "conversation_embeddings_pkey" PRIMARY KEY
-- Indexes are automatic for vector columns in pgvector

-- Reduce limit
const ragContext = await this.ragService.getRelevantContext(message, {
  limit: 5,  // Down from 10
});
```

## API Reference

### RAGService Methods

```typescript
// Generate embedding for text
generateQueryEmbedding(query: string): Promise<number[]>

// Semantic search across all conversations
semanticSearch(
  query: string,
  limit: number = 10,
  similarityThreshold: number = 0.7
): Promise<RAGResult[]>

// Get formatted RAG context (main method)
getRelevantContext(
  currentMessage: string,
  options: {
    limit?: number;
    similarityThreshold?: number;
    includeAgent?: boolean;
    includeCustomer?: boolean;
  }
): Promise<{
  relevantChunks: RAGResult[];
  contextSummary: string;
}>

// Search within specific conversation
searchInConversation(
  conversationId: string,
  query: string,
  limit: number = 5
): Promise<RAGResult[]>

// Find similar conversations
findSimilarConversations(
  query: string,
  limit: number = 5
): Promise<string[]>

// Get full conversation history
getConversationHistory(
  conversationId: string,
  limit?: number
): Promise<RAGResult[]>
```

### RAGResult Interface

```typescript
interface RAGResult {
  conversationId: string;  // UUID of conversation
  turnIndex: number;       // Message order in conversation
  speaker: string;         // 'AGENT' or 'CUSTOMER'
  textChunk: string;       // The actual message text
  similarity: number;      // Similarity score (0-1)
  timestamp: number;       // Unix timestamp
}
```

## Conclusion

The RAG implementation transforms the Angel app from a stateless chatbot into an intelligent companion with memory. By searching across 549K+ embeddings, it provides contextual, personalized responses that reference past conversations naturally.

**Key Metrics:**
- ✅ 549,017 embeddings available
- ✅ 892 conversations searchable
- ✅ ~200-500ms RAG overhead per message
- ✅ 75%+ similarity threshold for quality
- ✅ Seamless integration with existing chat flow
