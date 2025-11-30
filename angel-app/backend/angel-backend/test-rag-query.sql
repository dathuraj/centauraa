-- Test RAG vector similarity search
-- This query demonstrates how the RAG service searches for similar conversations

-- First, let's see a sample of embeddings in the database
SELECT
    conversation_id,
    turn_index,
    speaker,
    LEFT(text_chunk, 100) as text_preview,
    timestamp
FROM conversation_embeddings
WHERE embedding IS NOT NULL
ORDER BY timestamp DESC
LIMIT 5;

-- Check total embeddings available
SELECT
    COUNT(*) as total_embeddings,
    COUNT(DISTINCT conversation_id) as unique_conversations,
    COUNT(CASE WHEN speaker = 'AGENT' THEN 1 END) as agent_messages,
    COUNT(CASE WHEN speaker = 'CUSTOMER' THEN 1 END) as customer_messages
FROM conversation_embeddings
WHERE embedding IS NOT NULL;

-- Sample similarity search (requires a query embedding)
-- This is what the RAG service does internally:
-- SELECT
--   conversation_id,
--   turn_index,
--   speaker,
--   text_chunk,
--   timestamp,
--   1 - (embedding <=> $queryEmbedding::vector) as similarity
-- FROM conversation_embeddings
-- WHERE embedding IS NOT NULL
--   AND 1 - (embedding <=> $queryEmbedding::vector) >= 0.75
-- ORDER BY similarity DESC
-- LIMIT 10;

-- Find conversations about specific topics (keyword search for comparison)
SELECT
    conversation_id,
    turn_index,
    speaker,
    text_chunk,
    timestamp
FROM conversation_embeddings
WHERE text_chunk ILIKE '%anxiety%'
   OR text_chunk ILIKE '%stress%'
   OR text_chunk ILIKE '%worried%'
ORDER BY timestamp DESC
LIMIT 10;
