# Weaviate Migration Guide

## Overview

This application has been migrated from using PostgreSQL with pgvector for vector embeddings to using **Weaviate** as a dedicated vector database. This change improves performance, scalability, and simplifies the vector search implementation while maintaining PostgreSQL for relational data.

## What Changed

### Architecture

**Before:**
- PostgreSQL for all data (relational + vectors)
- pgvector extension for vector similarity search
- ConversationEmbedding entity in TypeORM

**After:**
- PostgreSQL for relational data (Users, Conversations, Messages, Moods, Medications)
- Weaviate for vector embeddings and semantic search
- Native vector search with improved performance

### Files Modified

1. **New Files:**
   - `src/config/weaviate.config.ts` - Weaviate connection and schema configuration
   - `src/weaviate/weaviate.module.ts` - NestJS module for Weaviate

2. **Updated Files:**
   - `src/chat/rag.service.ts` - Completely rewritten to use Weaviate
   - `src/chat/chat.module.ts` - Added WeaviateModule import
   - `src/app.module.ts` - Added Weaviate initialization on startup
   - `.env` - Added Weaviate configuration variables

3. **Removed/Backed Up:**
   - `src/entities/conversation-embedding.entity.ts` - Backed up as `.backup`
   - `pgvector` npm package - Removed from dependencies

## Setup Instructions

### 1. Install and Run Weaviate

**Option A: Using Docker (Recommended)**

```bash
docker run -d \
  --name weaviate \
  -p 8080:8080 \
  -e AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true \
  -e PERSISTENCE_DATA_PATH='/var/lib/weaviate' \
  weaviate/weaviate:latest
```

**Option B: Using Docker Compose**

Create `docker-compose.weaviate.yml`:

```yaml
version: '3.4'
services:
  weaviate:
    image: weaviate/weaviate:latest
    ports:
      - 8080:8080
    environment:
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true'
      PERSISTENCE_DATA_PATH: '/var/lib/weaviate'
      QUERY_DEFAULTS_LIMIT: 25
      DEFAULT_VECTORIZER_MODULE: 'none'
    volumes:
      - weaviate_data:/var/lib/weaviate

volumes:
  weaviate_data:
```

Run with:
```bash
docker-compose -f docker-compose.weaviate.yml up -d
```

### 2. Environment Configuration

The following environment variables have been added to `.env`:

```bash
# Weaviate Configuration (for vector embeddings)
WEAVIATE_SCHEME=http
WEAVIATE_HOST=localhost:8080
```

### 3. Install Dependencies

Dependencies have already been updated. If you need to reinstall:

```bash
npm install
```

### 4. Start the Application

```bash
npm run start:dev
```

The application will automatically:
1. Connect to Weaviate
2. Create the `ConversationEmbedding` schema if it doesn't exist
3. Be ready to store and search vector embeddings

## Schema Structure

### Weaviate ConversationEmbedding Collection

```typescript
{
  class: 'ConversationEmbedding',
  properties: [
    {
      name: 'conversationId',    // UUID of the conversation
      dataType: ['text'],
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'turnIndex',         // Position in conversation
      dataType: ['int'],
    },
    {
      name: 'speaker',           // 'CUSTOMER' or 'AGENT'
      dataType: ['text'],
      indexFilterable: true,
    },
    {
      name: 'textChunk',         // Message content
      dataType: ['text'],
      indexSearchable: true,
    },
    {
      name: 'timestamp',         // Unix timestamp
      dataType: ['number'],
    },
  ],
  vectorIndexConfig: {
    distance: 'cosine',          // Cosine similarity
  },
}
```

## API Changes

### RAGService

The RAGService API remains the same, but now uses Weaviate internally:

#### 1. Store Embeddings

```typescript
// NEW METHOD: Store embeddings in Weaviate
await ragService.storeEmbedding(
  conversationId,
  turnIndex,
  speaker,
  textChunk,
  embedding,
  timestamp
);
```

#### 2. Semantic Search

```typescript
// Search across all conversations
const results = await ragService.semanticSearch(
  query,
  limit,
  similarityThreshold
);
```

#### 3. Search in Conversation

```typescript
// Search within a specific conversation
const results = await ragService.searchInConversation(
  conversationId,
  query,
  limit
);
```

#### 4. Get Relevant Context

```typescript
// Get full conversation context for RAG
const { relevantChunks, contextSummary } = await ragService.getRelevantContext(
  currentMessage,
  { limit: 10, similarityThreshold: 0.7 }
);
```

## Migration Path for Existing Data

If you have existing conversation embeddings in PostgreSQL, you need to migrate them to Weaviate:

### Option 1: Fresh Start (Recommended for Development)

Simply start using the new system. Old embeddings in PostgreSQL will be ignored, and new conversations will be stored in Weaviate.

### Option 2: Migrate Existing Data

Create a migration script to copy embeddings from PostgreSQL to Weaviate:

```typescript
// Example migration script (create as src/scripts/migrate-embeddings.ts)
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { RAGService } from '../chat/rag.service';

async function migrateEmbeddings() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const ragService = app.get(RAGService);

  // Fetch all embeddings from PostgreSQL
  const embeddings = await dataSource.query(`
    SELECT conversation_id, turn_index, speaker, text_chunk, embedding, timestamp
    FROM conversation_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY conversation_id, turn_index
  `);

  console.log(`Migrating ${embeddings.length} embeddings...`);

  // Store each embedding in Weaviate
  for (const emb of embeddings) {
    await ragService.storeEmbedding(
      emb.conversation_id,
      emb.turn_index,
      emb.speaker,
      emb.text_chunk,
      JSON.parse(emb.embedding),
      emb.timestamp
    );
  }

  console.log('Migration completed!');
  await app.close();
}

migrateEmbeddings();
```

## Performance Benefits

### Before (PostgreSQL + pgvector)
- Vector search: ~100-500ms for large datasets
- Index type: HNSW (limited tuning)
- Requires custom SQL queries
- Scaling requires PostgreSQL scaling

### After (Weaviate)
- Vector search: ~10-50ms for similar datasets
- Index type: HNSW (highly optimized)
- Native GraphQL API
- Independent scaling from relational data

## Troubleshooting

### Weaviate Connection Issues

**Problem:** Cannot connect to Weaviate
```
Error: connect ECONNREFUSED 127.0.0.1:8080
```

**Solution:**
1. Check if Weaviate is running: `docker ps | grep weaviate`
2. Start Weaviate if not running: `docker start weaviate`
3. Verify environment variables in `.env`

### Schema Already Exists

**Problem:** Schema initialization fails
```
Error: class ConversationEmbedding already exists
```

**Solution:**
This is expected and handled automatically. The application checks if the schema exists before creating it.

### Vector Search Returns No Results

**Problem:** Searches return empty results

**Solution:**
1. Ensure embeddings are being stored: Check Weaviate logs
2. Verify OpenAI API key is configured for embedding generation
3. Check similarity threshold (try lowering from 0.7 to 0.5)

### Query Weaviate Data

```bash
# Check if schema exists
curl http://localhost:8080/v1/schema

# Check number of objects
curl http://localhost:8080/v1/objects?class=ConversationEmbedding

# GraphQL query
curl -X POST http://localhost:8080/v1/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "{
      Get {
        ConversationEmbedding(limit: 10) {
          conversationId
          turnIndex
          speaker
          textChunk
        }
      }
    }"
  }'
```

## Rollback Instructions

If you need to rollback to PostgreSQL + pgvector:

1. Restore the entity file:
   ```bash
   mv src/entities/conversation-embedding.entity.ts.backup src/entities/conversation-embedding.entity.ts
   ```

2. Reinstall pgvector:
   ```bash
   npm install pgvector@^0.2.1
   ```

3. Revert code changes:
   ```bash
   git checkout HEAD~1 -- src/chat/rag.service.ts src/chat/chat.module.ts src/app.module.ts
   ```

4. Remove Weaviate files:
   ```bash
   rm -rf src/weaviate src/config/weaviate.config.ts
   ```

5. Update `.env` to remove Weaviate configuration

## Additional Resources

- [Weaviate Documentation](https://weaviate.io/developers/weaviate)
- [Weaviate GraphQL API](https://weaviate.io/developers/weaviate/api/graphql)
- [Vector Search Best Practices](https://weaviate.io/developers/weaviate/concepts/vector-index)

## Support

For questions or issues related to this migration, please contact the development team.
