import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MoodLog } from '../entities/mood-log.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class MoodService {
  constructor(
    @InjectRepository(MoodLog)
    private moodLogRepository: Repository<MoodLog>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async logMood(userId: string, mood: number, note?: string): Promise<MoodLog> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    const moodLog = this.moodLogRepository.create({
      user,
      mood,
      note,
    });

    return this.moodLogRepository.save(moodLog);
  }

  async getMoodHistory(userId: string, days: number = 7): Promise<MoodLog[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.moodLogRepository.find({
      where: {
        user: { id: userId },
        createdAt: Between(startDate, new Date()),
      },
      order: { createdAt: 'ASC' },
    });
  }

  async getMoodStats(userId: string, days: number = 30): Promise<any> {
    const moodHistory = await this.getMoodHistory(userId, days);

    if (moodHistory.length === 0) {
      return { average: 0, trend: 'stable', data: [] };
    }

    const average = moodHistory.reduce((sum, log) => sum + log.mood, 0) / moodHistory.length;

    // Calculate trend (simple linear regression)
    const firstHalf = moodHistory.slice(0, Math.floor(moodHistory.length / 2));
    const secondHalf = moodHistory.slice(Math.floor(moodHistory.length / 2));

    const firstAvg = firstHalf.reduce((sum, log) => sum + log.mood, 0) / firstHalf.length || 0;
    const secondAvg = secondHalf.reduce((sum, log) => sum + log.mood, 0) / secondHalf.length || 0;

    let trend = 'stable';
    if (secondAvg > firstAvg + 0.5) trend = 'improving';
    else if (secondAvg < firstAvg - 0.5) trend = 'declining';

    return {
      average: Math.round(average * 10) / 10,
      trend,
      data: moodHistory,
    };
  }
}