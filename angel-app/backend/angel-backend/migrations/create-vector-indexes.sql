-- Migration script to add pgvector indexes for better performance
-- This should be run AFTER the entities have created the tables

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create HNSW index for faster vector similarity searches
-- HNSW (Hierarchical Navigable Small World) is faster than IVFFlat for most use cases
-- m=16: number of connections per layer (higher = better recall, slower build)
-- ef_construction=64: size of dynamic candidate list (higher = better quality, slower build)
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_vector_hnsw
ON conversation_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (faster to build, slightly slower queries)
-- Uncomment if you prefer this approach:
-- CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_vector_ivfflat
-- ON conversation_embeddings
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- Create index on conversation_id for filtering within conversations
-- This is in addition to the TypeORM index
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_conversation_speaker
ON conversation_embeddings (conversation_id, speaker);

-- Add index for null embedding checks (to avoid including rows without embeddings)
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_not_null
ON conversation_embeddings (id)
WHERE embedding IS NOT NULL;

-- Analyze the table to update statistics for query planner
ANALYZE conversation_embeddings;

-- Optional: Set up autovacuum settings for better maintenance
-- ALTER TABLE conversation_embeddings SET (
--   autovacuum_vacuum_scale_factor = 0.05,
--   autovacuum_analyze_scale_factor = 0.05
-- );
