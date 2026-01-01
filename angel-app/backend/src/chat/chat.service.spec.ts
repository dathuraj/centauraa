import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { RAGService } from './rag.service';
import { PromptsService } from '../prompts/prompts.service';
import { CrisisDetectionService, CrisisLevel } from './crisis-detection.service';
import { ContentModerationService, ModerationAction } from './content-moderation.service';
import { Conversation } from '../entities/conversation.entity';
import { Message, SenderType } from '../entities/message.entity';
import { User } from '../entities/user.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { MoodLog } from '../entities/mood-log.entity';

describe('ChatService', () => {
  let service: ChatService;
  let conversationRepository: Repository<Conversation>;
  let messageRepository: Repository<Message>;
  let userRepository: Repository<User>;
  let preferenceRepository: Repository<UserPreference>;
  let moodLogRepository: Repository<MoodLog>;
  let ragService: RAGService;
  let cacheManager: any;
  let configService: ConfigService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    isVerified: true,
    clinicalProfile: 'User is dealing with anxiety and work-related stress',
    clinicalProfileUpdatedAt: new Date(),
    otp: null,
    otpExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    conversations: [],
    moodLogs: [],
    medications: [],
  };

  const mockConversation: Conversation = {
    id: 'conv-123',
    user: mockUser,
    title: 'Test Conversation',
    createdAt: new Date(),
    messages: [],
  };

  const mockMessage: Message = {
    id: 'msg-123',
    conversation: mockConversation,
    senderType: SenderType.USER,
    content: 'Hello, how are you?',
    createdAt: new Date(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-openai-key',
        OPENAI_MODEL: 'gpt-4o-mini',
        GEMINI_API_KEY: 'test-gemini-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
        ENABLE_RAG: 'false',
        RAG_LIMIT: '3',
        RAG_SIMILARITY_THRESHOLD: '0.5',
      };
      return config[key] || defaultValue;
    }),
  };

  const mockRAGService = {
    getRelevantContext: jest.fn(),
    generateQueryEmbedding: jest.fn(),
    storeEmbedding: jest.fn(),
  };

  const mockCrisisDetectionService = {
    detectCrisis: jest.fn().mockReturnValue({
      level: CrisisLevel.NONE,
      confidence: 0,
      matchedKeywords: [],
      requiresIntervention: false,
      emergencyResources: [],
    }),
    generateCrisisResponse: jest.fn().mockReturnValue(''),
  };

  const mockContentModerationService = {
    validateInput: jest.fn().mockReturnValue({
      valid: true,
      sanitized: 'test message',
      issues: [],
    }),
    moderateInput: jest.fn().mockResolvedValue({
      flagged: false,
      categories: {},
      categoryScores: {},
      action: ModerationAction.ALLOW,
    }),
    moderateOutput: jest.fn().mockResolvedValue({
      flagged: false,
      categories: {},
      categoryScores: {},
      action: ModerationAction.ALLOW,
    }),
    getSafeAlternativeResponse: jest.fn().mockReturnValue('Safe response'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Message),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserPreference),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MoodLog),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RAGService,
          useValue: mockRAGService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: PromptsService,
          useValue: {
            getPrompts: jest.fn().mockReturnValue({
              angelCoreGuidelines: 'Be helpful and empathetic',
              angelRoleDescription: 'You are Angel, a supportive mental health companion',
              ragInstruction: 'Use context to provide personalized responses',
              crisisProtocol: 'Crisis response protocol',
              safetyGuidelines: 'Safety guidelines',
            }),
          },
        },
        {
          provide: CrisisDetectionService,
          useValue: mockCrisisDetectionService,
        },
        {
          provide: ContentModerationService,
          useValue: mockContentModerationService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    conversationRepository = module.get<Repository<Conversation>>(
      getRepositoryToken(Conversation),
    );
    messageRepository = module.get<Repository<Message>>(getRepositoryToken(Message));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    preferenceRepository = module.get<Repository<UserPreference>>(
      getRepositoryToken(UserPreference),
    );
    moodLogRepository = module.get<Repository<MoodLog>>(getRepositoryToken(MoodLog));
    ragService = module.get<RAGService>(RAGService);
    cacheManager = module.get(CACHE_MANAGER);
    configService = module.get<ConfigService>(ConfigService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should create a new conversation if none exists', async () => {
      const mockUserMessage: Message = {
        id: 'msg-user-123',
        conversation: mockConversation,
        senderType: SenderType.USER,
        content: 'Hello',
        createdAt: new Date(),
      };

      const mockBotMessage: Message = {
        id: 'msg-bot-123',
        conversation: mockConversation,
        senderType: SenderType.BOT,
        content: 'I am here to help you.',
        createdAt: new Date(),
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(conversationRepository, 'create').mockReturnValue(mockConversation);
      jest.spyOn(conversationRepository, 'save').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create')
        .mockReturnValueOnce(mockUserMessage)
        .mockReturnValueOnce(mockBotMessage);
      jest.spyOn(messageRepository, 'save')
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockBotMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);
      jest.spyOn(cacheManager, 'del').mockResolvedValue(undefined);
      jest.spyOn(ragService, 'generateQueryEmbedding').mockResolvedValue([0.1, 0.2]);
      jest.spyOn(ragService, 'storeEmbedding').mockResolvedValue(undefined);

      // Mock OpenAI response
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'I am here to help you.' } }],
            }),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.sendMessage(mockUser.id, 'Hello');

      expect(conversationRepository.create).toHaveBeenCalled();
      expect(conversationRepository.save).toHaveBeenCalled();
      expect(messageRepository.save).toHaveBeenCalledTimes(2); // User + Bot message
      expect(result).toBeDefined();
      expect(result.senderType).toBe(SenderType.BOT);
    });

    it('should use existing conversation', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);
      jest.spyOn(cacheManager, 'del').mockResolvedValue(undefined);
      jest.spyOn(ragService, 'generateQueryEmbedding').mockResolvedValue([0.1, 0.2]);
      jest.spyOn(ragService, 'storeEmbedding').mockResolvedValue(undefined);

      // Mock OpenAI response
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'I understand.' } }],
            }),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      await service.sendMessage(mockUser.id, 'How are you?');

      expect(conversationRepository.create).not.toHaveBeenCalled();
      expect(conversationRepository.findOne).toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.sendMessage('invalid-id', 'Hello')).rejects.toThrow(
        'User not found',
      );
    });

    it('should store embeddings for RAG', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([mockMessage]);
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);
      jest.spyOn(cacheManager, 'del').mockResolvedValue(undefined);
      jest.spyOn(ragService, 'generateQueryEmbedding').mockResolvedValue([0.1, 0.2]);
      jest.spyOn(ragService, 'storeEmbedding').mockResolvedValue(undefined);

      // Mock OpenAI response
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response' } }],
            }),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      await service.sendMessage(mockUser.id, 'Test message');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if embedding methods were called
      expect(ragService.generateQueryEmbedding).toHaveBeenCalled();
    });
  });

  describe('generateBotResponse', () => {
    it('should use OpenAI when provider is openai', async () => {
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'OpenAI response' } }],
            }),
          },
        },
      };
      (service as any).openai = mockOpenAI;
      (service as any).aiProvider = 'openai';

      const response = await service.generateBotResponse(
        mockUser,
        'Hello',
        mockConversation.id,
      );

      expect(response).toBe('OpenAI response');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should use Gemini when provider is gemini', async () => {
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);

      const mockGemini = {
        getGenerativeModel: jest.fn().mockReturnValue({
          startChat: jest.fn().mockReturnValue({
            sendMessage: jest.fn().mockResolvedValue({
              response: {
                text: jest.fn().mockReturnValue('Gemini response'),
              },
            }),
          }),
        }),
      };
      (service as any).gemini = mockGemini;
      (service as any).aiProvider = 'gemini';

      const response = await service.generateBotResponse(
        mockUser,
        'Hello',
        mockConversation.id,
      );

      expect(response).toBe('Gemini response');
      expect(mockGemini.getGenerativeModel).toHaveBeenCalled();
    });

    it('should include RAG context when enabled', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'ENABLE_RAG') return 'true';
        if (key === 'RAG_LIMIT') return '3';
        if (key === 'RAG_SIMILARITY_THRESHOLD') return '0.5';
        if (key === 'AI_PROVIDER') return 'openai';
        if (key === 'OPENAI_MODEL') return 'gpt-4o-mini';
        return defaultValue;
      });

      jest.spyOn(ragService, 'getRelevantContext').mockResolvedValue({
        relevantChunks: [],
        contextSummary: 'Previous conversation about anxiety',
      });

      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'Response with RAG context' } }],
            }),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      await service.generateBotResponse(mockUser, 'I feel anxious', mockConversation.id);

      expect(ragService.getRelevantContext).toHaveBeenCalled();
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle OpenAI errors gracefully', async () => {
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };
      (service as any).openai = mockOpenAI;
      (service as any).aiProvider = 'openai';

      const response = await service.generateBotResponse(
        mockUser,
        'Hello',
        mockConversation.id,
      );

      expect(response).toContain("I'm here to support you");
    });
  });

  describe('getChatHistory', () => {
    it('should return cached chat history if available', async () => {
      const cachedMessages = [mockMessage];
      jest.spyOn(cacheManager, 'get').mockResolvedValue(cachedMessages);

      const result = await service.getChatHistory(mockUser.id, 50);

      expect(result).toEqual(cachedMessages);
      expect(messageRepository.find).not.toHaveBeenCalled();
    });

    it('should fetch and cache chat history if not cached', async () => {
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([mockMessage]);

      const result = await service.getChatHistory(mockUser.id, 50);

      expect(result).toEqual([mockMessage]);
      expect(messageRepository.find).toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it('should respect the limit parameter', async () => {
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);

      await service.getChatHistory(mockUser.id, 10);

      expect(messageRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('invalidateUserCache', () => {
    it('should delete relevant cache keys', async () => {
      jest.spyOn(cacheManager, 'del').mockResolvedValue(undefined);

      await service.invalidateUserCache(mockUser.id, mockConversation.id);

      expect(cacheManager.del).toHaveBeenCalledTimes(2);
      expect(cacheManager.del).toHaveBeenCalledWith(
        `user_context:${mockUser.id}:${mockConversation.id}`,
      );
      expect(cacheManager.del).toHaveBeenCalledWith(`chat_history:${mockUser.id}:50`);
    });
  });

  describe('generateUserContext', () => {
    it('should generate user context using OpenAI', async () => {
      const messages = [
        { ...mockMessage, senderType: SenderType.USER, content: 'I feel anxious' },
        { ...mockMessage, senderType: SenderType.BOT, content: 'Tell me more' },
        { ...mockMessage, senderType: SenderType.USER, content: 'Work stress' },
      ];
      jest.spyOn(messageRepository, 'find').mockResolvedValue(messages);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: 'User is experiencing work-related anxiety',
                  },
                },
              ],
            }),
          },
        },
      };
      (service as any).openai = mockOpenAI;
      (service as any).aiProvider = 'openai';

      await service.generateUserContext(mockUser);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should skip if no messages exist', async () => {
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);

      await service.generateUserContext(mockUser);

      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(messageRepository, 'find').mockRejectedValue(new Error('DB Error'));

      await expect(service.generateUserContext(mockUser)).resolves.not.toThrow();
    });
  });

  describe('getUserContext', () => {
    it('should return cached context if available', async () => {
      const cachedContext = { userName: 'Test User', preferences: {} };
      jest.spyOn(cacheManager, 'get').mockResolvedValue(cachedContext);

      const result = await (service as any).getUserContext(
        mockUser,
        mockConversation.id,
      );

      expect(result).toEqual(cachedContext);
      expect(preferenceRepository.find).not.toHaveBeenCalled();
    });

    it('should fetch and cache context if not cached', async () => {
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined);
      jest.spyOn(preferenceRepository, 'find').mockResolvedValue([]);
      jest.spyOn(moodLogRepository, 'find').mockResolvedValue([]);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);

      const result = await (service as any).getUserContext(
        mockUser,
        mockConversation.id,
      );

      expect(result).toBeDefined();
      expect(result.userName).toBe(mockUser.name);
      expect(cacheManager.set).toHaveBeenCalled();
    });
  });
});
