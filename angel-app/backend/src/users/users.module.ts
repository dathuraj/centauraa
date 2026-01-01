import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ClinicalProfileService } from './clinical-profile.service';
import { User } from '../entities/user.entity';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';
import { MoodLog } from '../entities/mood-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Conversation, Message, MoodLog])],
  providers: [UsersService, ClinicalProfileService],
  controllers: [UsersController],
  exports: [UsersService, ClinicalProfileService],
})
export class UsersModule {}