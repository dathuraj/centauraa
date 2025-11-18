import {
  Controller,
  Post,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Body,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VoiceService } from './voice.service';
import { ChatService } from './chat.service';
import type { Response } from 'express';

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(
    private readonly voiceService: VoiceService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Upload audio, transcribe it with Gemini, get AI response, and return both text and audio
   */
  @Post('message')
  @UseInterceptors(FileInterceptor('audio'))
  async sendVoiceMessage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    try {
      if (!file) {
        return {
          success: false,
          error: 'No audio file provided',
        };
      }

      // Detect MIME type
      const mimeType = this.voiceService.detectMimeType(file.buffer);

      console.log(`Processing audio file: ${mimeType}, size: ${file.size} bytes`);

      // Transcribe audio to text using Gemini multimodal
      const transcription = await this.voiceService.processAudioWithGemini(
        file.buffer,
        mimeType,
      );

      if (!transcription) {
        return {
          success: false,
          error: 'Could not transcribe audio',
        };
      }

      console.log(`Transcription: ${transcription}`);

      // Get AI response through chat service
      const botMessage = await this.chatService.sendMessage(req.user.userId, transcription);

      // Convert bot response to speech
      const audioBuffer = await this.voiceService.textToSpeech(botMessage.content);

      return {
        success: true,
        data: {
          userTranscription: transcription,
          botResponse: botMessage.content,
          audioBase64: audioBuffer.toString('base64'),
          messageId: botMessage.id,
        },
      };
    } catch (error) {
      console.error('Error processing voice message:', error);
      return {
        success: false,
        error: 'Failed to process voice message',
        details: error.message,
      };
    }
  }

  /**
   * Convert text to speech (for regenerating audio from existing messages)
   */
  @Post('synthesize')
  async synthesizeText(@Body('text') text: string, @Res() res: Response) {
    try {
      if (!text) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'No text provided',
        });
      }

      const audioBuffer = await this.voiceService.textToSpeech(text);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Content-Disposition': 'attachment; filename="response.mp3"',
      });

      return res.send(audioBuffer);
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to synthesize speech',
      });
    }
  }

  /**
   * Transcribe audio only (without generating AI response)
   */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) {
        return {
          success: false,
          error: 'No audio file provided',
        };
      }

      const mimeType = this.voiceService.detectMimeType(file.buffer);
      const transcription = await this.voiceService.processAudioWithGemini(
        file.buffer,
        mimeType,
      );

      return {
        success: true,
        data: {
          transcription: transcription,
        },
      };
    } catch (error) {
      console.error('Error transcribing audio:', error);
      return {
        success: false,
        error: 'Failed to transcribe audio',
        details: error.message,
      };
    }
  }
}
