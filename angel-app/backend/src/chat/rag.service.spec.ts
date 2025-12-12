import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RAGService, RAGResult } from './rag.service';
import { WeaviateConfigService } from '../config/weaviate.config';

describe('RAGService', () => {
  let service: RAGService;
  let weaviateConfig: WeaviateConfigService;
  let configService: ConfigService;

  const mockRAGResult: RAGResult = {
    conversationId: 'conv-123',
    turnIndex: 0,
    speaker: 'CUSTOMER',
    textChunk: 'I am feeling anxious',
    similarity: 0.85,
    timestamp: Date.now(),
  };

  const mockWeaviateClient = {
    data: {
      creator: jest.fn().mockReturnThis(),
      withClassName: jest.fn().mockReturnThis(),
      withProperties: jest.fn().mockReturnThis(),
      withVector: jest.fn().mockReturnThis(),
      do: jest.fn().mockResolvedValue({}),
    },
    graphql: {
      get: jest.fn().mockReturnThis(),
      withClassName: jest.fn().mockReturnThis(),
      withFields: jest.fn().mockReturnThis(),
      withNearVector: jest.fn().mockReturnThis(),
      withWhere: jest.fn().mockReturnThis(),
      withLimit: jest.fn().mockReturnThis(),
      do: jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: [],
          },
        },
      }),
    },
  };

  const mockWeaviateConfig = {
    getClient: jest.fn().mockReturnValue(mockWeaviateClient),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        OPENAI_API_KEY: 'test-openai-key',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RAGService,
        {
          provide: WeaviateConfigService,
          useValue: mockWeaviateConfig,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RAGService>(RAGService);
    weaviateConfig = module.get<WeaviateConfigService>(WeaviateConfigService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset all mocks before each test
    jest.clearAllMocks();

    // Reset mock chain
    mockWeaviateClient.data.creator = jest.fn().mockReturnThis();
    mockWeaviateClient.data.withClassName = jest.fn().mockReturnThis();
    mockWeaviateClient.data.withProperties = jest.fn().mockReturnThis();
    mockWeaviateClient.data.withVector = jest.fn().mockReturnThis();
    mockWeaviateClient.data.do = jest.fn().mockResolvedValue({});

    mockWeaviateClient.graphql.get = jest.fn().mockReturnThis();
    mockWeaviateClient.graphql.withClassName = jest.fn().mockReturnThis();
    mockWeaviateClient.graphql.withFields = jest.fn().mockReturnThis();
    mockWeaviateClient.graphql.withNearVector = jest.fn().mockReturnThis();
    mockWeaviateClient.graphql.withWhere = jest.fn().mockReturnThis();
    mockWeaviateClient.graphql.withLimit = jest.fn().mockReturnThis();
    mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
      data: {
        Get: {
          ConversationEmbedding: [],
        },
      },
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateQueryEmbedding', () => {
    it('should generate embedding using OpenAI', async () => {
      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.generateQueryEmbedding('Test query');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Test query',
        encoding_format: 'float',
      });
    });

    it('should throw error if OpenAI is not configured', async () => {
      (service as any).openai = null;

      await expect(service.generateQueryEmbedding('Test')).rejects.toThrow(
        'OpenAI API key not configured',
      );
    });

    it('should handle OpenAI API errors', async () => {
      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockRejectedValue(new Error('API Error')),
        },
      };
      (service as any).openai = mockOpenAI;

      await expect(service.generateQueryEmbedding('Test')).rejects.toThrow();
    });
  });

  describe('storeEmbedding', () => {
    it('should store embedding in Weaviate', async () => {
      const embedding = [0.1, 0.2, 0.3];

      await service.storeEmbedding(
        'conv-123',
        0,
        'CUSTOMER',
        'Test message',
        embedding,
        Date.now(),
      );

      expect(mockWeaviateClient.data.creator).toHaveBeenCalled();
      expect(mockWeaviateClient.data.withClassName).toHaveBeenCalledWith(
        'ConversationEmbedding',
      );
      expect(mockWeaviateClient.data.withProperties).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Test message',
        }),
      );
      expect(mockWeaviateClient.data.withVector).toHaveBeenCalledWith(embedding);
      expect(mockWeaviateClient.data.do).toHaveBeenCalled();
    });

    it('should use current timestamp if not provided', async () => {
      const embedding = [0.1, 0.2];
      const beforeTime = Date.now();

      await service.storeEmbedding('conv-123', 0, 'AGENT', 'Response', embedding);

      const afterTime = Date.now();
      const callArgs = mockWeaviateClient.data.withProperties.mock.calls[0][0];

      expect(callArgs.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(callArgs.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle Weaviate errors', async () => {
      mockWeaviateClient.data.do = jest
        .fn()
        .mockRejectedValue(new Error('Weaviate error'));

      await expect(
        service.storeEmbedding('conv-123', 0, 'CUSTOMER', 'Test', [0.1]),
      ).rejects.toThrow('Weaviate error');
    });
  });

  describe('semanticSearch', () => {
    it('should perform semantic search and return results', async () => {
      const mockResults = [
        {
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'I feel anxious',
          timestamp: Date.now(),
          _additional: { distance: 0.3 }, // Low distance = high similarity
        },
      ];

      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: mockResults,
          },
        },
      });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1, 0.2] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const results = await service.semanticSearch('feeling anxious', 10, 0.7);

      expect(results).toHaveLength(1);
      expect(results[0].conversationId).toBe('conv-123');
      expect(results[0].similarity).toBeGreaterThan(0.7);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalled();
      expect(mockWeaviateClient.graphql.withNearVector).toHaveBeenCalled();
    });

    it('should filter results by similarity threshold', async () => {
      const mockResults = [
        {
          conversationId: 'conv-1',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Test 1',
          timestamp: Date.now(),
          _additional: { distance: 0.2 }, // Similarity = 0.9
        },
        {
          conversationId: 'conv-2',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Test 2',
          timestamp: Date.now(),
          _additional: { distance: 1.5 }, // Similarity = 0.25 (below threshold)
        },
      ];

      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: mockResults,
          },
        },
      });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const results = await service.semanticSearch('query', 10, 0.5);

      expect(results).toHaveLength(1); // Only the high similarity result
      expect(results[0].conversationId).toBe('conv-1');
    });

    it('should handle empty results', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: [],
          },
        },
      });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const results = await service.semanticSearch('query', 10, 0.7);

      expect(results).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
      mockWeaviateClient.graphql.do = jest
        .fn()
        .mockRejectedValue(new Error('Search failed'));

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const results = await service.semanticSearch('query', 10, 0.7);

      expect(results).toEqual([]);
    });
  });

  describe('searchInConversation', () => {
    it('should search within specific conversation', async () => {
      const mockResults = [
        {
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Message in conversation',
          timestamp: Date.now(),
          _additional: { distance: 0.4 },
        },
      ];

      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: mockResults,
          },
        },
      });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const results = await service.searchInConversation('conv-123', 'test query', 5);

      expect(results).toHaveLength(1);
      expect(results[0].conversationId).toBe('conv-123');
      expect(mockWeaviateClient.graphql.withWhere).toHaveBeenCalledWith({
        path: ['conversationId'],
        operator: 'Equal',
        valueText: 'conv-123',
      });
    });

    it('should handle errors gracefully', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockRejectedValue(new Error('Error'));

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const results = await service.searchInConversation('conv-123', 'query', 5);

      expect(results).toEqual([]);
    });
  });

  describe('getRelevantContext', () => {
    it('should return relevant context with similar conversations', async () => {
      const mockCustomerChunks = [
        {
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'I feel anxious',
          timestamp: Date.now(),
          _additional: { distance: 0.3 },
        },
      ];

      const mockConversationChunks = [
        {
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'I feel anxious',
          timestamp: Date.now(),
        },
        {
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'AGENT',
          textChunk: 'Tell me more',
          timestamp: Date.now() + 1,
        },
      ];

      // Mock for semantic search (finding similar customer messages)
      mockWeaviateClient.graphql.do = jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            Get: {
              ConversationEmbedding: mockCustomerChunks,
            },
          },
        })
        // Mock for getting entire conversation
        .mockResolvedValueOnce({
          data: {
            Get: {
              ConversationEmbedding: mockConversationChunks,
            },
          },
        });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.getRelevantContext('feeling anxious', {
        limit: 3,
        similarityThreshold: 0.7,
      });

      expect(result.relevantChunks.length).toBeGreaterThan(0);
      expect(result.contextSummary).toContain('Similar Past Conversations');
    });

    it('should handle empty results', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: [],
          },
        },
      });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.getRelevantContext('query');

      expect(result.relevantChunks).toEqual([]);
      expect(result.contextSummary).toBe('');
    });

    it('should handle errors gracefully', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockRejectedValue(new Error('Error'));

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.getRelevantContext('query');

      expect(result.relevantChunks).toEqual([]);
      expect(result.contextSummary).toBe('');
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history by ID', async () => {
      const mockHistory = [
        {
          conversationId: 'conv-123',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Hello',
          timestamp: Date.now(),
        },
        {
          conversationId: 'conv-123',
          turnIndex: 1,
          speaker: 'AGENT',
          textChunk: 'Hi there',
          timestamp: Date.now() + 1000,
        },
      ];

      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: mockHistory,
          },
        },
      });

      const results = await service.getConversationHistory('conv-123');

      expect(results).toHaveLength(2);
      expect(results[0].turnIndex).toBeLessThan(results[1].turnIndex);
      expect(mockWeaviateClient.graphql.withWhere).toHaveBeenCalledWith({
        path: ['conversationId'],
        operator: 'Equal',
        valueText: 'conv-123',
      });
    });

    it('should respect limit parameter', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: [],
          },
        },
      });

      await service.getConversationHistory('conv-123', 10);

      expect(mockWeaviateClient.graphql.withLimit).toHaveBeenCalledWith(10);
    });

    it('should handle errors gracefully', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockRejectedValue(new Error('Error'));

      const results = await service.getConversationHistory('conv-123');

      expect(results).toEqual([]);
    });
  });

  describe('findSimilarConversations', () => {
    it('should find unique conversation IDs', async () => {
      const mockResults = [
        {
          conversationId: 'conv-1',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Test 1',
          timestamp: Date.now(),
          _additional: { distance: 0.3 },
        },
        {
          conversationId: 'conv-1',
          turnIndex: 1,
          speaker: 'AGENT',
          textChunk: 'Response 1',
          timestamp: Date.now(),
          _additional: { distance: 0.3 },
        },
        {
          conversationId: 'conv-2',
          turnIndex: 0,
          speaker: 'CUSTOMER',
          textChunk: 'Test 2',
          timestamp: Date.now(),
          _additional: { distance: 0.4 },
        },
      ];

      mockWeaviateClient.graphql.do = jest.fn().mockResolvedValue({
        data: {
          Get: {
            ConversationEmbedding: mockResults,
          },
        },
      });

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const conversationIds = await service.findSimilarConversations('query', 5);

      expect(conversationIds).toHaveLength(2);
      expect(conversationIds).toContain('conv-1');
      expect(conversationIds).toContain('conv-2');
    });

    it('should handle errors gracefully', async () => {
      mockWeaviateClient.graphql.do = jest.fn().mockRejectedValue(new Error('Error'));

      const mockOpenAI = {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1] }],
          }),
        },
      };
      (service as any).openai = mockOpenAI;

      const conversationIds = await service.findSimilarConversations('query');

      expect(conversationIds).toEqual([]);
    });
  });

  describe('Initialization', () => {
    it('should initialize with OpenAI client', () => {
      expect((service as any).openai).toBeDefined();
    });

    it('should initialize Weaviate client', () => {
      expect(weaviateConfig.getClient).toBeDefined();
    });
  });
});
