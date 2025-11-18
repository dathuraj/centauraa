import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Conversation } from '../entities/conversation.entity';
import { Message, SenderType } from '../entities/message.entity';
import { User } from '../entities/user.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { MoodLog } from '../entities/mood-log.entity';

@Injectable()
export class ChatService {
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
  ) {}

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

    return this.messageRepository.save(botMessage);
  }

  async generateBotResponse(user: User, message: string, conversationId: string): Promise<string> {
    const context = await this.getUserContext(user, conversationId);
    const systemPrompt = this.buildSystemPrompt(context);

    const apiKey = this.configService.get('GEMINI_API_KEY');

    if (!apiKey) {
      return "I'm here to support you. How are you feeling today? (Note: Please add GEMINI_API_KEY to .env file)";
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Build conversation history
      const conversationHistory = this.buildConversationHistory(context.recentMessages);

      const fullPrompt = `${systemPrompt}\n\n${conversationHistory}\n\nUser: ${message}\nAngel:`;

      console.log('=== DEBUG: Full Prompt ===');
      console.log(fullPrompt);
      console.log('=== END DEBUG ===');

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating AI response:', error);
      return "I'm here to support you. I'm having a moment of difficulty, but I'm listening. Can you tell me more about how you're feeling?";
    }
  }

  private async getUserContext(user: User, conversationId: string): Promise<any> {
    const preferences = await this.preferenceRepository.find({ where: { user } });
    const recentMoods = await this.moodLogRepository.find({
      where: { user },
      order: { createdAt: 'DESC' },
      take: 7,
    });

    const recentMessages = await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      order: { createdAt: 'ASC' },
      take: 20,
    });

    return {
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
  }

  private buildSystemPrompt(context: any): string {
    return `You are Angel, a compassionate and supportive AI mental health companion.

    User Context:
    - Name: ${context.userName}
    - Recent mood patterns: ${JSON.stringify(context.recentMoods)}
    - Preferences: ${JSON.stringify(context.preferences)}

    Guidelines:
    - Be empathetic, warm, and non-judgmental
    - Be Concise
    - Use CBT, DBT, and Psycho Dynamic techniques
    - Offer supportive responses without providing medical advice
    - Encourage professional help when appropriate
    - Remember previous conversations and show continuity
    - Use active listening techniques
    - Validate feelings while offering gentle perspective`;
  }

  private buildConversationHistory(messages: Message[]): string {
    if (!messages || messages.length === 0) {
      return 'Previous Conversation:\n(This is the start of your conversation)';
    }

    const history = messages.map(msg => {
      const sender = msg.senderType === SenderType.USER ? 'User' : 'Angel';
      return `${sender}: ${msg.content}`;
    }).join('\n');

    return `Previous Conversation:\n${history}`;
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
    return this.messageRepository.find({
      where: { conversation: { user: { id: userId } } },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['conversation'],
    });
  }
}