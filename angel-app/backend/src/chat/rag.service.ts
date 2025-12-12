import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { WeaviateConfigService } from '../config/weaviate.config';

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
    private weaviateConfig: WeaviateConfigService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Store conversation embedding in Weaviate
   */
  async storeEmbedding(
    conversationId: string,
    turnIndex: number,
    speaker: string,
    textChunk: string,
    embedding: number[],
    timestamp?: number,
  ): Promise<void> {
    try {
      const client = this.weaviateConfig.getClient();

      await client.data
        .creator()
        .withClassName('ConversationEmbedding')
        .withProperties({
          conversationId,
          turnIndex,
          speaker,
          textChunk,
          timestamp: timestamp || Date.now(),
        })
        .withVector(embedding)
        .do();

      console.log(`Stored embedding for conversation ${conversationId}, turn ${turnIndex}`);
    } catch (error) {
      console.error('Error storing embedding in Weaviate:', error);
      throw error;
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
   * Perform semantic search across all conversation embeddings using Weaviate
   */
  async semanticSearch(
    query: string,
    limit: number = 10,
    similarityThreshold: number = 0.7,
  ): Promise<RAGResult[]> {
    try {
      const queryEmbedding = await this.generateQueryEmbedding(query);
      const client = this.weaviateConfig.getClient();

      const response = await client.graphql
        .get()
        .withClassName('ConversationEmbedding')
        .withFields('conversationId turnIndex speaker textChunk timestamp _additional { distance }')
        .withNearVector({ vector: queryEmbedding })
        .withLimit(limit * 2) // Get extra results to filter by threshold
        .do();

      const results = response.data.Get.ConversationEmbedding || [];

      // Convert distance to similarity (cosine distance: 0 = identical, 2 = opposite)
      // Similarity = 1 - (distance / 2) to get 0-1 scale
      return results
        .map((item: any) => ({
          conversationId: item.conversationId,
          turnIndex: item.turnIndex,
          speaker: item.speaker,
          textChunk: item.textChunk,
          similarity: 1 - (item._additional.distance / 2),
          timestamp: item.timestamp || 0,
        }))
        .filter((result: RAGResult) => result.similarity >= similarityThreshold)
        .slice(0, limit);
    } catch (error) {
      console.error('Error performing semantic search:', error);
      return [];
    }
  }

  /**
   * Search within a specific conversation using Weaviate
   */
  async searchInConversation(
    conversationId: string,
    query: string,
    limit: number = 5,
  ): Promise<RAGResult[]> {
    try {
      const queryEmbedding = await this.generateQueryEmbedding(query);
      const client = this.weaviateConfig.getClient();

      const response = await client.graphql
        .get()
        .withClassName('ConversationEmbedding')
        .withFields('conversationId turnIndex speaker textChunk timestamp _additional { distance }')
        .withNearVector({ vector: queryEmbedding })
        .withWhere({
          path: ['conversationId'],
          operator: 'Equal',
          valueText: conversationId,
        })
        .withLimit(limit)
        .do();

      const results = response.data.Get.ConversationEmbedding || [];

      return results.map((item: any) => ({
        conversationId: item.conversationId,
        turnIndex: item.turnIndex,
        speaker: item.speaker,
        textChunk: item.textChunk,
        similarity: 1 - (item._additional.distance / 2),
        timestamp: item.timestamp || 0,
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
   * Search for similar chunks (speaker filter removed to support MIXED speaker data)
   */
  private async semanticSearchByRole(
    query: string,
    role: 'CUSTOMER' | 'AGENT',
    limit: number,
    similarityThreshold: number,
  ): Promise<RAGResult[]> {
    try {
      const queryEmbedding = await this.generateQueryEmbedding(query);
      const client = this.weaviateConfig.getClient();

      const response = await client.graphql
        .get()
        .withClassName('ConversationEmbedding')
        .withFields('conversationId turnIndex speaker textChunk timestamp _additional { distance }')
        .withNearVector({ vector: queryEmbedding })
        // Speaker filter removed to support MIXED speaker type from data pipeline
        // .withWhere({
        //   path: ['speaker'],
        //   operator: 'Equal',
        //   valueText: role,
        // })
        .withLimit(limit * 2)
        .do();

      const results = response.data.Get.ConversationEmbedding || [];

      return results
        .map((item: any) => ({
          conversationId: item.conversationId,
          turnIndex: item.turnIndex,
          speaker: item.speaker,
          textChunk: item.textChunk,
          similarity: 1 - (item._additional.distance / 2),
          timestamp: item.timestamp || 0,
        }))
        .filter((result: RAGResult) => result.similarity >= similarityThreshold)
        .slice(0, limit);
    } catch (error) {
      console.error('Error in semanticSearchByRole:', error);
      return [];
    }
  }

  /**
   * Get entire conversations by conversation IDs using Weaviate
   */
  private async getEntireConversations(
    conversationIds: string[],
  ): Promise<Array<{ conversationId: string; chunks: RAGResult[] }>> {
    const conversations: Array<{ conversationId: string; chunks: RAGResult[] }> = [];
    const client = this.weaviateConfig.getClient();

    for (const conversationId of conversationIds) {
      try {
        const response = await client.graphql
          .get()
          .withClassName('ConversationEmbedding')
          .withFields('conversationId turnIndex speaker textChunk timestamp')
          .withWhere({
            path: ['conversationId'],
            operator: 'Equal',
            valueText: conversationId,
          })
          .withLimit(1000) // Get all turns in the conversation
          .do();

        const chunks = response.data.Get.ConversationEmbedding || [];

        if (chunks.length > 0) {
          // Sort by turn index
          const sortedChunks = chunks
            .map((item: any) => ({
              conversationId: item.conversationId,
              turnIndex: item.turnIndex,
              speaker: item.speaker,
              textChunk: item.textChunk,
              similarity: 1.0, // Full conversation, not similarity-based
              timestamp: item.timestamp || 0,
            }))
            .sort((a: RAGResult, b: RAGResult) => a.turnIndex - b.turnIndex);

          conversations.push({
            conversationId,
            chunks: sortedChunks,
          });
        }
      } catch (error) {
        console.error(`Error fetching conversation ${conversationId}:`, error);
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
   * Get conversation history by conversation ID using Weaviate
   */
  async getConversationHistory(
    conversationId: string,
    limit?: number,
  ): Promise<RAGResult[]> {
    try {
      const client = this.weaviateConfig.getClient();

      const query = client.graphql
        .get()
        .withClassName('ConversationEmbedding')
        .withFields('conversationId turnIndex speaker textChunk timestamp')
        .withWhere({
          path: ['conversationId'],
          operator: 'Equal',
          valueText: conversationId,
        });

      if (limit) {
        query.withLimit(limit);
      } else {
        query.withLimit(1000);
      }

      const response = await query.do();
      const results = response.data.Get.ConversationEmbedding || [];

      return results
        .map((item: any) => ({
          conversationId: item.conversationId,
          turnIndex: item.turnIndex,
          speaker: item.speaker,
          textChunk: item.textChunk,
          similarity: 1.0, // Not applicable for direct retrieval
          timestamp: item.timestamp || 0,
        }))
        .sort((a: RAGResult, b: RAGResult) => a.turnIndex - b.turnIndex);
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
