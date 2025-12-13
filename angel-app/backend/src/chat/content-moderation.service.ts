import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export enum ModerationCategory {
  HATE = 'hate',
  HATE_THREATENING = 'hate/threatening',
  HARASSMENT = 'harassment',
  HARASSMENT_THREATENING = 'harassment/threatening',
  SELF_HARM = 'self-harm',
  SELF_HARM_INTENT = 'self-harm/intent',
  SELF_HARM_INSTRUCTIONS = 'self-harm/instructions',
  SEXUAL = 'sexual',
  SEXUAL_MINORS = 'sexual/minors',
  VIOLENCE = 'violence',
  VIOLENCE_GRAPHIC = 'violence/graphic',
}

export interface ModerationResult {
  flagged: boolean;
  categories: Partial<Record<ModerationCategory, boolean>>;
  categoryScores: Partial<Record<ModerationCategory, number>>;
  action: ModerationAction;
  reason?: string;
}

export enum ModerationAction {
  ALLOW = 'allow',           // Content is safe
  WARN = 'warn',             // Borderline content, log warning
  BLOCK = 'block',           // Block content, return safe alternative
  ESCALATE = 'escalate',     // Requires human review
}

export interface InputValidationResult {
  valid: boolean;
  sanitized: string;
  issues: string[];
}

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);
  private openai: OpenAI;
  private readonly moderationEnabled: boolean;
  private readonly strictMode: boolean;

  // Configurable thresholds for different categories
  private readonly categoryThresholds = {
    [ModerationCategory.HATE]: 0.8,
    [ModerationCategory.HATE_THREATENING]: 0.5,
    [ModerationCategory.HARASSMENT]: 0.7,
    [ModerationCategory.HARASSMENT_THREATENING]: 0.5,
    [ModerationCategory.SELF_HARM]: 0.3, // Lower threshold for mental health app
    [ModerationCategory.SELF_HARM_INTENT]: 0.3,
    [ModerationCategory.SELF_HARM_INSTRUCTIONS]: 0.5,
    [ModerationCategory.SEXUAL]: 0.8,
    [ModerationCategory.SEXUAL_MINORS]: 0.1, // Zero tolerance
    [ModerationCategory.VIOLENCE]: 0.7,
    [ModerationCategory.VIOLENCE_GRAPHIC]: 0.6,
  };

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }

    this.moderationEnabled = this.configService.get('ENABLE_CONTENT_MODERATION', 'true') === 'true';
    this.strictMode = this.configService.get('MODERATION_STRICT_MODE', 'false') === 'true';

    this.logger.log(`Content Moderation initialized - Enabled: ${this.moderationEnabled}, Strict Mode: ${this.strictMode}`);
  }

  /**
   * Validate and sanitize user input
   */
  validateInput(content: string): InputValidationResult {
    const issues: string[] = [];
    let sanitized = content;

    // Check for empty or whitespace-only content
    if (!content || content.trim().length === 0) {
      return {
        valid: false,
        sanitized: '',
        issues: ['Empty message'],
      };
    }

    // Check length limits
    const maxLength = this.configService.get('MAX_MESSAGE_LENGTH', '5000');
    if (content.length > parseInt(maxLength)) {
      issues.push(`Message exceeds maximum length of ${maxLength} characters`);
      sanitized = content.substring(0, parseInt(maxLength));
    }

    // Check for excessive repetition (potential spam)
    if (this.hasExcessiveRepetition(content)) {
      issues.push('Excessive character repetition detected');
    }

    // Check for control characters (except newlines, tabs)
    const controlCharPattern = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g;
    if (controlCharPattern.test(content)) {
      issues.push('Invalid control characters detected');
      sanitized = sanitized.replace(controlCharPattern, '');
    }

    // Check for potential code injection patterns
    if (this.hasInjectionPatterns(content)) {
      issues.push('Potential injection pattern detected');
    }

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return {
      valid: issues.length === 0,
      sanitized,
      issues,
    };
  }

  /**
   * Moderate user input using OpenAI Moderation API
   */
  async moderateInput(content: string): Promise<ModerationResult> {
    if (!this.moderationEnabled) {
      return this.createSafeResult();
    }

    if (!this.openai) {
      this.logger.warn('OpenAI not configured, skipping content moderation');
      return this.createSafeResult();
    }

    try {
      const response = await this.openai.moderations.create({
        input: content,
      });

      const result = response.results[0];
      const action = this.determineAction(result.categories, result.category_scores);

      const moderationResult: ModerationResult = {
        flagged: result.flagged,
        categories: result.categories as Partial<Record<ModerationCategory, boolean>>,
        categoryScores: result.category_scores as Partial<Record<ModerationCategory, number>>,
        action,
        reason: action !== ModerationAction.ALLOW ? this.getViolationReason(result.categories) : undefined,
      };

      // Log moderation events
      if (moderationResult.flagged) {
        this.logger.warn('INPUT_MODERATION_FLAG', {
          action: moderationResult.action,
          reason: moderationResult.reason,
          categories: Object.entries(moderationResult.categories)
            .filter(([_, flagged]) => flagged)
            .map(([cat]) => cat),
        });
      }

      return moderationResult;
    } catch (error) {
      this.logger.error('Error during input moderation:', error);
      // Fail open in non-strict mode, fail closed in strict mode
      return this.strictMode ? this.createBlockedResult() : this.createSafeResult();
    }
  }

  /**
   * Moderate AI-generated output
   */
  async moderateOutput(content: string): Promise<ModerationResult> {
    if (!this.moderationEnabled) {
      return this.createSafeResult();
    }

    if (!this.openai) {
      this.logger.warn('OpenAI not configured, skipping output moderation');
      return this.createSafeResult();
    }

    try {
      const response = await this.openai.moderations.create({
        input: content,
      });

      const result = response.results[0];

      // Stricter thresholds for output than input
      const action = this.determineAction(result.categories, result.category_scores, true);

      const moderationResult: ModerationResult = {
        flagged: result.flagged,
        categories: result.categories as Partial<Record<ModerationCategory, boolean>>,
        categoryScores: result.category_scores as Partial<Record<ModerationCategory, number>>,
        action,
        reason: action !== ModerationAction.ALLOW ? this.getViolationReason(result.categories) : undefined,
      };

      // Log output moderation events (this is critical - AI should not produce harmful content)
      if (moderationResult.flagged) {
        this.logger.error('OUTPUT_MODERATION_FLAG', {
          action: moderationResult.action,
          reason: moderationResult.reason,
          categories: Object.entries(moderationResult.categories)
            .filter(([_, flagged]) => flagged)
            .map(([cat]) => cat),
          contentPreview: content.substring(0, 100),
        });
      }

      return moderationResult;
    } catch (error) {
      this.logger.error('Error during output moderation:', error);
      // Always fail closed for output - better safe than sorry
      return this.createBlockedResult();
    }
  }

  /**
   * Generate safe alternative response when content is blocked
   */
  getSafeAlternativeResponse(reason?: string): string {
    const baseResponse = "I'm here to provide supportive and helpful conversation. ";

    if (reason?.includes('harassment')) {
      return `${baseResponse}I noticed the conversation might be heading in an uncomfortable direction. Let's focus on how I can support you in a constructive way. How are you feeling today?`;
    }

    if (reason?.includes('hate')) {
      return `${baseResponse}I'm designed to be respectful and inclusive. Let's focus on how I can help you. What's on your mind?`;
    }

    if (reason?.includes('violence')) {
      return `${baseResponse}I'm concerned about what you've shared. If you're experiencing or witnessing violence, please reach out to local authorities or call 911. I'm here to support you emotionally. Would you like to talk about how you're feeling?`;
    }

    if (reason?.includes('sexual')) {
      return `${baseResponse}I'm focused on providing mental health support. Let's keep our conversation appropriate and supportive. How can I help you today?`;
    }

    // Generic safe response
    return `${baseResponse}I want to make sure our conversation stays helpful and appropriate. Let's focus on how I can support your mental wellbeing. What would you like to talk about?`;
  }

  /**
   * Determine action based on moderation results
   */
  private determineAction(
    categories: any,
    scores: any,
    isOutput: boolean = false,
  ): ModerationAction {
    // Zero tolerance categories
    if (categories['sexual/minors']) {
      return ModerationAction.BLOCK;
    }

    // Check if any category exceeds its threshold
    for (const [category, score] of Object.entries(scores)) {
      const threshold = this.categoryThresholds[category as ModerationCategory];
      if (threshold && (score as number) > threshold) {
        // More strict for output
        if (isOutput) {
          return ModerationAction.BLOCK;
        }

        // For input, escalate serious violations, warn for borderline
        if ((score as number) > threshold + 0.2) {
          return ModerationAction.BLOCK;
        } else {
          return ModerationAction.WARN;
        }
      }
    }

    // Self-harm content in mental health context requires special handling
    // Don't block it (users need to express feelings), but log it
    if (categories['self-harm'] || categories['self-harm/intent']) {
      // This is handled by crisis detection, not moderation
      return ModerationAction.ALLOW;
    }

    return ModerationAction.ALLOW;
  }

  /**
   * Get human-readable violation reason
   */
  private getViolationReason(categories: any): string {
    const flaggedCategories = Object.entries(categories)
      .filter(([_, flagged]) => flagged)
      .map(([cat]) => cat);

    if (flaggedCategories.length === 0) {
      return 'Content policy violation';
    }

    const categoryMap: Record<string, string> = {
      'hate': 'hate speech',
      'hate/threatening': 'threatening hate speech',
      'harassment': 'harassment',
      'harassment/threatening': 'threatening harassment',
      'self-harm': 'self-harm content',
      'self-harm/intent': 'self-harm intent',
      'self-harm/instructions': 'self-harm instructions',
      'sexual': 'sexual content',
      'sexual/minors': 'content involving minors',
      'violence': 'violent content',
      'violence/graphic': 'graphic violence',
    };

    const reasons = flaggedCategories
      .map(cat => categoryMap[cat] || cat)
      .join(', ');

    return `Content flagged for: ${reasons}`;
  }

  /**
   * Check for excessive character repetition (spam detection)
   */
  private hasExcessiveRepetition(content: string): boolean {
    // Check for same character repeated more than 10 times
    const charRepetition = /(.)\1{10,}/;
    if (charRepetition.test(content)) {
      return true;
    }

    // Check for same word repeated more than 5 times
    const words = content.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      if (word.length > 2) { // Only check words longer than 2 chars
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        if (wordCounts.get(word)! > 5) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check for potential code injection patterns
   */
  private hasInjectionPatterns(content: string): boolean {
    // Basic patterns for common injection attempts
    const injectionPatterns = [
      /<script[^>]*>.*?<\/script>/gi,        // Script tags
      /javascript:/gi,                        // JavaScript protocol
      /on\w+\s*=/gi,                         // Event handlers
      /data:text\/html/gi,                   // Data URLs
      /vbscript:/gi,                         // VBScript protocol
      /<iframe/gi,                           // Iframes
      /eval\s*\(/gi,                         // Eval function
      /expression\s*\(/gi,                   // CSS expression
    ];

    return injectionPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Create safe (allowed) result
   */
  private createSafeResult(): ModerationResult {
    return {
      flagged: false,
      categories: {},
      categoryScores: {},
      action: ModerationAction.ALLOW,
    };
  }

  /**
   * Create blocked result
   */
  private createBlockedResult(): ModerationResult {
    return {
      flagged: true,
      categories: {},
      categoryScores: {},
      action: ModerationAction.BLOCK,
      reason: 'Content moderation check failed',
    };
  }

  /**
   * Check if content contains mental health keywords (allowed in this context)
   */
  isMentalHealthContext(content: string): boolean {
    const mentalHealthKeywords = [
      'depress', 'anxiety', 'anxious', 'sad', 'lonely', 'stress',
      'worried', 'overwhelm', 'struggl', 'difficult', 'hard time',
      'feeling down', 'not okay', 'need help', 'mental health',
    ];

    const lowerContent = content.toLowerCase();
    return mentalHealthKeywords.some(keyword => lowerContent.includes(keyword));
  }
}
