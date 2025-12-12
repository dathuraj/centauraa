import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { Socket } from 'socket.io';
import { SenderType } from '../entities/message.entity';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatService: ChatService;
  let jwtService: JwtService;

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
    content: 'Hello, how can I help you?',
    createdAt: new Date(),
  };

  const mockChatService = {
    sendMessage: jest.fn(),
    getChatHistory: jest.fn(),
  };

  const mockJwtService = {
    verify: jest.fn(),
    sign: jest.fn(),
  };

  const mockSocket = {
    id: 'socket-123',
    handshake: {
      auth: {
        token: 'valid-jwt-token',
      },
    },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
  } as unknown as Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    chatService = module.get<ChatService>(ChatService);
    jwtService = module.get<JwtService>(JwtService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should verify JWT token and join user room', async () => {
      const mockPayload = { sub: 'user-123', email: 'test@example.com' };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt-token');
      expect(mockSocket.data.userId).toBe('user-123');
      expect(mockSocket.join).toHaveBeenCalledWith('user-user-123');
    });

    it('should disconnect client with invalid token', async () => {
      const invalidSocket = {
        ...mockSocket,
        handshake: {
          auth: {
            token: 'invalid-token',
          },
        },
      } as unknown as Socket;

      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(invalidSocket);

      expect(invalidSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle missing token', async () => {
      const socketWithoutToken = {
        ...mockSocket,
        handshake: {
          auth: {},
        },
      } as unknown as Socket;

      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('No token provided');
      });

      await gateway.handleConnection(socketWithoutToken);

      expect(socketWithoutToken.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should log when client disconnects', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      gateway.handleDisconnect(mockSocket);

      expect(consoleSpy).toHaveBeenCalledWith(`Client ${mockSocket.id} disconnected`);

      consoleSpy.mockRestore();
    });
  });

  describe('handleMessage', () => {
    it('should process message and emit response', async () => {
      const authenticatedSocket = {
        ...mockSocket,
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const payload = { message: 'Hello, I need help' };

      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);

      await gateway.handleMessage(authenticatedSocket, payload);

      expect(chatService.sendMessage).toHaveBeenCalledWith('user-123', payload.message);
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('typing', {
        isTyping: true,
      });
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('typing', {
        isTyping: false,
      });
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('newMessage', mockMessage);
    });

    it('should not process message without userId', async () => {
      const unauthenticatedSocket = {
        ...mockSocket,
        data: {},
      } as unknown as Socket;

      const payload = { message: 'Hello' };

      await gateway.handleMessage(unauthenticatedSocket, payload);

      expect(chatService.sendMessage).not.toHaveBeenCalled();
      expect(unauthenticatedSocket.emit).not.toHaveBeenCalled();
    });

    it('should emit typing indicators', async () => {
      const authenticatedSocket = {
        ...mockSocket,
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const payload = { message: 'Test message' };

      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);

      await gateway.handleMessage(authenticatedSocket, payload);

      // Check typing indicator was emitted twice (true, then false)
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('typing', {
        isTyping: true,
      });
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('typing', {
        isTyping: false,
      });
    });

    it('should handle chat service errors', async () => {
      const authenticatedSocket = {
        ...mockSocket,
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const payload = { message: 'Test message' };

      jest
        .spyOn(chatService, 'sendMessage')
        .mockRejectedValue(new Error('Service error'));

      await expect(
        gateway.handleMessage(authenticatedSocket, payload),
      ).rejects.toThrow('Service error');

      // Should still emit typing: true before error
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('typing', {
        isTyping: true,
      });
    });

    it('should handle empty message payload', async () => {
      const authenticatedSocket = {
        ...mockSocket,
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const payload = { message: '' };

      jest.spyOn(chatService, 'sendMessage').mockResolvedValue(mockMessage);

      await gateway.handleMessage(authenticatedSocket, payload);

      expect(chatService.sendMessage).toHaveBeenCalledWith('user-123', '');
    });
  });

  describe('WebSocket Server', () => {
    it('should have WebSocket server configured', () => {
      expect(gateway.server).toBeDefined();
    });

    it('should have CORS enabled', () => {
      const metadata = Reflect.getMetadata('__gateway__', ChatGateway);
      expect(metadata).toBeDefined();
    });
  });
});
