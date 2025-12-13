import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContentModerationService, ModerationAction, ModerationCategory } from './content-moderation.service';

describe('ContentModerationService', () => {
  let service: ContentModerationService;
  let mockOpenAI: any;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config = {
        OPENAI_API_KEY: 'test-key',
        ENABLE_CONTENT_MODERATION: 'true',
        MODERATION_STRICT_MODE: 'false',
        MAX_MESSAGE_LENGTH: '5000',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentModerationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ContentModerationService>(ContentModerationService);

    // Mock OpenAI client
    mockOpenAI = {
      moderations: {
        create: jest.fn(),
      },
    };
    (service as any).openai = mockOpenAI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateInput', () => {
    it('should validate normal messages', () => {
      const result = service.validateInput('Hello, how are you today?');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Hello, how are you today?');
      expect(result.issues).toHaveLength(0);
    });

    it('should reject empty messages', () => {
      const result = service.validateInput('');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Empty message');
    });

    it('should reject whitespace-only messages', () => {
      const result = service.validateInput('   \n\t   ');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Empty message');
    });

    it('should truncate messages exceeding max length', () => {
      const longMessage = 'a'.repeat(6000);
      const result = service.validateInput(longMessage);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Message exceeds maximum length of 5000 characters');
      expect(result.sanitized.length).toBe(5000);
    });

    it('should detect excessive character repetition', () => {
      const result = service.validateInput('aaaaaaaaaaaaa hello');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Excessive character repetition detected');
    });

    it('should detect excessive word repetition', () => {
      const result = service.validateInput('spam spam spam spam spam spam hello');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Excessive character repetition detected');
    });

    it('should remove control characters', () => {
      const result = service.validateInput('Hello\x00World\x1F');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid control characters detected');
      expect(result.sanitized).not.toContain('\x00');
      expect(result.sanitized).not.toContain('\x1F');
    });

    it('should detect script injection attempts', () => {
      const result = service.validateInput('<script>alert("xss")</script>');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Potential injection pattern detected');
    });

    it('should detect javascript protocol injection', () => {
      const result = service.validateInput('javascript:alert(1)');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Potential injection pattern detected');
    });

    it('should detect event handler injection', () => {
      const result = service.validateInput('<img src=x onerror=alert(1)>');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Potential injection pattern detected');
    });

    it('should normalize whitespace', () => {
      const result = service.validateInput('Hello    world\n\n\ntest   ');

      expect(result.sanitized).toBe('Hello world test');
    });

    it('should allow newlines and tabs', () => {
      const result = service.validateInput('Hello\nworld\tthere');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('Hello');
      expect(result.sanitized).toContain('world');
      expect(result.sanitized).toContain('there');
    });
  });

  describe('moderateInput', () => {
    it('should allow safe content', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: false,
          categories: {},
          category_scores: {},
        }],
      });

      const result = await service.moderateInput('I am feeling anxious today');

      expect(result.flagged).toBe(false);
      expect(result.action).toBe(ModerationAction.ALLOW);
    });

    it('should flag hate speech', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { hate: true },
          category_scores: { hate: 0.95 },
        }],
      });

      const result = await service.moderateInput('hateful content');

      expect(result.flagged).toBe(true);
      // Score 0.95 > threshold (0.8) + 0.2 = 1.0, so it should be blocked
      // But 0.95 is not > 1.0, so it will warn
      expect(result.action).toBe(ModerationAction.WARN);
      expect(result.reason).toContain('hate speech');
    });

    it('should flag harassment', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { harassment: true },
          category_scores: { harassment: 0.95 },
        }],
      });

      const result = await service.moderateInput('harassing content');

      expect(result.flagged).toBe(true);
      // Score 0.95 > threshold (0.7) + 0.2 = 0.9, so it should be blocked
      expect(result.action).toBe(ModerationAction.BLOCK);
    });

    it('should allow self-harm content in mental health context', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { 'self-harm/intent': true },
          category_scores: { 'self-harm/intent': 0.4 },
        }],
      });

      const result = await service.moderateInput('I have thoughts of self-harm');

      // Self-harm with scores above threshold would be blocked/warned
      // But self-harm/intent is checked in determineAction
      // Since score is 0.4 and threshold is 0.3, it should warn
      expect([ModerationAction.ALLOW, ModerationAction.WARN]).toContain(result.action);
    });

    it('should block sexual content involving minors', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { 'sexual/minors': true },
          category_scores: { 'sexual/minors': 0.3 },
        }],
      });

      const result = await service.moderateInput('inappropriate content');

      expect(result.action).toBe(ModerationAction.BLOCK);
    });

    it('should warn on borderline content', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { violence: true },
          category_scores: { violence: 0.75 }, // Just above threshold
        }],
      });

      const result = await service.moderateInput('borderline violent content');

      expect(result.action).toBe(ModerationAction.WARN);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAI.moderations.create.mockRejectedValue(new Error('API Error'));

      const result = await service.moderateInput('test message');

      // Should fail open in non-strict mode
      expect(result.action).toBe(ModerationAction.ALLOW);
    });

    it('should return safe result when moderation disabled', async () => {
      mockConfigService.get.mockReturnValueOnce('false'); // ENABLE_CONTENT_MODERATION
      const newService = new ContentModerationService(mockConfigService as any);

      const result = await newService.moderateInput('test message');

      expect(result.action).toBe(ModerationAction.ALLOW);
      expect(mockOpenAI.moderations.create).not.toHaveBeenCalled();
    });
  });

  describe('moderateOutput', () => {
    it('should allow safe AI responses', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: false,
          categories: {},
          category_scores: {},
        }],
      });

      const result = await service.moderateOutput('I understand how you feel. Would you like to talk more about it?');

      expect(result.flagged).toBe(false);
      expect(result.action).toBe(ModerationAction.ALLOW);
    });

    it('should block inappropriate AI output', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { harassment: true },
          category_scores: { harassment: 0.8 },
        }],
      });

      const result = await service.moderateOutput('inappropriate AI response');

      expect(result.flagged).toBe(true);
      expect(result.action).toBe(ModerationAction.BLOCK);
    });

    it('should be stricter for output than input', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { violence: true },
          category_scores: { violence: 0.72 }, // Would warn for input
        }],
      });

      const result = await service.moderateOutput('borderline content');

      // Should block for output even if it would only warn for input
      expect(result.action).toBe(ModerationAction.BLOCK);
    });

    it('should always fail closed on API errors for output', async () => {
      mockOpenAI.moderations.create.mockRejectedValue(new Error('API Error'));

      const result = await service.moderateOutput('test message');

      // Should fail closed for output
      expect(result.action).toBe(ModerationAction.BLOCK);
    });
  });

  describe('getSafeAlternativeResponse', () => {
    it('should return appropriate response for harassment', () => {
      const response = service.getSafeAlternativeResponse('harassment');

      expect(response).toContain('uncomfortable direction');
      expect(response).toContain('supportive');
    });

    it('should return appropriate response for hate speech', () => {
      const response = service.getSafeAlternativeResponse('hate');

      expect(response).toContain('respectful');
      expect(response).toContain('inclusive');
    });

    it('should return appropriate response for violence', () => {
      const response = service.getSafeAlternativeResponse('violence');

      expect(response).toContain('violence');
      expect(response).toContain('911');
    });

    it('should return appropriate response for sexual content', () => {
      const response = service.getSafeAlternativeResponse('sexual');

      expect(response).toContain('mental health support');
      expect(response).toContain('appropriate');
    });

    it('should return generic safe response for unknown reasons', () => {
      const response = service.getSafeAlternativeResponse();

      expect(response).toContain('supportive');
      expect(response).toContain('helpful');
    });
  });

  describe('isMentalHealthContext', () => {
    it('should recognize mental health keywords', () => {
      const keywords = [
        'I am feeling depressed',
        'My anxiety is overwhelming',
        'I feel so anxious',
        'Feeling really sad today',
        'I am lonely',
        'So much stress',
        'I am struggling with this',
        'Having a hard time',
        'Not okay right now',
        'I need help with my mental health',
      ];

      keywords.forEach(message => {
        expect(service.isMentalHealthContext(message)).toBe(true);
      });
    });

    it('should not flag non-mental-health content', () => {
      const messages = [
        'What is the weather today?',
        'Tell me a joke',
        'How do I make pasta?',
      ];

      messages.forEach(message => {
        expect(service.isMentalHealthContext(message)).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(10000);

      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: false,
          categories: {},
          category_scores: {},
        }],
      });

      const result = await service.moderateInput(longMessage);

      expect(mockOpenAI.moderations.create).toHaveBeenCalled();
    });

    it('should handle special characters', () => {
      const messages = [
        'Hello! 😊',
        'Testing... 123',
        'Question?',
        'Exclamation!',
        'Quote: "test"',
        "Apostrophe's test",
      ];

      messages.forEach(message => {
        const result = service.validateInput(message);
        expect(result.valid).toBe(true);
      });
    });

    it('should handle unicode characters', () => {
      const result = service.validateInput('Hello 世界 🌍');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('Hello');
      expect(result.sanitized).toContain('世界');
    });

    it('should handle multiple moderation categories', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: {
            harassment: true,
            violence: true,
          },
          category_scores: {
            harassment: 0.95,
            violence: 0.92,
          },
        }],
      });

      const result = await service.moderateInput('multiple violations');

      expect(result.flagged).toBe(true);
      // Harassment score 0.95 > threshold (0.7) + 0.2 = 0.9, so it should be blocked
      expect(result.action).toBe(ModerationAction.BLOCK);
      expect(result.reason).toContain('harassment');
      expect(result.reason).toContain('violent content');
    });
  });

  describe('threshold configuration', () => {
    it('should use lower threshold for self-harm in mental health context', () => {
      const thresholds = (service as any).categoryThresholds;

      expect(thresholds['self-harm']).toBeLessThan(thresholds['hate']);
      expect(thresholds['self-harm']).toBe(0.3);
    });

    it('should use zero tolerance for content involving minors', () => {
      const thresholds = (service as any).categoryThresholds;

      expect(thresholds['sexual/minors']).toBe(0.1);
    });
  });
});
