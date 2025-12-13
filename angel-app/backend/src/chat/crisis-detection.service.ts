import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum CrisisLevel {
  NONE = 'none',
  LOW = 'low',        // General distress, sad mood
  MEDIUM = 'medium',  // Significant distress, hopelessness
  HIGH = 'high',      // Self-harm thoughts, suicidal ideation
  CRITICAL = 'critical' // Immediate danger, active plan
}

export interface CrisisDetectionResult {
  level: CrisisLevel;
  confidence: number;
  matchedKeywords: string[];
  requiresIntervention: boolean;
  emergencyResources: EmergencyResource[];
}

export interface EmergencyResource {
  name: string;
  contact: string;
  description: string;
  available: string;
}

@Injectable()
export class CrisisDetectionService {
  private readonly logger = new Logger(CrisisDetectionService.name);

  // Crisis keywords organized by severity
  private readonly crisisPatterns = {
    critical: [
      /\b(kill myself|suicide|end my life|take my life|want to die)\b/i,
      /\b(going to (die|kill)|plan(ning)? to (die|suicide|take my life))\b/i,
      /\b(overdose|jump(ing)? off|hang(ing)? myself)\b/i,
      /\b(pills? ready|have .* ready to)\b/i,
      /\b(goodbye (world|everyone)|final (message|goodbye))\b/i,
      /\b(can'?t go on|don'?t want to live)\b/i,
    ],
    high: [
      /\b(suicidal|feeling suicidal)\b/i,
      /\b(self[- ]?harm|thinking about self[- ]?harm)\b/i,
      /\b(cut(ting)? (my)?self|hurt(ing)? (my)?self)\b/i,
      /\b(better off dead|world.*better without me)\b/i,
      /\b(no reason to live|nothing to live for)\b/i,
      /\b(thoughts? of (dying|suicide|death))\b/i,
      /\b(harm (my)?self|injure (my)?self)\b/i,
      /\b(keep thinking about (hurting|harming))\b/i,
    ],
    medium: [
      /\b(hopeless|can'?t take (it|this)|give up)\b/i,
      /\b(no point|what'?s the point|why bother)\b/i,
      /\b(worthless|useless|failure|burden)\b/i,
      /\b(everyone.*better without me|shouldn'?t be here)\b/i,
      /\b(empty inside|numb|feel nothing)\b/i,
    ],
    low: [
      /\b(very (sad|depressed)|extremely (down|low))\b/i,
      /\b(can'?t (cope|handle)|too much)\b/i,
      /\b(desperate|overwhelmed|breaking down)\b/i,
    ],
  };

  constructor(private configService: ConfigService) {}

  /**
   * Detect crisis level in user message
   */
  detectCrisis(message: string): CrisisDetectionResult {
    const matched: { level: CrisisLevel; keyword: string }[] = [];

    // Check critical patterns first
    for (const pattern of this.crisisPatterns.critical) {
      const match = message.match(pattern);
      if (match) {
        matched.push({ level: CrisisLevel.CRITICAL, keyword: match[0] });
      }
    }

    // Check high severity patterns
    for (const pattern of this.crisisPatterns.high) {
      const match = message.match(pattern);
      if (match) {
        matched.push({ level: CrisisLevel.HIGH, keyword: match[0] });
      }
    }

    // Check medium severity patterns
    for (const pattern of this.crisisPatterns.medium) {
      const match = message.match(pattern);
      if (match) {
        matched.push({ level: CrisisLevel.MEDIUM, keyword: match[0] });
      }
    }

    // Check low severity patterns
    for (const pattern of this.crisisPatterns.low) {
      const match = message.match(pattern);
      if (match) {
        matched.push({ level: CrisisLevel.LOW, keyword: match[0] });
      }
    }

    // Determine overall crisis level (highest match)
    let crisisLevel = CrisisLevel.NONE;
    if (matched.length > 0) {
      const levels = [CrisisLevel.CRITICAL, CrisisLevel.HIGH, CrisisLevel.MEDIUM, CrisisLevel.LOW];
      crisisLevel = levels.find(level => matched.some(m => m.level === level)) || CrisisLevel.NONE;
    }

    const requiresIntervention = [CrisisLevel.CRITICAL, CrisisLevel.HIGH].includes(crisisLevel);
    const matchedKeywords = matched.map(m => m.keyword);

    // Calculate confidence based on number of matches and specificity
    const confidence = this.calculateConfidence(crisisLevel, matched.length);

    const result: CrisisDetectionResult = {
      level: crisisLevel,
      confidence,
      matchedKeywords,
      requiresIntervention,
      emergencyResources: requiresIntervention ? this.getEmergencyResources() : [],
    };

    // Log crisis detection
    if (requiresIntervention) {
      this.logger.warn(`CRISIS DETECTED - Level: ${crisisLevel}, Confidence: ${confidence}, Keywords: ${matchedKeywords.join(', ')}`);
    }

    return result;
  }

  /**
   * Calculate confidence score based on matches
   */
  private calculateConfidence(level: CrisisLevel, matchCount: number): number {
    const baseConfidence = {
      [CrisisLevel.CRITICAL]: 0.95,
      [CrisisLevel.HIGH]: 0.85,
      [CrisisLevel.MEDIUM]: 0.70,
      [CrisisLevel.LOW]: 0.60,
      [CrisisLevel.NONE]: 0,
    };

    // Increase confidence with multiple matches
    const confidence = baseConfidence[level] + (Math.min(matchCount - 1, 3) * 0.05);
    return Math.min(confidence, 1.0);
  }

  /**
   * Get emergency resources based on configuration
   */
  getEmergencyResources(): EmergencyResource[] {
    // Can be configured per region via ConfigService
    const country = this.configService.get('EMERGENCY_COUNTRY', 'US');

    const usResources: EmergencyResource[] = [
      {
        name: '988 Suicide & Crisis Lifeline',
        contact: 'Call or text 988',
        description: '24/7 free and confidential support for people in distress',
        available: '24/7',
      },
      {
        name: 'Crisis Text Line',
        contact: 'Text HOME to 741741',
        description: 'Free 24/7 text support with a trained crisis counselor',
        available: '24/7',
      },
      {
        name: 'Emergency Services',
        contact: 'Call 911',
        description: 'For immediate life-threatening emergencies',
        available: '24/7',
      },
      {
        name: 'Veterans Crisis Line',
        contact: 'Call 988 then press 1',
        description: 'Support for veterans and their families',
        available: '24/7',
      },
    ];

    // Add other countries as needed
    return usResources;
  }

  /**
   * Generate crisis intervention response
   */
  generateCrisisResponse(crisisResult: CrisisDetectionResult): string {
    if (!crisisResult.requiresIntervention) {
      return '';
    }

    const resources = crisisResult.emergencyResources
      .map(r => `\n• ${r.name}: ${r.contact}\n  ${r.description}`)
      .join('\n');

    if (crisisResult.level === CrisisLevel.CRITICAL) {
      return `

⚠️ **IMMEDIATE SUPPORT AVAILABLE** ⚠️

I'm deeply concerned about what you've shared. Your safety is the top priority right now.

**Please reach out to these resources immediately:**
${resources}

I'm here with you, but these trained professionals can provide the immediate, specialized support you need right now. You don't have to face this alone.

Would you like to talk about what brought you here today, or would you prefer to connect with one of these resources first?`;
    }

    // High severity
    return `

🆘 **Support Resources Available** 🆘

I hear that you're going through an incredibly difficult time. Your feelings are valid, and there are people who want to help.

**Please consider reaching out:**
${resources}

These services are confidential, free, and available right now. Trained professionals can provide support specific to what you're experiencing.

I'm here to listen and support you. How are you feeling right now?`;
  }

  /**
   * Get crisis-aware system prompt addition
   */
  getCrisisPromptGuidelines(): string {
    return `

## CRISIS RESPONSE PROTOCOL (HIGHEST PRIORITY)

If user shows signs of:
- Suicidal ideation or self-harm thoughts
- Immediate danger to self or others
- Severe distress or crisis

YOUR RESPONSE MUST:
1. Express immediate concern and validate their courage in sharing
2. EXPLICITLY provide emergency resources (already included in response)
3. Encourage professional help without being pushy
4. Avoid dismissive phrases like "it will get better" or "think positive"
5. Stay present and engaged while prioritizing their safety
6. Never diagnose, but recognize severity

NEVER:
- Attempt to diagnose
- Promise you can solve it
- Give medical advice
- Minimize their feelings
- Leave them alone (stay engaged until they connect with resources)

Remember: You are a supportive companion, NOT a crisis counselor. Your role is to recognize crisis and bridge to professional help.`;
  }

  /**
   * Check if message indicates user is safe/situation improving
   */
  detectSafetySignals(message: string): boolean {
    const safetyPatterns = [
      /\b(feeling (better|safer)|calmer now)\b/i,
      /\b(talked to (someone|my therapist|therapist))\b/i,
      /\b((going|want) to (call|reach out|contact))\b/i,
      /\b(not going to (hurt|harm)|safe now|am safe)\b/i,
      /\b(thank you|helped me|feel supported)\b/i,
    ];

    return safetyPatterns.some(pattern => pattern.test(message));
  }
}
