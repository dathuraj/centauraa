import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Message, SenderType } from '../entities/message.entity';
import { Conversation } from '../entities/conversation.entity';
import { WeaviateConfigService } from '../config/weaviate.config';

export interface ConversationSummary {
  conversationId: string;
  title?: string;
  date: Date;
  topics: string[];
  messageCount: number;
  firstMessagePreview: string;
}

export interface SimilarMoment {
  conversationId: string;
  turnIndex: number;
  speaker: string;
  textChunk: string;
  similarity: number;
  timestamp: number;
}

export interface TherapistContext {
  formattedContext: string;
  tokenUsage: {
    totalUsed: number;
    budget: number;
    utilization: string;
    breakdown: {
      currentSession: number;
      recentHistory: number;
      relevantPast: number;
    };
  };
  recentHistoryCount: number;
  similarMomentsCount: number;
}

@Injectable()
export class TherapistContextService {
  private readonly logger = new Logger(TherapistContextService.name);
  private readonly wordsPerToken = 1.33;
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    private configService: ConfigService,
    private weaviateConfig: WeaviateConfigService,
  ) {
    this.enabled = this.configService.get('ENABLE_THERAPIST_CONTEXT', 'true') === 'true';

    if (this.enabled) {
      this.logger.log('TherapistContextService initialized');
    } else {
      this.logger.log('TherapistContextService disabled');
    }
  }

  /**
   * Estimate number of tokens in text
   */
  private estimateTokens(text: string): number {
    const words = text.split(/\s+/).length;
    return Math.ceil(words / this.wordsPerToken);
  }

  /**
   * Build intelligent therapeutic context
   */
  async buildContext(
    currentSession: Message[],
    userId: string,
    conversationId: string,
    tokenBudget: number = 6000,
  ): Promise<TherapistContext> {
    if (!this.enabled) {
      return this.emptyContext(tokenBudget);
    }

    const startTime = Date.now();

    try {
      const context: {
        currentSession: Message[];
        recentHistory: ConversationSummary[];
        relevantPastContext: SimilarMoment[];
        tokenUsage: {
          totalUsed: number;
          budget: number;
          utilization: string;
          breakdown: {
            currentSession: number;
            recentHistory: number;
            relevantPast: number;
          };
        };
      } = {
        currentSession: [],
        recentHistory: [],
        relevantPastContext: [],
        tokenUsage: {
          totalUsed: 0,
          budget: tokenBudget,
          utilization: '0%',
          breakdown: {
            currentSession: 0,
            recentHistory: 0,
            relevantPast: 0,
          },
        },
      };

      let tokensUsed = 0;

      // 1. Current Session (40% of budget) - HIGHEST PRIORITY
      const currentSessionBudget = Math.floor(tokenBudget * 0.4);
      const formattedCurrentSession = this.formatMessages(currentSession);
      let currentSessionTokens = this.estimateTokens(formattedCurrentSession);

      let sessionMessages = currentSession;
      if (currentSessionTokens > currentSessionBudget) {
        // Truncate older messages to fit budget
        sessionMessages = this.truncateMessages(currentSession, currentSessionBudget);
        currentSessionTokens = this.estimateTokens(this.formatMessages(sessionMessages));
      }

      context.currentSession = sessionMessages as any;
      tokensUsed += currentSessionTokens;
      context.tokenUsage.breakdown.currentSession = currentSessionTokens;

      // 2. Recent History (35% of budget)
      const historyBudget = Math.floor(tokenBudget * 0.35);
      const recentConversations = await this.getRecentConversations(userId, 4, 90);

      const historyText = this.formatConversationSummaries(recentConversations);
      const historyTokens = this.estimateTokens(historyText);

      if (historyTokens <= historyBudget) {
        context.recentHistory = recentConversations;
        tokensUsed += historyTokens;
        context.tokenUsage.breakdown.recentHistory = historyTokens;
      } else {
        // Reduce number of conversations to fit budget
        let fittingConversations = recentConversations;
        for (let i = recentConversations.length; i > 0; i--) {
          fittingConversations = recentConversations.slice(0, i);
          const testText = this.formatConversationSummaries(fittingConversations);
          const testTokens = this.estimateTokens(testText);
          if (testTokens <= historyBudget) {
            context.recentHistory = fittingConversations;
            tokensUsed += testTokens;
            context.tokenUsage.breakdown.recentHistory = testTokens;
            break;
          }
        }
      }

      // 3. Relevant Past Context via Semantic Search (25% of budget)
      const similarBudget = Math.floor(tokenBudget * 0.25);

      // Get last user message for semantic search
      const lastUserMessage = currentSession
        .reverse()
        .find((msg) => msg.senderType === SenderType.USER);

      if (lastUserMessage) {
        const similarMoments = await this.searchSimilarConversations(
          lastUserMessage.content,
          userId,
          5,
          0.7,
        );

        const similarText = this.formatSimilarMoments(similarMoments);
        const similarTokens = this.estimateTokens(similarText);

        if (similarTokens <= similarBudget) {
          context.relevantPastContext = similarMoments;
          tokensUsed += similarTokens;
          context.tokenUsage.breakdown.relevantPast = similarTokens;
        } else {
          // Reduce number of results to fit budget
          let fittingMoments = similarMoments;
          for (let i = similarMoments.length; i > 0; i--) {
            fittingMoments = similarMoments.slice(0, i);
            const testText = this.formatSimilarMoments(fittingMoments);
            const testTokens = this.estimateTokens(testText);
            if (testTokens <= similarBudget) {
              context.relevantPastContext = fittingMoments;
              tokensUsed += testTokens;
              context.tokenUsage.breakdown.relevantPast = testTokens;
              break;
            }
          }
        }
      }

      // Update token usage
      context.tokenUsage.totalUsed = tokensUsed;
      context.tokenUsage.utilization = `${((tokensUsed / tokenBudget) * 100).toFixed(1)}%`;

      // Format for LLM
      const formattedContext = this.formatForLLM(context);

      const elapsed = Date.now() - startTime;
      this.logger.debug(
        `Built context in ${elapsed}ms (${context.tokenUsage.utilization} utilization)`,
      );

      return {
        formattedContext,
        tokenUsage: context.tokenUsage,
        recentHistoryCount: context.recentHistory.length,
        similarMomentsCount: context.relevantPastContext.length,
      };
    } catch (error) {
      this.logger.error('Error building context:', error);
      return this.emptyContext(tokenBudget);
    }
  }

  /**
   * Get recent conversations for a user
   */
  private async getRecentConversations(
    userId: string,
    limit: number = 5,
    daysBack: number = 90,
  ): Promise<ConversationSummary[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const conversations = await this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.messages', 'message')
      .where('conversation.userId = :userId', { userId })
      .andWhere('conversation.createdAt >= :cutoffDate', { cutoffDate })
      .orderBy('conversation.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return conversations.map((conv) => this.summarizeConversation(conv));
  }

  /**
   * Summarize a conversation
   */
  private summarizeConversation(conversation: Conversation): ConversationSummary {
    const messages = conversation.messages || [];
    const allText = messages.map((m) => m.content.toLowerCase()).join(' ');

    // Extract topics (simple keyword matching)
    const topicKeywords = {
      anxiety: ['anxiety', 'anxious', 'worried', 'nervous'],
      depression: ['depressed', 'depression', 'sad', 'hopeless'],
      stress: ['stress', 'stressed', 'overwhelmed', 'pressure'],
      sleep: ['sleep', 'insomnia', 'tired', 'exhausted'],
      relationships: ['relationship', 'partner', 'family', 'friend'],
      work: ['work', 'job', 'career', 'boss', 'colleague'],
    };

    const topics: string[] = [];
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((kw) => allText.includes(kw))) {
        topics.push(topic);
      }
    }

    return {
      conversationId: conversation.id,
      title: conversation.title,
      date: conversation.createdAt,
      topics: topics.slice(0, 5),
      messageCount: messages.length,
      firstMessagePreview: messages[0]?.content.substring(0, 100) || '',
    };
  }

  /**
   * Search for similar conversations using Weaviate
   */
  private async searchSimilarConversations(
    query: string,
    userId: string,
    limit: number = 5,
    similarityThreshold: number = 0.7,
  ): Promise<SimilarMoment[]> {
    try {
      const client = this.weaviateConfig.getClient();

      const response = await client.graphql
        .get()
        .withClassName('ConversationEmbedding')
        .withFields('conversationId turnIndex speaker textChunk timestamp _additional { distance }')
        .withNearText({ concepts: [query] })
        .withLimit(limit * 2) // Get extra to filter by threshold
        .do();

      const embeddings = response.data?.Get?.ConversationEmbedding || [];

      // Convert distance to similarity and filter
      const results: SimilarMoment[] = embeddings
        .map((item: any) => {
          const distance = item._additional.distance;
          const similarity = 1 - distance / 2;

          return {
            conversationId: item.conversationId,
            turnIndex: item.turnIndex,
            speaker: item.speaker,
            textChunk: item.textChunk,
            similarity,
            timestamp: item.timestamp || 0,
          };
        })
        .filter((result: SimilarMoment) => result.similarity >= similarityThreshold)
        .sort((a: SimilarMoment, b: SimilarMoment) => b.similarity - a.similarity)
        .slice(0, limit);

      return results;
    } catch (error) {
      this.logger.error('Error in semantic search:', error);
      return [];
    }
  }

  /**
   * Format messages for display
   */
  private formatMessages(messages: Message[]): string {
    return messages
      .map((msg) => {
        const speaker = msg.senderType === SenderType.USER ? 'Patient' : 'Therapist';
        return `[${speaker}]: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Format conversation summaries
   */
  private formatConversationSummaries(summaries: ConversationSummary[]): string {
    return summaries
      .map((summary) => {
        return `Date: ${summary.date.toISOString().split('T')[0]}
Topics: ${summary.topics.join(', ')}
Messages: ${summary.messageCount}`;
      })
      .join('\n\n');
  }

  /**
   * Format similar moments
   */
  private formatSimilarMoments(moments: SimilarMoment[]): string {
    return moments
      .map((moment) => {
        return `[${(moment.similarity * 100).toFixed(0)}%] ${moment.textChunk.substring(0, 200)}`;
      })
      .join('\n\n');
  }

  /**
   * Truncate messages to fit token budget (keep most recent)
   */
  private truncateMessages(messages: Message[], tokenBudget: number): Message[] {
    const truncated: Message[] = [];
    let tokens = 0;

    // Start from most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgText = this.formatMessages([msg]);
      const msgTokens = this.estimateTokens(msgText);

      if (tokens + msgTokens <= tokenBudget) {
        truncated.unshift(msg);
        tokens += msgTokens;
      } else {
        break;
      }
    }

    return truncated;
  }

  /**
   * Format complete context for LLM
   */
  private formatForLLM(context: any): string {
    const sections: string[] = [];

    sections.push('=== THERAPEUTIC CONTEXT ===\n');

    // Recent History
    if (context.recentHistory && context.recentHistory.length > 0) {
      sections.push('=== RECENT CONVERSATION HISTORY ===');
      context.recentHistory.forEach((conv: ConversationSummary, i: number) => {
        const date = new Date(conv.date).toISOString().split('T')[0];
        sections.push(`\nSession ${i + 1} (${date}):`);
        if (conv.title) {
          sections.push(`  Title: ${conv.title}`);
        }
        if (conv.topics.length > 0) {
          sections.push(`  Topics: ${conv.topics.join(', ')}`);
        }
        sections.push(`  Messages: ${conv.messageCount}`);
        if (conv.firstMessagePreview) {
          sections.push(`  Started with: ${conv.firstMessagePreview}...`);
        }
      });
      sections.push('');
    }

    // Relevant Past Context
    if (context.relevantPastContext && context.relevantPastContext.length > 0) {
      sections.push('=== RELEVANT PAST MOMENTS ===');
      sections.push('(Similar situations from past conversations)\n');
      context.relevantPastContext.forEach((past: SimilarMoment, i: number) => {
        const similarityPct = (past.similarity * 100).toFixed(0);
        sections.push(`${i + 1}. [${similarityPct}% relevant]`);
        sections.push(`   ${past.textChunk.substring(0, 200)}...`);
        sections.push('');
      });
    }

    // Current Session
    if (context.currentSession && context.currentSession.length > 0) {
      sections.push('=== CURRENT SESSION ===');
      sections.push(this.formatMessages(context.currentSession));
      sections.push('');
    }

    // Token usage
    sections.push(
      `[Context: ${context.tokenUsage.totalUsed}/${context.tokenUsage.budget} tokens (${context.tokenUsage.utilization})]`,
    );

    return sections.join('\n');
  }

  /**
   * Return empty context
   */
  private emptyContext(tokenBudget: number): TherapistContext {
    return {
      formattedContext: '',
      tokenUsage: {
        totalUsed: 0,
        budget: tokenBudget,
        utilization: '0%',
        breakdown: {
          currentSession: 0,
          recentHistory: 0,
          relevantPast: 0,
        },
      },
      recentHistoryCount: 0,
      similarMomentsCount: 0,
    };
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
