import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { RAGService } from './rag.service';
import { CrisisDetectionService } from './crisis-detection.service';
import { ContentModerationService } from './content-moderation.service';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';
import { User } from '../entities/user.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { MoodLog } from '../entities/mood-log.entity';
import { WeaviateModule } from '../weaviate/weaviate.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      User,
      UserPreference,
      MoodLog,
    ]),
    WeaviateModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN') },
      }),
      inject: [ConfigService],
    }),
    CacheModule.register({
      ttl: 300000, // Default 5 minutes TTL in milliseconds
      max: 100, // Maximum number of items in cache
    }),
  ],
  providers: [
    ChatService,
    ChatGateway,
    VoiceService,
    RAGService,
    CrisisDetectionService,
    ContentModerationService,
  ],
  controllers: [ChatController, VoiceController],
})
export class ChatModule {}