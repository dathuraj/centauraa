import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import OpenAI from 'openai';
import { User } from '../entities/user.entity';
import { Conversation } from '../entities/conversation.entity';
import { Message, SenderType } from '../entities/message.entity';
import { MoodLog } from '../entities/mood-log.entity';

@Injectable()
export class ClinicalProfileService {
  private readonly logger = new Logger(ClinicalProfileService.name);
  private openai: OpenAI;
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(MoodLog)
    private moodLogRepository: Repository<MoodLog>,
    private configService: ConfigService,
  ) {
    const openaiKey = this.configService.get('OPENAI_API_KEY');
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    this.enabled = this.configService.get('ENABLE_CLINICAL_PROFILES', 'true') === 'true';

    if (this.enabled) {
      this.logger.log('ClinicalProfileService initialized');
    } else {
      this.logger.log('ClinicalProfileService disabled');
    }
  }

  /**
   * Generate a clinical profile for a user based on their conversation history
   */
  async generateClinicalProfile(userId: string): Promise<string> {
    try {
      const startTime = Date.now();

      // Get user's conversation history (last 90 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const conversations = await this.conversationRepository.find({
        where: {
          user: { id: userId },
          createdAt: MoreThan(cutoffDate),
        },
        relations: ['messages'],
        order: { createdAt: 'DESC' },
        take: 20, // Last 20 conversations
      });

      // Get mood logs (last 90 days)
      const moodLogs = await this.moodLogRepository.find({
        where: {
          user: { id: userId },
          createdAt: MoreThan(cutoffDate),
        },
        order: { createdAt: 'DESC' },
        take: 90,
      });

      // Extract conversation summaries
      const conversationSummaries = conversations.map(conv => {
        const messages = conv.messages || [];
        const userMessages = messages.filter(m => m.senderType === SenderType.USER);
        return {
          date: conv.createdAt,
          messageCount: messages.length,
          userMessageSample: userMessages.slice(0, 3).map(m => m.content.substring(0, 200)).join(' | '),
        };
      });

      // Build prompt for AI to generate clinical profile
      const prompt = this.buildProfileGenerationPrompt(conversationSummaries, moodLogs);

      // Generate profile using OpenAI
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an experienced therapist creating concise clinical profiles for patients based on their conversation history and mood logs.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      const clinicalProfile = response.choices[0]?.message?.content || '';

      this.logger.log(
        `Generated clinical profile for user ${userId} in ${Date.now() - startTime}ms`
      );

      return clinicalProfile;
    } catch (error) {
      this.logger.error(`Error generating clinical profile for user ${userId}:`, error);
      return '';
    }
  }

  /**
   * Update clinical profile for a user
   */
  async updateClinicalProfile(userId: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        this.logger.warn(`User ${userId} not found`);
        return;
      }

      const clinicalProfile = await this.generateClinicalProfile(userId);

      if (clinicalProfile) {
        user.clinicalProfile = clinicalProfile;
        user.clinicalProfileUpdatedAt = new Date();

        await this.userRepository.save(user);

        this.logger.log(`Updated clinical profile for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Error updating clinical profile for user ${userId}:`, error);
    }
  }

  /**
   * Check if clinical profile needs update (older than 30 days)
   */
  shouldUpdateProfile(user: User): boolean {
    if (!user.clinicalProfileUpdatedAt) {
      return true;
    }

    const daysSinceUpdate = Math.floor(
      (Date.now() - user.clinicalProfileUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceUpdate >= 30;
  }

  /**
   * Monthly cron job to update all clinical profiles
   * Runs on the 1st of every month at 2 AM
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async monthlyProfileUpdate() {
    if (!this.enabled) {
      return;
    }

    this.logger.log('Starting monthly clinical profile updates...');

    try {
      // Get all verified users
      const users = await this.userRepository.find({
        where: { isVerified: true },
      });

      this.logger.log(`Found ${users.length} users for profile updates`);

      let updatedCount = 0;
      let skippedCount = 0;

      for (const user of users) {
        if (this.shouldUpdateProfile(user)) {
          await this.updateClinicalProfile(user.id);
          updatedCount++;

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          skippedCount++;
        }
      }

      this.logger.log(
        `Monthly profile update complete: ${updatedCount} updated, ${skippedCount} skipped`
      );
    } catch (error) {
      this.logger.error('Error in monthly profile update:', error);
    }
  }

  /**
   * Build prompt for AI to generate clinical profile
   */
  private buildProfileGenerationPrompt(
    conversations: any[],
    moodLogs: MoodLog[]
  ): string {
    const moodSummary = this.summarizeMoods(moodLogs);

    return `Based on the following information, create a concise clinical profile (max 600 words) for this patient:

**Conversation History (Last 90 Days):**
${conversations.map((conv, i) => `
${i + 1}. Date: ${conv.date.toISOString().split('T')[0]}
   Messages: ${conv.messageCount}
   Sample: ${conv.userMessageSample}
`).join('\n')}

**Mood Patterns:**
${moodSummary}

Please create a clinical profile that includes:
1. **Presenting Concerns**: Main issues the patient discusses
2. **Recurring Themes**: Patterns in conversations
3. **Mood Patterns**: Emotional trends observed
4. **Progress Indicators**: Signs of improvement or areas of concern
5. **Treatment Considerations**: Key points for therapeutic approach

Keep it professional, concise, and focused on actionable insights for therapeutic continuity.`;
  }

  /**
   * Summarize mood logs
   */
  private summarizeMoods(moodLogs: MoodLog[]): string {
    if (moodLogs.length === 0) {
      return 'No mood logs available';
    }

    const moodCounts: { [key: string]: number } = {};
    moodLogs.forEach(log => {
      moodCounts[log.mood] = (moodCounts[log.mood] || 0) + 1;
    });

    const totalLogs = moodLogs.length;
    const moodPercentages = Object.entries(moodCounts)
      .map(([mood, count]) => `${mood}: ${((count / totalLogs) * 100).toFixed(0)}%`)
      .join(', ');

    return `Total logs: ${totalLogs}, Distribution: ${moodPercentages}`;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
