import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { MoodModule } from './mood/mood.module';
import { MailModule } from './mail/mail.module';
import { WeaviateModule } from './weaviate/weaviate.module';
import { PromptsModule } from './prompts/prompts.module';
import { getDatabaseConfig } from './config/database.config';
import { WeaviateConfigService } from './config/weaviate.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000, // 60 seconds
      limit: 60,  // 60 requests per minute (default)
    }]),
    WeaviateModule,
    PromptsModule,
    AuthModule,
    UsersModule,
    ChatModule,
    MoodModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private weaviateConfig: WeaviateConfigService) {}

  async onModuleInit() {
    // Initialize Weaviate schema on application startup
    await this.weaviateConfig.initializeSchema();
    console.log('Weaviate initialized successfully');
  }
}
