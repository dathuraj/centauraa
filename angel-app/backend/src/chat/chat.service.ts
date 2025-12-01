import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Conversation } from '../entities/conversation.entity';
import { Message, SenderType } from '../entities/message.entity';
import { User } from '../entities/user.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { MoodLog } from '../entities/mood-log.entity';
import { RAGService, RAGResult } from './rag.service';
import { ANGEL_CORE_GUIDELINES, ANGEL_ROLE_DESCRIPTION, RAG_INSTRUCTION } from '../prompts/angel-system-prompt';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private aiProvider: 'openai' | 'gemini';

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserPreference)
    private preferenceRepository: Repository<UserPreference>,
    @InjectRepository(MoodLog)
    private moodLogRepository: Repository<MoodLog>,
    private configService: ConfigService,
    private ragService: RAGService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    // Get AI provider from config
    this.aiProvider = this.configService.get('AI_PROVIDER', 'openai') as 'openai' | 'gemini';

    // Initialize OpenAI client
    const openaiKey = this.configService.get('OPENAI_API_KEY');
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    // Initialize Gemini client
    const geminiKey = this.configService.get('GEMINI_API_KEY');
    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
    }

    console.log(`ChatService initialized with AI provider: ${this.aiProvider}`);
  }

  async sendMessage(userId: string, content: string): Promise<Message> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if we need to update user context (once per day on first conversation)
    if (this.shouldUpdateContext(user)) {
      // Generate context asynchronously without blocking the message flow
      this.generateUserContext(user).catch(err =>
        this.logger.error('Failed to generate user context:', err)
      );
    }

    let conversation = await this.conversationRepository.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    if (!conversation) {
      conversation = this.conversationRepository.create({ user });
      await this.conversationRepository.save(conversation);
    }

    const userMessage = this.messageRepository.create({
      conversation,
      content,
      senderType: SenderType.USER,
    });
    await this.messageRepository.save(userMessage);

    const botResponse = await this.generateBotResponse(user, content, conversation.id);

    const botMessage = this.messageRepository.create({
      conversation,
      content: botResponse,
      senderType: SenderType.BOT,
    });

    const savedMessage = await this.messageRepository.save(botMessage);

    // Invalidate caches after new message
    await this.invalidateUserCache(userId, conversation.id);

    return savedMessage;
  }

  async generateBotResponse(user: User, message: string, conversationId: string): Promise<string> {
    const context = await this.getUserContext(user, conversationId);

    // Get RAG context from conversation embeddings (configurable via ENABLE_RAG env var)
    let ragContext: { relevantChunks: RAGResult[]; contextSummary: string } = {
      relevantChunks: [],
      contextSummary: ''
    };

    // Check if RAG is enabled via environment variable
    const isRagEnabled = this.configService.get('ENABLE_RAG', 'false') === 'true';

    if (isRagEnabled) {
      try {
        const startTime = Date.now();
        const ragLimit = parseInt(this.configService.get('RAG_LIMIT', '3')); // Number of similar conversations
        const ragThreshold = parseFloat(this.configService.get('RAG_SIMILARITY_THRESHOLD', '0.5'));

        ragContext = await this.ragService.getRelevantContext(message, {
          limit: ragLimit, // This now means number of similar conversations to retrieve
          similarityThreshold: ragThreshold,
        });

        const numConversations = ragContext.contextSummary ? ragContext.contextSummary.split('--- Conversation').length - 1 : 0;
        console.log(`RAG search took ${Date.now() - startTime}ms, found ${numConversations} similar conversations with ${ragContext.relevantChunks.length} total turns`);
      } catch (error) {
        console.warn('RAG search failed, continuing without context:', error.message);
      }
    } else {
      console.log('RAG is disabled via ENABLE_RAG=false');
    }

    const systemPrompt = this.buildSystemPrompt(context, ragContext.contextSummary);

    // Route to appropriate AI provider
    if (this.aiProvider === 'gemini') {
      return this.generateGeminiResponse(systemPrompt, context, message);
    } else {
      return this.generateOpenAIResponse(systemPrompt, context, message);
    }
  }

  private async generateOpenAIResponse(systemPrompt: string, context: any, message: string): Promise<string> {
    if (!this.openai) {
      return "I'm here to support you. How are you feeling today? (Note: Please add OPENAI_API_KEY to .env file)";
    }

    try {
      // Build messages for OpenAI format (no conversation history, using conversationContext instead)
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: message,
        },
      ];

      const startTime = Date.now();
      const model = this.configService.get('OPENAI_MODEL', 'gpt-4o-mini');

      // Log the full prompt for debugging
      this.logger.log('\n=== OpenAI Prompt Log ===');
      this.logger.log(`Model: ${model}`);
      this.logger.log(`Timestamp: ${new Date().toISOString()}`);
      this.logger.log('\nMessages:');
      messages.forEach((msg, idx) => {
        this.logger.log(`\n[${idx}] Role: ${msg.role}`);
        this.logger.log(`Content: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`);
      });
      this.logger.log('\n========================\n');

      const completion = await this.openai.chat.completions.create({
        model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const responseContent = completion.choices[0].message.content || "I'm here to support you. Can you tell me more?";

      this.logger.log(`OpenAI (${model}) API call took ${Date.now() - startTime}ms`);
      this.logger.log(`\n=== OpenAI Response ===\n${responseContent}\n=====================\n`);

      return responseContent;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      return "I'm here to support you. I'm having a moment of difficulty, but I'm listening. Can you tell me more about how you're feeling?";
    }
  }

  private async generateGeminiResponse(systemPrompt: string, context: any, message: string): Promise<string> {
    if (!this.gemini) {
      return "I'm here to support you. How are you feeling today? (Note: Please add GEMINI_API_KEY to .env file)";
    }

    try {
      const model = this.configService.get('GEMINI_MODEL', 'gemini-1.5-flash');

      // Get model with system instruction
      const genModel = this.gemini.getGenerativeModel({
        model,
        systemInstruction: {
          parts: [{ text: systemPrompt }],
          role: 'system',
        },
      });

      // Start chat without history (using conversationContext instead)
      const chat = genModel.startChat({
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      });

      // Log the full prompt for debugging
      this.logger.log('\n=== Gemini Prompt Log ===');
      this.logger.log(`Model: ${model}`);
      this.logger.log(`Timestamp: ${new Date().toISOString()}`);
      this.logger.log('\nSystem Instruction:');
      this.logger.log(systemPrompt);
      this.logger.log('\nCurrent Message:');
      this.logger.log(message);
      this.logger.log('\n========================\n');

      const startTime = Date.now();
      const result = await chat.sendMessage(message);
      const response = result.response;

      const responseText = response.text() || "I'm here to support you. Can you tell me more?";

      this.logger.log(`Gemini (${model}) API call took ${Date.now() - startTime}ms`);
      this.logger.log(`\n=== Gemini Response ===\n${responseText}\n=====================\n`);

      return responseText;
    } catch (error: any) {
      console.error('Error generating Gemini response:', error);
      if (error.errorDetails) {
        console.error('Gemini error details:', JSON.stringify(error.errorDetails, null, 2));
      }
      if (error.message) {
        console.error('Gemini error message:', error.message);
      }
      return "I'm here to support you. I'm having a moment of difficulty, but I'm listening. Can you tell me more about how you're feeling?";
    }
  }

  private async getUserContext(user: User, conversationId: string): Promise<any> {
    // Check cache first (5 minute TTL for user context)
    const cacheKey = `user_context:${user.id}:${conversationId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const startTime = Date.now();

    // Fetch all data in parallel for speed
    const [preferences, recentMoods, recentMessages] = await Promise.all([
      this.preferenceRepository.find({ where: { user } }),
      this.moodLogRepository.find({
        where: { user },
        order: { createdAt: 'DESC' },
        take: 7,
      }),
      this.messageRepository.find({
        where: { conversation: { id: conversationId } },
        order: { createdAt: 'ASC' },
        take: 10, // Reduced from 20 to 10 for faster queries and less tokens
      }),
    ]);

    console.log(`getUserContext took ${Date.now() - startTime}ms`);

    const context = {
      userName: user.name || 'Friend',
      conversationContext: user.conversationContext || null,
      preferences: preferences.reduce((acc, pref) => {
        acc[pref.key] = pref.value;
        return acc;
      }, {}),
      recentMoods: recentMoods.map(mood => ({
        mood: mood.mood,
        date: mood.createdAt,
        note: mood.note,
      })),
      recentTopics: this.extractTopics(recentMessages),
      recentMessages: recentMessages,
    };

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, context, 300000);

    return context;
  }

  private buildSystemPrompt(context: any, ragContext?: string): string {
    let prompt = `${ANGEL_ROLE_DESCRIPTION}

    User Context:
    - Name: ${context.userName}
    - Recent mood patterns: ${JSON.stringify(context.recentMoods)}
    - Preferences: ${JSON.stringify(context.preferences)}
`;

    // Add user's conversation context if available
    if (context.conversationContext) {
      prompt += `    - Background: ${context.conversationContext}\n`;
    }

    // Add RAG context if available
    if (ragContext && ragContext.trim().length > 0) {
      prompt += `\n${ragContext}\n`;
      prompt += RAG_INSTRUCTION;
    }

    prompt += ANGEL_CORE_GUIDELINES;
    return prompt;
  }


  private extractTopics(messages: Message[]): string[] {
    // Simple topic extraction - can be enhanced with NLP
    const topics = new Set<string>();
    const keywords = ['anxiety', 'depression', 'stress', 'work', 'relationship', 'family', 'sleep'];

    messages.forEach(msg => {
      const lowercaseContent = msg.content.toLowerCase();
      keywords.forEach(keyword => {
        if (lowercaseContent.includes(keyword)) {
          topics.add(keyword);
        }
      });
    });

    return Array.from(topics);
  }

  async getChatHistory(userId: string, limit: number = 50): Promise<Message[]> {
    // Cache chat history for 2 minutes
    const cacheKey = `chat_history:${userId}:${limit}`;
    const cached = await this.cacheManager.get<Message[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const messages = await this.messageRepository.find({
      where: { conversation: { user: { id: userId } } },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['conversation'],
    });

    // Cache for 2 minutes
    await this.cacheManager.set(cacheKey, messages, 120000);

    return messages;
  }

  // Invalidate cache when new message is sent
  async invalidateUserCache(userId: string, conversationId: string): Promise<void> {
    const keys = [
      `user_context:${userId}:${conversationId}`,
      `chat_history:${userId}:50`, // Invalidate default limit cache
    ];

    await Promise.all(keys.map(key => this.cacheManager.del(key)));
  }

  // Check if user context needs updating (once per day)
  private shouldUpdateContext(user: User): boolean {
    if (!user.contextUpdatedAt) {
      return true; // Never been updated
    }

    const lastUpdate = new Date(user.contextUpdatedAt);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

    return hoursSinceUpdate >= 24; // Update once per day
  }

  // Generate user context summary using LLM
  async generateUserContext(user: User): Promise<void> {
    try {
      this.logger.log(`Generating conversation context for user ${user.id}`);

      // Get all conversation history for the user (last 50 messages)
      const messages = await this.messageRepository.find({
        where: { conversation: { user: { id: user.id } } },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      if (messages.length === 0) {
        this.logger.log('No messages found, skipping context generation');
        return;
      }

      // Build conversation history (only user messages)
      const userMessages = messages
        .filter(msg => msg.senderType === SenderType.USER)
        .reverse();

      if (userMessages.length === 0) {
        this.logger.log('No user messages found, skipping context generation');
        return;
      }

      const conversationHistory = userMessages
        .map((msg, idx) => `[${idx + 1}] ${msg.content}`)
        .join('\n\n');

      // Create prompt for LLM to generate context
      const contextPrompt = `Based on the following user messages from conversation history, create a concise summary (2-3 paragraphs) about this user. Include:
1. Key themes and topics they've discussed
2. Important life situations, challenges, or goals mentioned
3. Relevant background information that would help provide better support

Note: These are only the user's messages, not the full conversation.

User Messages:
${conversationHistory}

Generate a comprehensive but concise summary:`;

      let contextSummary = '';

      // Use the configured AI provider to generate context
      if (this.aiProvider === 'gemini' && this.gemini) {
        const model = this.gemini.getGenerativeModel({
          model: this.configService.get('GEMINI_MODEL', 'gemini-1.5-flash'),
        });

        const result = await model.generateContent(contextPrompt);
        contextSummary = result.response.text();
      } else if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: this.configService.get('OPENAI_MODEL', 'gpt-4o-mini'),
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that creates concise user summaries from conversation history.',
            },
            {
              role: 'user',
              content: contextPrompt,
            },
          ],
          temperature: 0.5,
          max_tokens: 500,
        });

        contextSummary = completion.choices[0].message.content || '';
      }

      // Update user's conversation context
      if (contextSummary) {
        user.conversationContext = contextSummary;
        user.contextUpdatedAt = new Date();
        await this.userRepository.save(user);

        this.logger.log(`Context generated and saved for user ${user.id}`);
        this.logger.log(`Generated Context:\n${contextSummary}`);
      }
    } catch (error) {
      this.logger.error('Error generating user context:', error);
      // Don't throw - context generation should not block the chat
    }
  }
}