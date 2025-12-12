import { Test, TestingModule } from '@nestjs/testing';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { ChatService } from './chat.service';
import { Response } from 'express';
import { HttpStatus } from '@nestjs/common';
import { SenderType } from '../entities/message.entity';

describe('VoiceController', () => {
  let controller: VoiceController;
  let voiceService: VoiceService;
  let chatService: ChatService;

  const mockVoiceService = {
    processAudioWithWhisper: jest.fn(),
    textToSpeech: jest.fn(),
    detectMimeType: jest.fn(),
  };

  const mockChatService = {
    sendMessage: jest.fn(),
  };

  const mockMessage = {
    id: 'msg-123',
    conversation: {
      id: 'conv-123',
      user: { id: 'user-123' },
      title: 'Test Conversation',
      createdAt: new Date(),
      messages: [],
    },
    senderType: SenderType.BOT,
    content: 'I understand you need help.',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceController],
      providers: [
        {
          provide: VoiceService,
          useValue: mockVoiceService,
        },
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<VoiceController>(VoiceController);
    voiceService = module.get<VoiceService>(VoiceService);
    chatService = module.get<ChatService>(ChatService);

    // Reset all mocks before each test
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendVoiceMessage', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'audio',
      originalname: 'test.m4a',
      encoding: '7bit',
      mimetype: 'audio/m4a',
      buffer: Buffer.from('mock-audio-data'),
      size: 1024,
      stream: null,
      destination: '',
      filename: '',
      path: '',
    };

    const mockRequest = {
      user: { userId: 'user-123' },
    };

    it('should process voice message and return transcription + bot response', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/m4a');
      jest
        .spyOn(voiceService, 'processAudioWithWhisper')
        .mockResolvedValue('Hello, I need help');
      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);
      jest
        .spyOn(voiceService, 'textToSpeech')
        .mockResolvedValue(Buffer.from('audio-response'));

      const result = await controller.sendVoiceMessage(mockFile, mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.userTranscription).toBe('Hello, I need help');
      expect(result.data.botResponse).toBe('I understand you need help.');
      expect(result.data.audioBase64).toBeDefined();
      expect(result.data.messageId).toBe('msg-123');
      expect(voiceService.detectMimeType).toHaveBeenCalledWith(mockFile.buffer);
      expect(voiceService.processAudioWithWhisper).toHaveBeenCalled();
      expect(chatService.sendMessage).toHaveBeenCalledWith('user-123', 'Hello, I need help');
      expect(voiceService.textToSpeech).toHaveBeenCalledWith('I understand you need help.');
    });

    it('should return error if no file provided', async () => {
      const result = await controller.sendVoiceMessage(null, mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No audio file provided');
      expect(voiceService.processAudioWithWhisper).not.toHaveBeenCalled();
    });

    it('should return error if transcription fails', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/m4a');
      jest.spyOn(voiceService, 'processAudioWithWhisper').mockResolvedValue(null);

      const result = await controller.sendVoiceMessage(mockFile, mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not transcribe audio');
      expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle processing errors gracefully', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/m4a');
      jest
        .spyOn(voiceService, 'processAudioWithWhisper')
        .mockRejectedValue(new Error('Whisper API error'));

      const result = await controller.sendVoiceMessage(mockFile, mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to process voice message');
      expect(result.details).toBe('Whisper API error');
    });

    it('should detect correct MIME type', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/caf');
      jest
        .spyOn(voiceService, 'processAudioWithWhisper')
        .mockResolvedValue('Transcription');
      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);
      jest.spyOn(voiceService, 'textToSpeech').mockResolvedValue(Buffer.from('audio'));

      await controller.sendVoiceMessage(mockFile, mockRequest);

      expect(voiceService.detectMimeType).toHaveBeenCalled();
      expect(voiceService.processAudioWithWhisper).toHaveBeenCalledWith(
        mockFile.buffer,
        'audio/caf',
      );
    });

    it('should convert audio response to base64', async () => {
      const audioBuffer = Buffer.from('test-audio-data');
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/m4a');
      jest.spyOn(voiceService, 'processAudioWithWhisper').mockResolvedValue('Test');
      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);
      jest.spyOn(voiceService, 'textToSpeech').mockResolvedValue(audioBuffer);

      const result = await controller.sendVoiceMessage(mockFile, mockRequest);

      expect(result.data.audioBase64).toBe(audioBuffer.toString('base64'));
    });
  });

  describe('synthesizeText', () => {
    it('should synthesize text to speech and return audio', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const audioBuffer = Buffer.from('synthesized-audio');
      jest.spyOn(voiceService, 'textToSpeech').mockResolvedValue(audioBuffer);

      await controller.synthesizeText('Hello world', mockResponse);

      expect(voiceService.textToSpeech).toHaveBeenCalledWith('Hello world');
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Content-Disposition': 'attachment; filename="response.mp3"',
      });
      expect(mockResponse.send).toHaveBeenCalledWith(audioBuffer);
    });

    it('should return error if no text provided', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.synthesizeText('', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'No text provided',
      });
      expect(voiceService.textToSpeech).not.toHaveBeenCalled();
    });

    it('should handle synthesis errors', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      jest.spyOn(voiceService, 'textToSpeech').mockRejectedValue(new Error('TTS Error'));

      await controller.synthesizeText('Hello', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to synthesize speech',
      });
    });
  });

  describe('transcribeAudio', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'audio',
      originalname: 'test.wav',
      encoding: '7bit',
      mimetype: 'audio/wav',
      buffer: Buffer.from('mock-audio-data'),
      size: 2048,
      stream: null,
      destination: '',
      filename: '',
      path: '',
    };

    it('should transcribe audio and return text', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/wav');
      jest
        .spyOn(voiceService, 'processAudioWithWhisper')
        .mockResolvedValue('Transcribed text');

      const result = await controller.transcribeAudio(mockFile);

      expect(result.success).toBe(true);
      expect(result.data.transcription).toBe('Transcribed text');
      expect(voiceService.detectMimeType).toHaveBeenCalledWith(mockFile.buffer);
      expect(voiceService.processAudioWithWhisper).toHaveBeenCalled();
    });

    it('should return error if no file provided', async () => {
      const result = await controller.transcribeAudio(null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No audio file provided');
      expect(voiceService.processAudioWithWhisper).not.toHaveBeenCalled();
    });

    it('should handle transcription errors', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/wav');
      jest
        .spyOn(voiceService, 'processAudioWithWhisper')
        .mockRejectedValue(new Error('Transcription failed'));

      const result = await controller.transcribeAudio(mockFile);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to transcribe audio');
      expect(result.details).toBe('Transcription failed');
    });

    it('should detect MIME type correctly', async () => {
      jest.spyOn(voiceService, 'detectMimeType').mockReturnValue('audio/m4a');
      jest.spyOn(voiceService, 'processAudioWithWhisper').mockResolvedValue('Text');

      await controller.transcribeAudio(mockFile);

      expect(voiceService.detectMimeType).toHaveBeenCalledWith(mockFile.buffer);
      expect(voiceService.processAudioWithWhisper).toHaveBeenCalledWith(
        mockFile.buffer,
        'audio/m4a',
      );
    });
  });

  describe('JWT Guard Protection', () => {
    it('should require JWT authentication for all endpoints', () => {
      const guards = Reflect.getMetadata('__guards__', VoiceController);
      expect(guards).toBeDefined();
    });
  });

  describe('File Upload', () => {
    it('should use FileInterceptor for sendVoiceMessage', () => {
      const interceptors = Reflect.getMetadata(
        '__interceptors__',
        controller.sendVoiceMessage,
      );
      expect(interceptors).toBeDefined();
    });

    it('should use FileInterceptor for transcribeAudio', () => {
      const interceptors = Reflect.getMetadata(
        '__interceptors__',
        controller.transcribeAudio,
      );
      expect(interceptors).toBeDefined();
    });
  });
});
