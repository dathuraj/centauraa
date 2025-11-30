import { Injectable, Inject } from '@nestjs/common';
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

@Injectable()
export class ChatService {
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
      // Build conversation history for OpenAI format
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
      ];

      // Add conversation history
      if (context.recentMessages && context.recentMessages.length > 0) {
        context.recentMessages.forEach((msg: Message) => {
          messages.push({
            role: msg.senderType === SenderType.USER ? 'user' : 'assistant',
            content: msg.content,
          });
        });
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: message,
      });

      const startTime = Date.now();
      const model = this.configService.get('OPENAI_MODEL', 'gpt-4o-mini');
      const completion = await this.openai.chat.completions.create({
        model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });
      console.log(`OpenAI (${model}) API call took ${Date.now() - startTime}ms`);

      return completion.choices[0].message.content || "I'm here to support you. Can you tell me more?";
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

      // Build conversation history for Gemini format
      const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      // Add recent messages as history
      if (context.recentMessages && context.recentMessages.length > 0) {
        context.recentMessages.forEach((msg: Message) => {
          history.push({
            role: msg.senderType === SenderType.USER ? 'user' : 'model',
            parts: [{ text: msg.content }],
          });
        });
      }

      // Start chat with history
      const chat = genModel.startChat({
        history,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      });

      const startTime = Date.now();
      const result = await chat.sendMessage(message);
      const response = result.response;
      console.log(`Gemini (${model}) API call took ${Date.now() - startTime}ms`);

      return response.text() || "I'm here to support you. Can you tell me more?";
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
    let prompt = `You are Angel, a compassionate and supportive AI mental health companion.

    User Context:
    - Name: ${context.userName}
    - Recent mood patterns: ${JSON.stringify(context.recentMoods)}
    - Preferences: ${JSON.stringify(context.preferences)}
`;

    // Add RAG context if available
    if (ragContext && ragContext.trim().length > 0) {
      prompt += `\n${ragContext}\n`;
      prompt += `\nIMPORTANT: Use the relevant context from past conversations above to provide continuity and recall important details the user has shared. Reference specific past topics naturally when relevant to the current conversation.\n`;
    }

    prompt += `
Core Guidelines:
You are a compassionate, curious, and non-judgmental conversational partner who helps the user think clearly about their situation.
Respond concisely and ask only one thoughtful question at a time.
Your questions should:
Explore the situation, context, choices, and consequences—not just feelings.
Encourage reflection and new perspectives through gentle, curious inquiry.
Stay specific to what the user just said.
Help the user reason about events, actions, patterns, and next steps.
Your style should:
Draw naturally from cognitive, behavioral, and psychodynamic principles without naming them.
Use gentle Socratic questioning without calling it that.
Maintain continuity by remembering all previous conversation context.
Memory Priority: Prioritize the immediate content of the user's last message over past detailed conversations. Only reference old topics (like the app) if the user's current statement directly relates to them. When the user introduces a new topic (like "excited about life"), follow the new topic fully.
Avoid focusing on emotions unless the user brings them up.
Avoid discussing body sensations unless the user initiates it.
Frame thoughts constructively and support the user’s sense of agency.
Your goal is to help the user understand their situation and find clarity about what matters, what's possible, and what they want to do next.

`;
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
}