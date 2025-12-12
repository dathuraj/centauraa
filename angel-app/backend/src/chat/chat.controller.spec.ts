import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SenderType } from '../entities/message.entity';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

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
    content: 'Hello, how can I help you today?',
    createdAt: new Date(),
  };

  const mockChatService = {
    sendMessage: jest.fn(),
    getChatHistory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send a message and return bot response', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      };
      const message = 'Hello, I need help';

      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);

      const result = await controller.sendMessage(mockRequest, message);

      expect(chatService.sendMessage).toHaveBeenCalledWith('user-123', message);
      expect(result).toEqual(mockMessage);
    });

    it('should handle user ID from JWT token', async () => {
      const mockRequest = {
        user: { userId: 'different-user-id' },
      };
      const message = 'Test message';

      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);

      await controller.sendMessage(mockRequest, message);

      expect(chatService.sendMessage).toHaveBeenCalledWith(
        'different-user-id',
        message,
      );
    });

    it('should propagate errors from chat service', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      };
      const message = 'Test message';
      const error = new Error('Service error');

      jest.spyOn(chatService, 'sendMessage').mockRejectedValue(error);

      await expect(controller.sendMessage(mockRequest, message)).rejects.toThrow(
        'Service error',
      );
    });
  });

  describe('getChatHistory', () => {
    it('should return chat history with default limit', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      };
      const mockHistory = [mockMessage];

      jest.spyOn(chatService, 'getChatHistory').mockResolvedValue(mockHistory);

      const result = await controller.getChatHistory(mockRequest);

      expect(chatService.getChatHistory).toHaveBeenCalledWith('user-123', undefined);
      expect(result).toEqual(mockHistory);
    });

    it('should return chat history with custom limit', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      };
      const mockHistory = [mockMessage];
      const limit = 10;

      jest.spyOn(chatService, 'getChatHistory').mockResolvedValue(mockHistory);

      const result = await controller.getChatHistory(mockRequest, limit);

      expect(chatService.getChatHistory).toHaveBeenCalledWith('user-123', limit);
      expect(result).toEqual(mockHistory);
    });

    it('should handle empty chat history', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      };

      jest.spyOn(chatService, 'getChatHistory').mockResolvedValue([]);

      const result = await controller.getChatHistory(mockRequest);

      expect(result).toEqual([]);
    });

    it('should propagate errors from chat service', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      };
      const error = new Error('Database error');

      jest.spyOn(chatService, 'getChatHistory').mockRejectedValue(error);

      await expect(controller.getChatHistory(mockRequest)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('JWT Guard Protection', () => {
    it('should require JWT authentication for sendMessage', () => {
      const guards = Reflect.getMetadata('__guards__', controller.sendMessage);
      expect(guards).toBeDefined();
    });

    it('should require JWT authentication for getChatHistory', () => {
      const guards = Reflect.getMetadata('__guards__', controller.getChatHistory);
      expect(guards).toBeDefined();
    });
  });
});
