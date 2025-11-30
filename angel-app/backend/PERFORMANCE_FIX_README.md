# PostgreSQL Performance Optimization Guide

## Problems Identified

1. **Missing Indexes**: Foreign key relationships and frequently queried columns had no indexes
2. **Inefficient Vector Searches**: No vector indexes for pgvector operations causing full table scans
3. **No Connection Pooling**: Database connections were not pooled, causing overhead
4. **No Query Logging**: Couldn't identify slow queries

## Changes Made

### 1. Added Indexes to Entities

#### Message Entity (message.entity.ts)
- Added index on `conversation` foreign key
- Added index on `createdAt` for sorting
- Added composite index on `[conversation, createdAt]`

#### Conversation Entity (conversation.entity.ts)
- Added index on `user` foreign key
- Added index on `createdAt` for sorting
- Added composite index on `[user, createdAt]`

#### ConversationEmbedding Entity (conversation-embedding.entity.ts)
- Added index on `conversationId`
- Added composite index on `[conversationId, turnIndex]`

### 2. Database Configuration (database.config.ts)
- **Enabled query logging** with warnings for slow queries (>1 second)
- **Added connection pooling**:
  - Max 20 connections
  - Min 5 connections
  - 30s idle timeout
  - 5s connection timeout

### 3. RAG Service Query Optimization (rag.service.ts)
- Optimized vector similarity queries to use indexes properly
- Changed ORDER BY to use vector operator directly (enables HNSW index usage)
- Filter similarity threshold in application code instead of SQL

### 4. Vector Index Migration (migrations/create-vector-indexes.sql)
- Created HNSW index for fast vector similarity searches
- Added indexes for conversation filtering
- Added partial index for non-null embeddings

## How to Apply Fixes

### Step 1: Stop the Service
```bash
# Stop your current running service
# If using PM2:
pm2 stop angel-backend

# If running directly:
# Press Ctrl+C to stop
```

### Step 2: Apply Vector Indexes to PostgreSQL

Connect to your PostgreSQL database and run the migration:

```bash
cd /Users/dathu/Documents/centauraa/angel-app/backend/angel-backend

# Option 1: Using psql directly
psql -h <DATABASE_HOST> -U <DATABASE_USER> -d <DATABASE_NAME> -f migrations/create-vector-indexes.sql

# Option 2: Using psql with environment variables from .env
# First, source your .env file:
export $(cat .env | xargs)
psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -f migrations/create-vector-indexes.sql
```

**Important**: The vector indexes (HNSW) can take some time to build if you have a lot of data. The index builds in the foreground, so wait for it to complete.

### Step 3: TypeORM will auto-sync the new indexes

Since `synchronize: true` is enabled in your config, TypeORM will automatically create the new indexes when you restart the application. However, **I recommend disabling synchronize in production** and using proper migrations.

### Step 4: Rebuild and Restart

```bash
# Install dependencies (if needed)
npm install

# Build the application
npm run build

# Start in development mode
npm run start:dev

# OR start in production mode
npm run start:prod
```

### Step 5: Monitor Performance

After restarting, watch the logs for slow query warnings:

```bash
# The application will now log:
# - All queries (you can see what's being executed)
# - Queries taking longer than 1 second (performance warnings)
```

## Expected Performance Improvements

1. **Message Queries**: 10-100x faster for loading chat history
2. **Conversation Lookups**: 10-50x faster for finding user conversations
3. **Vector Similarity Searches**: 5-20x faster with HNSW index (depends on data size)
4. **Connection Overhead**: Reduced by 50-70% with pooling

## Additional Recommendations

### 1. Disable synchronize in Production

Edit `database.config.ts`:
```typescript
synchronize: process.env.NODE_ENV !== 'production',
```

### 2. Reduce Logging in Production

Edit `database.config.ts`:
```typescript
logging: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'query'],
```

### 3. Monitor Database Performance

```bash
# Check index usage
psql -h <host> -U <user> -d <db> -c "
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
"

# Check slow queries
psql -h <host> -U <user> -d <db> -c "
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 20;
"
```

### 4. Tune PostgreSQL Configuration

Add to your PostgreSQL config (postgresql.conf):
```
# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 16MB

# pgvector specific
max_parallel_workers_per_gather = 2
```

## Troubleshooting

### If indexes aren't being used:
```sql
-- Analyze tables to update statistics
ANALYZE message;
ANALYZE conversation;
ANALYZE conversation_embeddings;

-- Check if indexes exist
\di
```

### If queries are still slow:
1. Check the query logs (now enabled)
2. Use EXPLAIN ANALYZE to see query plans:
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM message WHERE conversation_id = '<uuid>' ORDER BY created_at DESC LIMIT 20;
   ```

### If vector searches are slow:
- Ensure the HNSW index was created successfully
- Check index build status: `SELECT * FROM pg_stat_progress_create_index;`
- Try adjusting HNSW parameters (m and ef_construction) in migration file

## Files Changed

1. `src/entities/message.entity.ts` - Added indexes
2. `src/entities/conversation.entity.ts` - Added indexes
3. `src/entities/conversation-embedding.entity.ts` - Added indexes
4. `src/config/database.config.ts` - Added pooling and logging
5. `src/chat/rag.service.ts` - Optimized queries
6. `migrations/create-vector-indexes.sql` - New vector indexes

## Questions?

If you're still experiencing performance issues after applying these fixes:
1. Check the query logs to identify specific slow queries
2. Use PostgreSQL's EXPLAIN ANALYZE to understand query plans
3. Monitor CPU and memory usage on your database server
4. Consider adding more specific indexes based on your query patterns
