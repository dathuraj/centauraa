import { Controller, Post, Get, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Request() req, @Body('message') message: string) {
    return this.chatService.sendMessage(req.user.userId, message);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getChatHistory(@Request() req, @Query('limit') limit?: number) {
    return this.chatService.getChatHistory(req.user.userId, limit);
  }
}