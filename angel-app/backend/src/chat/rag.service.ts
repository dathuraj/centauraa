import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ConversationEmbedding } from '../entities/conversation-embedding.entity';

export interface RAGResult {
  conversationId: string;
  turnIndex: number;
  speaker: string;
  textChunk: string;
  similarity: number;
  timestamp: number;
}

@Injectable()
export class RAGService {
  private openai: OpenAI;

  constructor(
    @InjectRepository(ConversationEmbedding)
    private conversationEmbeddingRepository: Repository<ConversationEmbedding>,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate embedding for a query using OpenAI
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating query embedding:', error);
      throw error;
    }
  }

  /**
   * Perform semantic search across all conversation embeddings
   */
  async semanticSearch(
    query: string,
    limit: number = 10,
    similarityThreshold: number = 0.7,
  ): Promise<RAGResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // Perform vector similarity search using cosine distance
      // pgvector: <=> operator for cosine distance (0 = identical, 2 = opposite)
      // Convert to similarity score: 1 - (distance / 2) to get 0-1 scale
      // OPTIMIZED: Use ORDER BY with vector operator directly (uses HNSW index)
      // LIMIT first, then filter - this is much faster with index
      const results = await this.conversationEmbeddingRepository.query(
        `
        SELECT
          conversation_id,
          turn_index,
          speaker,
          text_chunk,
          timestamp,
          1 - (embedding <=> $1::vector) as similarity
        FROM conversation_embeddings
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
        `,
        [JSON.stringify(queryEmbedding), limit * 2], // Get 2x limit, then filter
      );

      // Filter by similarity threshold in application code
      // This is faster than filtering in SQL with vector operations
      return results
        .filter((row: any) => parseFloat(row.similarity) >= similarityThreshold)
        .slice(0, limit)
        .map((row: any) => ({
          conversationId: row.conversation_id,
          turnIndex: row.turn_index,
          speaker: row.speaker,
          textChunk: row.text_chunk,
          similarity: parseFloat(row.similarity),
          timestamp: row.timestamp ? parseInt(row.timestamp) : 0,
        }));
    } catch (error) {
      console.error('Error performing semantic search:', error);
      return [];
    }
  }

  /**
   * Search within a specific conversation
   */
  async searchInConversation(
    conversationId: string,
    query: string,
    limit: number = 5,
  ): Promise<RAGResult[]> {
    try {
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // OPTIMIZED: Use index-friendly query structure
      const results = await this.conversationEmbeddingRepository.query(
        `
        SELECT
          conversation_id,
          turn_index,
          speaker,
          text_chunk,
          timestamp,
          1 - (embedding <=> $1::vector) as similarity
        FROM conversation_embeddings
        WHERE conversation_id = $2
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        `,
        [JSON.stringify(queryEmbedding), conversationId, limit],
      );

      return results.map((row: any) => ({
        conversationId: row.conversation_id,
        turnIndex: row.turn_index,
        speaker: row.speaker,
        textChunk: row.text_chunk,
        similarity: parseFloat(row.similarity),
        timestamp: row.timestamp ? parseInt(row.timestamp) : 0,
      }));
    } catch (error) {
      console.error('Error searching in conversation:', error);
      return [];
    }
  }

  /**
   * Get relevant context using RAG approach
   * Searches for similar CUSTOMER messages and returns entire conversations as context
   */
  async getRelevantContext(
    currentMessage: string,
    options: {
      limit?: number;
      similarityThreshold?: number;
      includeAgent?: boolean;
      includeCustomer?: boolean;
    } = {},
  ): Promise<{
    relevantChunks: RAGResult[];
    contextSummary: string;
  }> {
    const {
      limit = 10,
      similarityThreshold = 0.7,
    } = options;

    try {
      // Search for similar CUSTOMER messages only
      const customerChunks = await this.semanticSearchByRole(
        currentMessage,
        'CUSTOMER',
        limit * 5, // Get more to increase chances of finding matches
        similarityThreshold,
      );

      console.log(`RAG: Found ${customerChunks.length} matching CUSTOMER chunks with threshold ${similarityThreshold}`);
      if (customerChunks.length > 0) {
        console.log(`RAG: Top match similarity: ${(customerChunks[0].similarity * 100).toFixed(1)}%`);
      }

      // Get unique conversations from matching customer messages
      const conversationIds = [
        ...new Set(customerChunks.map((c) => c.conversationId)),
      ].slice(0, limit); // Limit number of conversations

      console.log(`RAG: ${conversationIds.length} unique conversations found`);

      // Fetch entire conversations
      const conversations = await this.getEntireConversations(conversationIds);

      // Flatten all chunks for relevantChunks return value
      const allChunks: RAGResult[] = [];
      conversations.forEach((conv) => {
        allChunks.push(...conv.chunks);
      });

      // Format context summary with full conversations
      const contextSummary = this.formatSimilarConversations(
        conversations,
        customerChunks,
      );

      return {
        relevantChunks: allChunks,
        contextSummary,
      };
    } catch (error) {
      console.error('Error getting relevant context:', error);
      return {
        relevantChunks: [],
        contextSummary: '',
      };
    }
  }

  /**
   * Search for similar chunks filtered by speaker role
   */
  private async semanticSearchByRole(
    query: string,
    role: 'CUSTOMER' | 'AGENT',
    limit: number,
    similarityThreshold: number,
  ): Promise<RAGResult[]> {
    try {
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // Use a placeholder for logging to avoid massive embedding arrays in logs
      const embeddingPlaceholder = `[embedding vector: ${queryEmbedding.length} dimensions]`;

      const results = await this.conversationEmbeddingRepository.query(
        `
        SELECT
          conversation_id,
          turn_index,
          speaker,
          text_chunk,
          timestamp,
          1 - (embedding <=> $1::vector) as similarity
        FROM conversation_embeddings
        WHERE embedding IS NOT NULL
          AND speaker = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        `,
        [JSON.stringify(queryEmbedding), role, limit * 2],
      );

      return results
        .filter((row: any) => parseFloat(row.similarity) >= similarityThreshold)
        .slice(0, limit)
        .map((row: any) => ({
          conversationId: row.conversation_id,
          turnIndex: row.turn_index,
          speaker: row.speaker,
          textChunk: row.text_chunk,
          similarity: parseFloat(row.similarity),
          timestamp: row.timestamp ? parseInt(row.timestamp) : 0,
        }));
    } catch (error) {
      console.error('Error in semanticSearchByRole:', error);
      return [];
    }
  }

  /**
   * Get entire conversations by conversation IDs
   */
  private async getEntireConversations(
    conversationIds: string[],
  ): Promise<Array<{ conversationId: string; chunks: RAGResult[] }>> {
    const conversations: Array<{ conversationId: string; chunks: RAGResult[] }> = [];

    for (const conversationId of conversationIds) {
      const chunks = await this.conversationEmbeddingRepository.query(
        `
        SELECT
          conversation_id,
          turn_index,
          speaker,
          text_chunk,
          timestamp
        FROM conversation_embeddings
        WHERE conversation_id = $1
        ORDER BY turn_index ASC
        `,
        [conversationId],
      );

      if (chunks.length > 0) {
        conversations.push({
          conversationId,
          chunks: chunks.map((row: any) => ({
            conversationId: row.conversation_id,
            turnIndex: row.turn_index,
            speaker: row.speaker,
            textChunk: row.text_chunk,
            similarity: 1.0, // Full conversation, not similarity-based
            timestamp: row.timestamp ? parseInt(row.timestamp) : 0,
          })),
        });
      }
    }

    return conversations;
  }

  /**
   * Format similar conversations with full context
   */
  private formatSimilarConversations(
    conversations: Array<{ conversationId: string; chunks: RAGResult[] }>,
    matchingCustomerChunks: RAGResult[],
  ): string {
    if (conversations.length === 0) {
      return '';
    }

    let summary =
      '=== Similar Past Conversations ===\n\n';
    summary +=
      'The user has previously discussed similar topics. Here are relevant past conversations:\n\n';

    conversations.forEach((conv, convIndex) => {
      // Find the matching customer chunk for this conversation
      const matchingChunk = matchingCustomerChunks.find(
        (c) => c.conversationId === conv.conversationId,
      );

      const similarityPercent = matchingChunk
        ? (matchingChunk.similarity * 100).toFixed(1)
        : '0.0';

      summary += `--- Conversation ${convIndex + 1} (${similarityPercent}% relevant) ---\n`;
      summary += `ID: ${conv.conversationId.substring(0, 8)}...\n\n`;

      // Add all turns in the conversation
      conv.chunks.forEach((chunk) => {
        const speaker = chunk.speaker === 'CUSTOMER' ? 'User' : 'Assistant';
        summary += `${speaker}: ${chunk.textChunk}\n\n`;
      });

      summary += '\n';
    });

    summary +=
      'Use these similar conversations to provide continuity, recall patterns, and reference past discussions when relevant.\n';

    return summary;
  }

  /**
   * Format RAG results into a context summary for the LLM
   */
  private formatContextSummary(chunks: RAGResult[]): string {
    if (chunks.length === 0) {
      return '';
    }

    let summary = '=== Relevant Context from Past Conversations ===\n\n';

    // Group by conversation
    const byConversation = new Map<string, RAGResult[]>();
    chunks.forEach((chunk) => {
      if (!byConversation.has(chunk.conversationId)) {
        byConversation.set(chunk.conversationId, []);
      }
      byConversation.get(chunk.conversationId)!.push(chunk);
    });

    let conversationIndex = 1;
    for (const [conversationId, conversationChunks] of byConversation) {
      summary += `Conversation ${conversationIndex} (ID: ${conversationId.substring(0, 8)}...):\n`;

      // Sort by turn index
      conversationChunks.sort((a, b) => a.turnIndex - b.turnIndex);

      conversationChunks.forEach((chunk) => {
        const similarityPercent = (chunk.similarity * 100).toFixed(1);
        summary += `  [Turn ${chunk.turnIndex}] ${chunk.speaker} (${similarityPercent}% relevant): ${chunk.textChunk}\n`;
      });

      summary += '\n';
      conversationIndex++;
    }

    return summary;
  }

  /**
   * Get conversation history by conversation ID
   */
  async getConversationHistory(
    conversationId: string,
    limit?: number,
  ): Promise<RAGResult[]> {
    try {
      const query = this.conversationEmbeddingRepository
        .createQueryBuilder('ce')
        .where('ce.conversationId = :conversationId', { conversationId })
        .orderBy('ce.turnIndex', 'ASC');

      if (limit) {
        query.limit(limit);
      }

      const results = await query.getMany();

      return results.map((row) => ({
        conversationId: row.conversationId,
        turnIndex: row.turnIndex,
        speaker: row.speaker,
        textChunk: row.textChunk,
        similarity: 1.0, // Not applicable for direct retrieval
        timestamp: row.timestamp || 0,
      }));
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  /**
   * Find conversations similar to current topic
   */
  async findSimilarConversations(
    query: string,
    limit: number = 5,
  ): Promise<string[]> {
    try {
      const results = await this.semanticSearch(query, limit * 3, 0.7);

      // Get unique conversation IDs
      const conversationIds = [
        ...new Set(results.map((r) => r.conversationId)),
      ].slice(0, limit);

      return conversationIds;
    } catch (error) {
      console.error('Error finding similar conversations:', error);
      return [];
    }
  }
}
