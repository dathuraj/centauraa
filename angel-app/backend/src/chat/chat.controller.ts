import { Controller, Post, Get, Body, UseGuards, Request, Query, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

interface SendMessageDto {
  message: string;
  conversationId?: string;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 messages per minute
  async sendMessage(
    @Request() req: any,
    @Body() body: SendMessageDto,
  ) {
    // Validate conversationId if provided
    if (body.conversationId && !this.isValidUUID(body.conversationId)) {
      throw new BadRequestException('Invalid conversationId format');
    }

    return this.chatService.sendMessage(req.user.userId, body.message, body.conversationId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getChatHistory(@Request() req: any, @Query('limit') limit?: number) {
    return this.chatService.getChatHistory(req.user.userId, limit);
  }

  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute
  async getConversations(@Request() req: any, @Query('limit') limit?: number) {
    return this.chatService.getConversations(req.user.userId, limit);
  }

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard)
  async getConversation(@Request() req: any, @Param('id') conversationId: string) {
    // Validate UUID format
    if (!this.isValidUUID(conversationId)) {
      throw new BadRequestException('Invalid conversationId format');
    }

    const conversation = await this.chatService.getConversation(req.user.userId, conversationId);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  /**
   * Validate UUID v4 format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}