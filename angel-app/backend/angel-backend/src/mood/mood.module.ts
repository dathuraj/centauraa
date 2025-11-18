import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoodService } from './mood.service';
import { MoodController } from './mood.controller';
import { MoodLog } from '../entities/mood-log.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MoodLog, User])],
  providers: [MoodService],
  controllers: [MoodController],
})
export class MoodModule {}