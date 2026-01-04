# Angel App - Technical Product Documentation
## Comprehensive Guide for Technical Product Managers

**Document Version:** 1.0
**Last Updated:** January 2026
**Prepared For:** Technical Product Management Reference

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [LLM Integration & AI Strategy](#llm-integration--ai-strategy)
4. [Voice Transcription System](#voice-transcription-system)
5. [Prompt Engineering](#prompt-engineering)
6. [Context Management](#context-management)
7. [Database Architecture](#database-architecture)
8. [Safety & Moderation Systems](#safety--moderation-systems)
9. [Key Features & User Workflows](#key-features--user-workflows)
10. [Technical Specifications](#technical-specifications)
11. [Infrastructure & Deployment](#infrastructure--deployment)
12. [Performance Metrics](#performance-metrics)
13. [Security & Compliance](#security--compliance)
14. [Scalability Considerations](#scalability-considerations)
15. [Product Roadmap Considerations](#product-roadmap-considerations)

---

## Executive Summary

**Angel** is an AI-powered mental health companion application designed to provide empathetic, supportive conversations using evidence-based therapeutic techniques. The platform combines multiple AI technologies (LLM, voice transcription, semantic search) with sophisticated safety mechanisms to deliver a scalable, production-ready mental health support tool.

### Key Product Differentiators

- **Multi-Modal Interaction**: Text and voice-based conversations
- **Safety-First Architecture**: Multi-layer content moderation and crisis detection
- **Context-Aware Responses**: Intelligent context building using RAG (Retrieval-Augmented Generation)
- **Provider Flexibility**: Supports both OpenAI and Google Gemini
- **Real-Time Communication**: WebSocket support for immediate responses
- **Evidence-Based Approach**: Integrates CBT, DBT, Socratic, and acceptance-based therapeutic principles

### Technical Highlights

- **Stack**: TypeScript/NestJS backend, React Native mobile app
- **Databases**: PostgreSQL (relational data), Weaviate (vector embeddings)
- **AI Providers**: OpenAI (GPT-4o-mini, Whisper, Embeddings), Google Gemini, Google Cloud Speech APIs
- **Infrastructure**: AWS ECS, RDS, ALB with containerized deployment
- **Scale**: Token budget management (6K tokens), caching, async processing

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile App Layer                         │
│                     (React Native + Expo)                        │
└───────────────────┬─────────────────────────────────────────────┘
                    │
                    │ HTTPS/WSS
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Load Balancer                     │
└───────────────────┬─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NestJS Backend API                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   Chat      │  │   Voice      │  │   Authentication     │  │
│  │  Service    │  │  Service     │  │     & Users          │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   RAG       │  │   Context    │  │   Crisis Detection   │  │
│  │  Service    │  │  Management  │  │   & Moderation       │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
└───────┬───────────────┬────────────────────┬────────────────────┘
        │               │                    │
        ▼               ▼                    ▼
┌──────────────┐ ┌─────────────┐    ┌──────────────────┐
│  PostgreSQL  │ │  Weaviate   │    │  External APIs   │
│     RDS      │ │   Vector    │    │  - OpenAI        │
│              │ │     DB      │    │  - Google Cloud  │
└──────────────┘ └─────────────┘    └──────────────────┘
```

### Component Overview

#### Frontend (Mobile App)
- **Location**: `/mobile-app`
- **Framework**: React Native 0.81.5 with Expo 54
- **Key Libraries**: React Navigation, Native Base (UI), TanStack Query (data fetching)
- **Features**: Text/voice chat, mood logging, conversation history, profile management

#### Backend (API Server)
- **Location**: `/backend`
- **Framework**: NestJS 11.0.1 (TypeScript/Node.js)
- **Architecture**: Modular design with feature-based modules
- **Key Modules**: Chat, Auth, Users, Mood, Voice, Prompts, Weaviate

#### Data Pipeline
- **Location**: `/data-pipeline`
- **Language**: Python
- **Purpose**: Embedding generation, data processing, Weaviate management

---

## LLM Integration & AI Strategy

### Multi-Provider Strategy

Angel supports **two LLM providers** with runtime configuration:

#### Provider 1: OpenAI
- **Primary Model**: `gpt-4o-mini` (default)
- **Configuration**: `AI_PROVIDER=openai`
- **Use Cases**: Chat responses, conversation title generation, context summarization
- **Location**: `backend/src/chat/chat.service.ts:301-350`

**Configuration Parameters:**
```typescript
model: 'gpt-4o-mini' // Configurable via OPENAI_MODEL env var
temperature: 0.7
max_tokens: 500 // Concise responses for mobile UX
```

#### Provider 2: Google Gemini
- **Primary Model**: `gemini-1.5-flash` (default)
- **Configuration**: `AI_PROVIDER=gemini`
- **Use Cases**: Same as OpenAI, drop-in replacement
- **Location**: `backend/src/chat/chat.service.ts:352-407`

**Configuration Parameters:**
```typescript
model: 'gemini-1.5-flash' // Configurable via GEMINI_MODEL env var
temperature: 0.7
maxOutputTokens: 500
```

### Product Considerations

#### Why Two Providers?
1. **Cost Optimization**: Flexibility to switch based on pricing
2. **Reliability**: Fallback if one provider has issues
3. **Performance Testing**: A/B testing different models
4. **Regional Availability**: Different regions have different provider access

#### Token Budget Management
- **Response Limit**: 500 tokens (~375 words)
- **Rationale**: Mobile-friendly, concise responses
- **Context Budget**: 6,000 tokens for prompt building
- **Implementation**: `backend/src/chat/therapist-context.service.ts:81`

#### Model Selection Criteria
- **Speed**: Both models selected for low latency (<2s response time)
- **Cost**: Mini/flash models balance quality with cost efficiency
- **Quality**: Sufficient for therapeutic conversation support

### AI Response Pipeline

```
User Message
    ↓
1. Input Validation & Sanitization (chat.service.ts:72-79)
    ↓
2. Content Moderation Check (chat.service.ts:82-110)
    ↓
3. Crisis Detection (chat.service.ts:113-120)
    ↓
4. Context Building (6K token budget)
    ├─ Current Session (40% budget)
    ├─ Recent History (35% budget)
    └─ Relevant Past Context via RAG (25% budget)
    ↓
5. System Prompt Construction (chat.service.ts:482-521)
    ├─ Angel Role Description
    ├─ User Clinical Profile
    ├─ Therapist Context
    ├─ Crisis Protocol (if triggered)
    └─ Safety Guidelines
    ↓
6. LLM API Call (OpenAI or Gemini)
    ↓
7. Output Moderation (chat.service.ts:150-168)
    ↓
8. Response Delivery
    ↓
9. Async Operations (non-blocking):
    ├─ Store Embeddings in Weaviate
    ├─ Generate Conversation Title (after first exchange)
    └─ Update Clinical Profile (daily)
```

### Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Response Time (LLM) | <2s | ~1.5s avg |
| Context Building | <500ms | ~200-400ms |
| RAG Search | <200ms | ~100-150ms |
| Total E2E Latency | <3s | ~2-2.5s |

**Location References:**
- LLM Response Generation: `backend/src/chat/chat.service.ts:236-299`
- Performance Logging: Timestamps logged at key points (lines 319, 342, 387, 393)

---

## Voice Transcription System

### Dual-Engine Approach

Angel uses **two speech-to-text engines** with intelligent fallback:

#### Primary: OpenAI Whisper
- **Model**: `whisper-1`
- **Implementation**: `backend/src/chat/voice.service.ts:139-202`
- **Supported Formats**: WAV, CAF, MP3, M4A, FLAC, OGG, WebM
- **Language**: English (configurable)
- **Response Format**: Text

**Key Features:**
- Automatic format detection via buffer analysis
- Handles iOS Core Audio Format (CAF) and Android formats
- Silent audio detection (checks for all-zero buffers)
- Duration estimation for quality validation

**Code Example:**
```typescript
// voice.service.ts:179
const file = await toFile(audioBuffer, `audio.${extension}`, { type: mimeType });
const transcription = await this.openai.audio.transcriptions.create({
  file: file,
  model: 'whisper-1',
  language: 'en',
  response_format: 'text',
});
```

#### Secondary: Google Cloud Speech-to-Text
- **Implementation**: `backend/src/chat/voice.service.ts:37-133`
- **Use Case**: Fallback option or primary (configurable)
- **Audio Encoding**: LINEAR16, MP3, FLAC, OGG_OPUS
- **Features**:
  - Automatic punctuation
  - Multi-channel support
  - Sample rate detection from WAV headers

### Text-to-Speech (TTS)

**Provider**: Google Cloud Text-to-Speech
- **Voice**: `en-US-Neural2-F` (female, neural)
- **Output Format**: MP3
- **Speaking Rate**: 0.95 (slightly slower for comprehension)
- **Implementation**: `backend/src/chat/voice.service.ts:207-238`

**Voice Selection Rationale:**
- Female voice selected for warmth and empathy (research-backed for mental health contexts)
- Neural voice for natural prosody
- Slightly slower rate (0.95x) improves comprehension for sensitive content

### Voice Message Flow

```
Mobile App Records Audio (Expo.Audio)
    ↓
Upload to /voice/message endpoint (multipart/form-data)
    ↓
MIME Type Detection (buffer header analysis)
    ├─ CAF (iOS): 0x63616666
    ├─ WAV: 0x52494646 + WAVE
    ├─ MP3: ID3 or MPEG sync
    └─ M4A: ftyp box
    ↓
Transcription (Whisper or Google STT)
    ↓
Send Text to Chat Service (standard pipeline)
    ↓
Generate AI Response
    ↓
Convert Response to Speech (Google TTS)
    ↓
Return Audio + Text to Client (base64 encoded)
```

**Location**: `backend/src/chat/voice.controller.ts` and `voice.service.ts`

### Product Considerations

#### Why Dual STT Engines?
1. **Format Compatibility**: Whisper handles more formats natively
2. **Accuracy**: Both engines excellent, can switch based on language/accent
3. **Cost Management**: Google Cloud may be cheaper for high volume
4. **Regional Availability**: Different regions may prefer different providers

#### Audio Quality Requirements
- **Minimum Duration**: ~0.5 seconds (derived from 100-byte minimum buffer)
- **Sample Rate**: 16kHz (mobile standard)
- **Channels**: Mono (1 channel) for efficiency
- **Bit Depth**: 16-bit LINEAR PCM

#### Known Limitations
- CAF format requires extraction/conversion (iOS-specific)
- Silent audio detection prevents empty transcriptions
- No real-time streaming (future enhancement)

---

## Prompt Engineering

### System Prompt Architecture

Angel uses a **23-section comprehensive system prompt** stored in JSON format for easy updates without code deployments.

**Location**: `backend/src/prompts/angel-system-prompt.json`

### Prompt Structure

The system prompt is modular and composable:

#### 1. Core Identity (`angelRoleDescription`)
```
"You are Angel, a compassionate and supportive AI mental health companion."
```

#### 2. Therapeutic Guidelines (`angelCoreGuidelines`)
- Integrates 5 therapeutic modalities **without naming them**:
  - **CBT**: Cognitive restructuring, behavioral activation
  - **DBT**: Validation, distress tolerance, emotion regulation
  - **Socratic**: Questioning assumptions, exploring alternatives
  - **Acceptance-Based**: Values clarification, committed action
  - **Psychodynamic**: Pattern recognition, exploring origins

**Key Principle**: Embody techniques through tone and questioning, never reference methodology directly

#### 3. Conversation Style (`conversationStyle`)
- **Tone**: Warm, empathetic, genuine
- **Response Length**: 2-4 sentences (mobile-optimized)
- **Language**: Simple, accessible, no jargon
- **Balance**: 70/30 listening to advising ratio

#### 4. Therapeutic Techniques (`therapeuticTechniques`)
Examples provided for each modality:
- CBT: "What thoughts come up when you feel that way?"
- DBT: "It makes complete sense you'd feel that way given what happened."
- Socratic: "What would it mean if that were true?"

#### 5. RAG Instruction (`ragInstruction`)
Guidelines for using past conversation context:
- Reference naturally: "Last time you mentioned..."
- Show continuity and growth
- Don't force references
- Prioritize recent sessions

#### 6. Clinical Profile Guidance (`clinicalProfileGuidance`)
- Use profiles to tailor approach
- Never explicitly mention "your profile says..."
- Recognize patterns and vulnerabilities
- Focus on current lived experience

#### 7. Crisis Protocol (`crisisProtocol`)
**HIGHEST PRIORITY** - Detailed 10-step protocol:
1. Take seriously
2. Express immediate concern
3. Validate courage
4. Acknowledge emergency resources provided
5. Stay present and engaged
6. Ask about safety
7. Explore support
8. Avoid clichés
9. Maintain engagement
10. Repeat resources if needed

#### 8. Safety Guidelines (`safetyGuidelines`)
- When to encourage professional help
- How to suggest therapy (normalize, be specific, empower)
- Clear boundaries (not a therapist)

#### 9. Out-of-Scope Handling (`outOfScopeHandling`)
Redirections for:
- Physical health symptoms → doctor
- Medical advice → psychiatrist
- Legal issues → lawyer
- Financial advice → financial counselor

#### 10. Additional Sections
- Progress tracking and follow-ups
- Boundary reminders
- Celebrating wins and handling setbacks

### Dynamic Prompt Construction

The system prompt is **assembled at runtime** with dynamic elements:

```typescript
// backend/src/chat/chat.service.ts:482-521
buildSystemPrompt(context, ragContext, crisisDetection) {
  let prompt = angelPrompts.angelRoleDescription;

  // Add user context
  prompt += `User Context:
    - Name: ${context.userName}
    - Recent mood patterns: ${context.recentMoods}
    - Preferences: ${context.preferences}`;

  // Add clinical profile (if available)
  if (context.clinicalProfile) {
    prompt += `\n**Clinical Profile:**\n${context.clinicalProfile}`;
  }

  // Add intelligent therapist context (NEW)
  if (context.therapistContext) {
    prompt += `\n${context.therapistContext}`;
  }

  // CRITICAL: Add crisis protocol if triggered
  if (crisisDetection?.requiresIntervention) {
    prompt += `\n${angelPrompts.crisisProtocol}`;
    prompt += `\n⚠️ ACTIVE CRISIS: Level ${crisisDetection.level}`;
  }

  // Add safety guidelines
  prompt += `\n${angelPrompts.safetyGuidelines}`;

  // Add RAG context from similar conversations
  if (ragContext) {
    prompt += `\n${ragContext}`;
    prompt += angelPrompts.ragInstruction;
  }

  prompt += `\n${angelPrompts.angelCoreGuidelines}`;
  return prompt;
}
```

### Prompt Management Strategy

#### Hot-Reloadable Prompts
- **Storage**: S3 bucket (`PROMPTS_S3_BUCKET`)
- **Lambda Trigger**: Auto-reload on S3 file changes
- **Fallback**: Local JSON file if S3 unavailable
- **Location**: `backend/src/prompts/prompts.service.ts`

**Benefit**: Update therapeutic guidelines without backend redeployment

#### Version Control
- Prompts stored in Git (`angel-system-prompt.json`)
- S3 versioning enabled for rollback capability
- Changelog tracked in Git commits

### Prompt Engineering Best Practices (Implemented)

1. **Specificity**: Clear role definition and boundaries
2. **Context Injection**: Dynamic user data and conversation history
3. **Safety First**: Crisis protocol prominently placed
4. **Token Efficiency**: Modular sections loaded as needed
5. **Natural Language**: Conversational instructions vs. rigid rules
6. **Example-Driven**: Specific examples for each technique
7. **Priority Hierarchy**: Crisis protocol marked as HIGHEST PRIORITY

### Product Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Response Relevance | >85% helpful | User feedback / thumbs up |
| Crisis Detection Accuracy | >95% precision | Manual review + false positive rate |
| Boundary Respect | 100% | Zero medical advice incidents |
| Conversation Quality | >4.0/5 | User ratings |

---

## Context Management

### Intelligent Therapist Context System

**Purpose**: Build conversation context that mimics a human therapist's memory and understanding of the patient.

**Implementation**: `backend/src/chat/therapist-context.service.ts`

### Token Budget Architecture

The system enforces a **6,000 token budget** divided into three priority tiers:

```
┌─────────────────────────────────────────────────────┐
│         6,000 Token Budget Distribution              │
├─────────────────────────────────────────────────────┤
│  40% - Current Session (2,400 tokens)               │
│        Most recent messages in active conversation   │
│        Priority: HIGHEST                             │
├─────────────────────────────────────────────────────┤
│  35% - Recent History (2,100 tokens)                │
│        Last 4 conversations within 90 days           │
│        Priority: HIGH                                │
├─────────────────────────────────────────────────────┤
│  25% - Relevant Past Context (1,500 tokens)         │
│        Semantically similar moments via RAG          │
│        Priority: MEDIUM                              │
└─────────────────────────────────────────────────────┘
```

**Location**: `backend/src/chat/therapist-context.service.ts:120-228`

### Context Building Algorithm

```typescript
// Simplified algorithm flow
async buildContext(currentSession, userId, conversationId, tokenBudget = 6000) {

  // 1. CURRENT SESSION (40% budget = 2,400 tokens)
  const currentSessionBudget = Math.floor(tokenBudget * 0.4);
  let sessionMessages = currentSession;

  if (estimateTokens(sessionMessages) > currentSessionBudget) {
    // Truncate older messages, keep most recent
    sessionMessages = truncateMessages(currentSession, currentSessionBudget);
  }

  // 2. RECENT HISTORY (35% budget = 2,100 tokens)
  const historyBudget = Math.floor(tokenBudget * 0.35);
  const recentConversations = await getRecentConversations(userId, 4, 90); // 4 convs, 90 days

  // Summarize conversations: date, topics, message count, preview
  const conversationSummaries = recentConversations.map(summarizeConversation);

  if (estimateTokens(conversationSummaries) > historyBudget) {
    // Reduce number of conversations to fit budget
    conversationSummaries = fitToBudget(conversationSummaries, historyBudget);
  }

  // 3. RELEVANT PAST CONTEXT (25% budget = 1,500 tokens)
  const similarBudget = Math.floor(tokenBudget * 0.25);
  const lastUserMessage = getLastUserMessage(currentSession);

  // Semantic search in Weaviate
  const similarMoments = await searchSimilarConversations(
    lastUserMessage.content,
    userId,
    5, // limit
    0.7 // similarity threshold
  );

  if (estimateTokens(similarMoments) > similarBudget) {
    // Reduce results to fit budget
    similarMoments = fitToBudget(similarMoments, similarBudget);
  }

  // 4. FORMAT FOR LLM
  return formatForLLM({
    currentSession: sessionMessages,
    recentHistory: conversationSummaries,
    relevantPastContext: similarMoments,
    tokenUsage: calculateUsage()
  });
}
```

### Context Output Format

The formatted context injected into system prompt:

```
=== THERAPEUTIC CONTEXT ===

=== RECENT CONVERSATION HISTORY ===

Session 1 (2025-01-02):
  Title: Work Stress and Anxiety
  Topics: anxiety, stress, work
  Messages: 24
  Started with: I've been feeling really overwhelmed at work lately...

Session 2 (2024-12-28):
  Title: Holiday Family Dynamics
  Topics: relationships, family, stress
  Messages: 18
  Started with: The holidays were tough with my family...

=== RELEVANT PAST MOMENTS ===
(Similar situations from past conversations)

1. [87% relevant]
   User mentioned feeling overwhelmed with deadlines and struggling to sleep.
   This led to discussion about work-life boundaries...

2. [79% relevant]
   User described physical symptoms of anxiety during presentations...

=== CURRENT SESSION ===
[Patient]: I had another panic attack today during the meeting.
[Therapist]: I'm sorry you experienced that. Can you tell me what you noticed...

[Context: 4,823/6,000 tokens (80.4%)]
```

**Location**: `backend/src/chat/therapist-context.service.ts:397-447`

### Conversation Summarization

Recent conversations are summarized with key metadata:

**Extracted Information:**
- **Title**: Auto-generated by LLM after first exchange
- **Topics**: Keyword matching (anxiety, depression, stress, sleep, relationships, work)
- **Date**: Conversation start date
- **Message Count**: Number of exchanges
- **First Message Preview**: First 100 characters

**Implementation**: `backend/src/chat/therapist-context.service.ts:255-284`

### Semantic Search Integration

Uses **Weaviate** vector database for similarity search:

```typescript
// Find conversations similar to current topic
const results = await weaviateClient.graphql
  .get()
  .withClassName('ConversationEmbedding')
  .withFields('conversationId turnIndex speaker textChunk timestamp _additional { distance }')
  .withNearText({ concepts: [query] })
  .withLimit(limit * 2)
  .do();

// Convert distance to similarity score
similarity = 1 - (distance / 2); // Cosine distance to 0-1 scale
```

**Similarity Threshold**: 0.7 (70% similar minimum)
**Location**: `backend/src/chat/therapist-context.service.ts:289-332`

### Token Estimation

Custom token estimation algorithm (avoids OpenAI API calls):

```typescript
estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.ceil(words / 1.33); // ~1.33 words per token average
}
```

**Accuracy**: ±10% compared to actual tokenization (acceptable for budgeting)

### Performance Optimization

- **Caching**: User context cached for 5 minutes (`user_context:${userId}:${conversationId}`)
- **Async Loading**: RAG search doesn't block response if it fails
- **Parallel Queries**: Recent conversations and similar moments fetched concurrently
- **Graceful Degradation**: If context building fails, continues with minimal context

**Measured Performance:**
- Context building: 200-400ms
- RAG search: 100-150ms
- Total overhead: ~300-550ms

**Location**: `backend/src/chat/chat.service.ts:409-480`

### Product Considerations

#### Why This Approach?
1. **Therapist-Like Memory**: Mimics how human therapists recall past sessions
2. **Budget Enforcement**: Prevents context bloat and API cost overruns
3. **Priority-Based**: Most relevant information gets most space
4. **Scalability**: Works for users with hundreds of conversations

#### Configuration Flags
- `ENABLE_THERAPIST_CONTEXT`: Toggle entire system (default: true)
- `ENABLE_RAG`: Toggle semantic search component (default: false - needs configuration)
- `RAG_LIMIT`: Number of similar conversations to retrieve (default: 3)
- `RAG_SIMILARITY_THRESHOLD`: Minimum similarity score (default: 0.5)

#### Future Enhancements
- User-specific budget tuning
- Long-term memory summarization (beyond 90 days)
- Sentiment-weighted retrieval
- Topic clustering for better organization

---

## Database Architecture

### PostgreSQL Schema (RDS)

Angel uses **PostgreSQL 8.16.3** with **TypeORM 0.3.27** for relational data storage.

### Entity Relationship Diagram

```
┌──────────────┐
│     User     │
│──────────────│
│ id (UUID)    │◄──────┐
│ email        │       │
│ name         │       │
│ otp          │       │
│ isVerified   │       │
│ clinicalProfile│     │
└──────────────┘       │
       │               │
       │ 1:N           │ 1:N
       │               │
       ▼               │
┌──────────────┐       │
│ Conversation │       │
│──────────────│       │
│ id (UUID)    │       │
│ userId (FK)  │───────┘
│ title        │
│ createdAt    │
└──────────────┘
       │
       │ 1:N
       │
       ▼
┌──────────────┐
│   Message    │
│──────────────│
│ id (UUID)    │
│ conversationId│
│ senderType   │ (enum: USER, BOT)
│ content      │
│ createdAt    │
└──────────────┘

┌──────────────┐
│   MoodLog    │
│──────────────│
│ id (UUID)    │
│ userId (FK)  │───────┐
│ mood (1-5)   │       │
│ note         │       │
│ createdAt    │       │
└──────────────┘       │
                       │
┌──────────────┐       │
│ Medication   │       │
│──────────────│       │
│ id (UUID)    │       │
│ userId (FK)  │───────┤
│ name         │       │
│ dosage       │       │
│ frequency    │       │
└──────────────┘       │
       │               │
       │ 1:N           │
       │               │
       ▼               │
┌──────────────┐       │
│MedicationLog │       │
│──────────────│       │
│ id (UUID)    │       │
│ medicationId │       │
│ takenAt      │       │
└──────────────┘       │
                       │
┌──────────────┐       │
│UserPreference│       │
│──────────────│       │
│ id (UUID)    │       │
│ userId (FK)  │───────┘
│ key          │
│ value        │
└──────────────┘
```

### Core Entities

#### 1. User Entity
**Location**: `backend/src/entities/user.entity.ts`

```typescript
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  otp: string; // For email-based authentication

  @Column({ type: 'timestamp', nullable: true })
  otpExpiresAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'text', nullable: true })
  clinicalProfile: string; // Auto-generated user summary

  @Column({ type: 'timestamp', nullable: true })
  clinicalProfileUpdatedAt: Date; // Updated once per day

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToMany(() => Conversation, (conversation) => conversation.user)
  conversations: Conversation[];

  @OneToMany(() => MoodLog, (moodLog) => moodLog.user)
  moodLogs: MoodLog[];

  @OneToMany(() => Medication, (medication) => medication.user)
  medications: Medication[];
}
```

**Key Fields:**
- `clinicalProfile`: LLM-generated summary of user's mental health patterns, updated daily
- `otp`: Time-based one-time password for email authentication (no password storage)

#### 2. Conversation Entity
**Location**: `backend/src/entities/conversation.entity.ts`

```typescript
@Entity()
@Index(['user', 'createdAt']) // Composite index for user's conversation list
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.conversations)
  @Index()
  user: User;

  @Column({ nullable: true })
  title: string; // Auto-generated after first exchange

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
}
```

**Indexing Strategy:**
- Composite index on `(user, createdAt)` for fast conversation list queries
- Separate index on `createdAt` for global chronological queries

#### 3. Message Entity
**Location**: `backend/src/entities/message.entity.ts`

```typescript
export enum SenderType {
  USER = 'USER',
  BOT = 'BOT',
}

@Entity()
@Index(['conversation', 'createdAt']) // For message history queries
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  @Index()
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: SenderType,
  })
  senderType: SenderType;

  @Column('text')
  content: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
```

**Design Decision**: No `userId` on messages (accessed via conversation)

#### 4. MoodLog Entity
```typescript
@Entity()
export class MoodLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.moodLogs)
  user: User;

  @Column({ type: 'int' })
  mood: number; // 1-5 scale

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Mood Scale:**
- 1: Very Bad
- 2: Bad
- 3: Okay
- 4: Good
- 5: Great

#### 5. UserPreference Entity
```typescript
@Entity()
export class UserPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  key: string;

  @Column('text')
  value: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Use Case**: Store user preferences (notification settings, theme, etc.) as key-value pairs

### Weaviate Vector Database

**Purpose**: Store conversation embeddings for semantic search (RAG)

#### Schema: ConversationEmbedding

```typescript
{
  class: 'ConversationEmbedding',
  vectorizer: 'none', // We provide our own vectors from OpenAI
  properties: [
    {
      name: 'conversationId',
      dataType: ['text'],
      description: 'UUID of the conversation'
    },
    {
      name: 'turnIndex',
      dataType: ['int'],
      description: 'Turn number in conversation (each user-bot exchange = 1 turn)'
    },
    {
      name: 'speaker',
      dataType: ['text'],
      description: 'CUSTOMER or AGENT'
    },
    {
      name: 'textChunk',
      dataType: ['text'],
      description: 'The actual message content'
    },
    {
      name: 'timestamp',
      dataType: ['number'],
      description: 'Unix timestamp of message'
    }
  ]
}
```

**Location**: `backend/src/config/weaviate.config.ts`

#### Embedding Storage Flow

```
Message Saved to PostgreSQL
    ↓
Generate OpenAI Embedding (async, non-blocking)
    ├─ Model: text-embedding-3-small
    ├─ Dimension: 1536
    └─ Cost: ~$0.00002 per message
    ↓
Store in Weaviate
    ├─ conversationId: UUID
    ├─ turnIndex: calculated from message count
    ├─ speaker: USER → CUSTOMER, BOT → AGENT
    ├─ textChunk: message content
    ├─ vector: embedding array
    └─ timestamp: message timestamp
```

**Location**: `backend/src/chat/chat.service.ts:792-837` and `backend/src/chat/rag.service.ts:32-61`

### Database Migrations

**Strategy**: TypeORM migrations for schema changes

**Example Migration**: Rename `conversationContext` → `clinicalProfile`
```typescript
// backend/src/migrations/1703206800000-RenameToClinicalProfile.ts
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.renameColumn('user', 'conversationContext', 'clinicalProfile');
}
```

### Performance Optimizations

#### PostgreSQL Indexes
- **Composite**: `(user, createdAt)` on conversations - 10x faster list queries
- **Single**: `conversationId` on messages - instant message lookup
- **Timestamp**: `createdAt` on messages - chronological sorting

#### Weaviate HNSW Index
- **Algorithm**: Hierarchical Navigable Small World
- **Purpose**: O(log N) vector similarity search
- **Configuration**: Default parameters (adequate for <10M vectors)

#### Connection Pooling
```typescript
// backend/src/config/database.config.ts
{
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT),
  extra: {
    max: 20, // Maximum pool size
    min: 5,  // Minimum pool size
    idleTimeoutMillis: 30000,
  }
}
```

### Data Retention

**Current Policy**: Indefinite retention (no automatic deletion)

**Future Considerations:**
- GDPR compliance: User-initiated data deletion
- Automatic archival after 2 years of inactivity
- Anonymization for research/training purposes

---

## Safety & Moderation Systems

Angel implements **multi-layer safety mechanisms** to protect users and ensure ethical AI behavior.

### Layer 1: Input Validation & Sanitization

**Purpose**: Prevent malicious input before any processing

**Implementation**: `backend/src/chat/content-moderation.service.ts:77-122`

#### Validation Checks

1. **Empty Content**: Reject whitespace-only messages
2. **Length Limits**: Max 5,000 characters (configurable via `MAX_MESSAGE_LENGTH`)
3. **Excessive Repetition**: Detect spam (same character >10x, same word >5x)
4. **Control Characters**: Strip invalid ASCII control characters
5. **Injection Patterns**: Detect XSS attempts (`<script>`, `javascript:`, event handlers)

**Sanitization**:
- Strip control characters (except newlines/tabs)
- Normalize whitespace
- Trim leading/trailing spaces

### Layer 2: Content Moderation (OpenAI Moderation API)

**Purpose**: Detect harmful content in user input AND AI output

**Implementation**: `backend/src/chat/content-moderation.service.ts:127-170` (input), `175-221` (output)

#### Moderation Categories (11 Total)

| Category | Threshold (Input) | Threshold (Output) | Action |
|----------|-------------------|--------------------|--------|
| hate | 0.8 | Stricter | Block |
| hate/threatening | 0.5 | Stricter | Block |
| harassment | 0.7 | Stricter | Warn/Block |
| harassment/threatening | 0.5 | Stricter | Block |
| self-harm | 0.3 | 0.3 | **Allow** (mental health context) |
| self-harm/intent | 0.3 | 0.3 | **Allow** (handled by crisis detection) |
| self-harm/instructions | 0.5 | Stricter | Block |
| sexual | 0.8 | Stricter | Block |
| sexual/minors | 0.1 | 0.1 | **Block** (zero tolerance) |
| violence | 0.7 | Stricter | Warn/Block |
| violence/graphic | 0.6 | Stricter | Block |

**Location**: `backend/src/chat/content-moderation.service.ts:48-60`

#### Moderation Actions

```typescript
enum ModerationAction {
  ALLOW = 'allow',       // Content is safe
  WARN = 'warn',         // Borderline content, log warning but allow
  BLOCK = 'block',       // Block content, return safe alternative
  ESCALATE = 'escalate', // Requires human review (future)
}
```

#### Safe Alternative Responses

When content is blocked, return context-appropriate safe responses:

```typescript
// Examples:
"I'm here to provide supportive and helpful conversation. I noticed the
conversation might be heading in an uncomfortable direction. Let's focus
on how I can support you in a constructive way."

"I'm concerned about what you've shared. If you're experiencing violence,
please reach out to local authorities or call 911. I'm here to support
you emotionally."
```

**Location**: `backend/src/chat/content-moderation.service.ts:226-247`

### Layer 3: Crisis Detection

**Purpose**: Identify users in mental health crisis and provide immediate resources

**Implementation**: `backend/src/chat/crisis-detection.service.ts`

#### Crisis Levels (5 Tiers)

```typescript
enum CrisisLevel {
  NONE = 'none',
  LOW = 'low',        // General distress, sad mood
  MEDIUM = 'medium',  // Significant distress, hopelessness
  HIGH = 'high',      // Self-harm thoughts, suicidal ideation
  CRITICAL = 'critical' // Immediate danger, active plan
}
```

#### Detection Patterns (Regex-Based)

**CRITICAL Patterns:**
```javascript
/\b(kill myself|suicide|end my life|take my life|want to die)\b/i
/\b(going to (die|kill)|plan(ning)? to (die|suicide))\b/i
/\b(overdose|jump(ing)? off|hang(ing)? myself)\b/i
/\b(pills? ready|have .* ready to)\b/i
/\b(goodbye (world|everyone)|final (message|goodbye))\b/i
/\b(can'?t go on|don'?t want to live)\b/i
```

**HIGH Patterns:**
```javascript
/\b(suicidal|feeling suicidal)\b/i
/\b(self[- ]?harm|thinking about self[- ]?harm)\b/i
/\b(cut(ting)? (my)?self|hurt(ing)? (my)?self)\b/i
/\b(better off dead|world.*better without me)\b/i
/\b(no reason to live|nothing to live for)\b/i
```

**Location**: `backend/src/chat/crisis-detection.service.ts:32-63`

#### Crisis Intervention Response

When HIGH or CRITICAL crisis detected:

```
⚠️ **IMMEDIATE SUPPORT AVAILABLE** ⚠️

I'm deeply concerned about what you've shared. Your safety is the
top priority right now.

**Please reach out to these resources immediately:**

• 988 Suicide & Crisis Lifeline: Call or text 988
  24/7 free and confidential support for people in distress

• Crisis Text Line: Text HOME to 741741
  Free 24/7 text support with a trained crisis counselor

• Emergency Services: Call 911
  For immediate life-threatening emergencies

• Veterans Crisis Line: Call 988 then press 1
  Support for veterans and their families

I'm here with you, but these trained professionals can provide the
immediate, specialized support you need right now. You don't have to
face this alone.

Would you like to talk about what brought you here today, or would
you prefer to connect with one of these resources first?
```

**Location**: `backend/src/chat/crisis-detection.service.ts:192-229`

#### Confidence Scoring

```typescript
calculateConfidence(level, matchCount) {
  const baseConfidence = {
    CRITICAL: 0.95,
    HIGH: 0.85,
    MEDIUM: 0.70,
    LOW: 0.60,
    NONE: 0
  };

  // Increase confidence with multiple matches
  return Math.min(baseConfidence[level] + (matchCount - 1) * 0.05, 1.0);
}
```

#### Crisis Logging

All crisis events logged for monitoring and potential human intervention:

```typescript
this.logger.error('CRISIS_EVENT', {
  userId,
  crisisLevel,
  confidence,
  matchedKeywords,
  timestamp,
  // Note: Message content NOT logged for privacy
});
```

**Production Requirements:**
1. Send to monitoring service (Datadog, Sentry)
2. Trigger alerts for human review
3. Store in audit log for compliance
4. Potentially notify emergency contacts (if configured)

**Location**: `backend/src/chat/chat.service.ts:770-787`

### Safety Pipeline Flow

```
User Message
    ↓
┌─────────────────────────────┐
│ 1. Input Validation         │ ← Reject malformed input
│    (length, control chars)  │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│ 2. Content Moderation       │ ← OpenAI Moderation API
│    (hate, harassment, etc)  │   (Block harmful content)
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│ 3. Crisis Detection         │ ← Regex pattern matching
│    (5-level severity)       │   (Provide resources)
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│ 4. AI Response Generation   │ ← LLM with crisis context
│    (includes crisis prompt) │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│ 5. Output Moderation        │ ← OpenAI Moderation API
│    (stricter thresholds)    │   (Ensure AI safety)
└─────────────────────────────┘
    ↓
Safe Response to User
```

### Configuration Flags

```bash
# Enable/disable content moderation
ENABLE_CONTENT_MODERATION=true

# Strict mode: fail closed on errors vs fail open
MODERATION_STRICT_MODE=false

# Enable intelligent context (includes crisis-aware context)
ENABLE_THERAPIST_CONTEXT=true

# Emergency resources by country
EMERGENCY_COUNTRY=US
```

### Product Metrics & Monitoring

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Input Moderation Block Rate | <5% | >10% |
| Output Moderation Block Rate | <0.1% | >1% |
| Crisis Detection Rate | N/A | N/A |
| False Positive Crisis Alerts | <10% | >20% |
| Crisis Event Response Time | <3s | >5s |

### Ethical Considerations

1. **Self-Harm Content**: Lower threshold (0.3) but ALLOW in mental health context - users need to express feelings
2. **Crisis Detection**: Keyword-based (not LLM-based) to avoid model biases
3. **Privacy**: Message content not logged during crisis events, only metadata
4. **Autonomy**: Encourage professional help, never force or manipulate
5. **Boundaries**: Clear communication that Angel is NOT a therapist

---

## Key Features & User Workflows

### Feature 1: Text-Based Chat

**User Flow:**
```
1. User opens app → Auth screen (if not logged in)
2. Enter email → Receive OTP → Verify OTP → Login
3. Navigate to Chat screen
4. Type message → Send
5. See typing indicator → Receive response
6. Continue conversation
7. Conversation auto-titled after first exchange
```

**Technical Flow:**
```
POST /chat/send
  ↓
Input validation & sanitization
  ↓
Content moderation (OpenAI)
  ↓
Crisis detection (regex)
  ↓
Get/create conversation (auto-create new)
  ↓
Save user message to PostgreSQL
  ↓
Build context (6K token budget)
  ├─ Current session (40%)
  ├─ Recent history (35%)
  └─ Similar moments (25%)
  ↓
Generate AI response (OpenAI/Gemini)
  ↓
Output moderation
  ↓
Save bot message to PostgreSQL
  ↓
Return response to client
  ↓
Async: Store embeddings in Weaviate
Async: Generate conversation title (first exchange)
Async: Update clinical profile (daily)
```

**Key Files:**
- Controller: `backend/src/chat/chat.controller.ts`
- Service: `backend/src/chat/chat.service.ts:64-204`
- Mobile: `mobile-app/src/screens/ChatScreen.tsx`

**Rate Limiting:** 20 messages per minute per user

### Feature 2: Voice Chat

**User Flow:**
```
1. In Chat screen, tap microphone icon
2. Hold to record voice message
3. Release to stop recording
4. Audio automatically uploaded & transcribed
5. See transcribed text in chat
6. Receive AI response (text + audio)
7. Play audio response
```

**Technical Flow:**
```
Mobile app records audio (Expo.Audio)
  ├─ iOS: Core Audio Format (CAF)
  └─ Android: M4A
  ↓
Upload to POST /voice/message (multipart/form-data)
  ↓
Detect MIME type (buffer header analysis)
  ↓
Transcribe with OpenAI Whisper
  (Fallback: Google Cloud Speech-to-Text)
  ↓
Send transcribed text to chat service (standard flow)
  ↓
Generate AI text response
  ↓
Convert response to speech (Google Cloud TTS)
  ├─ Voice: en-US-Neural2-F (female)
  ├─ Format: MP3
  └─ Rate: 0.95x (slightly slower)
  ↓
Return { text, audio: base64 } to client
  ↓
Mobile plays audio (Expo.Audio)
```

**Key Files:**
- Controller: `backend/src/chat/voice.controller.ts`
- Service: `backend/src/chat/voice.service.ts`
- Mobile: `mobile-app/src/screens/ChatScreen.tsx` (voice recording logic)

**Audio Specs:**
- Sample Rate: 16kHz
- Channels: Mono (1)
- Bit Depth: 16-bit
- Formats: WAV, CAF, MP3, M4A, FLAC, OGG

### Feature 3: Mood Logging

**User Flow:**
```
1. Navigate to Mood screen
2. Select mood (1-5 scale with emoji)
3. Optionally add text note
4. Submit
5. View mood history (chart)
6. See mood trends (average, patterns)
```

**Technical Flow:**
```
POST /mood/log
  ↓
Save MoodLog to PostgreSQL
  ├─ userId
  ├─ mood (1-5)
  ├─ note (optional)
  └─ timestamp
  ↓
GET /mood/stats
  ↓
Calculate statistics:
  ├─ Average mood (last 7 days)
  ├─ Average mood (last 30 days)
  ├─ Trend (improving/declining/stable)
  └─ Most common mood
  ↓
Return stats + history to client
  ↓
Mobile renders chart (mood over time)
```

**Key Files:**
- Backend: `backend/src/mood/mood.service.ts`, `mood.controller.ts`
- Mobile: `mobile-app/src/screens/MoodScreen.tsx`
- Entity: `backend/src/entities/mood-log.entity.ts`

**Mood Scale:**
1. Very Bad 😢
2. Bad 😕
3. Okay 😐
4. Good 🙂
5. Great 😄

### Feature 4: Conversation History

**User Flow:**
```
1. Navigate to Conversations screen
2. See list of past conversations
   - Auto-generated title
   - Last message timestamp
   - Message count
3. Tap conversation to open
4. View full conversation history
5. Continue conversation or start new
```

**Technical Flow:**
```
GET /chat/conversations?limit=50
  ↓
Query conversations ordered by createdAt DESC
  ├─ Include message count
  ├─ Include last message preview
  └─ Limit to last 50 conversations
  ↓
Return conversation list
  ↓
User taps conversation
  ↓
GET /chat/conversations/:id
  ↓
Query conversation with all messages
  ↓
Return conversation + messages ordered by createdAt
  ↓
Mobile renders conversation thread
```

**Key Files:**
- Backend: `backend/src/chat/chat.service.ts:525-547`
- Mobile: `mobile-app/src/screens/ConversationHistoryScreen.tsx`

**Auto-Titling:**
- Triggered after first exchange (2 messages)
- Uses LLM to generate 3-6 word title
- Async process (doesn't block chat)
- Examples: "Work Stress and Anxiety", "Relationship Concerns", "Sleep Issues"

**Implementation**: `backend/src/chat/chat.service.ts:552-630`

### Feature 5: Real-Time Communication (WebSocket)

**Purpose**: Instant message delivery without polling

**User Flow:**
```
1. User opens Chat screen
2. Mobile connects to WebSocket
3. User types → Send button clicked
4. Emit 'sendMessage' event via WebSocket
5. Server processes (standard pipeline)
6. Server emits 'newMessage' event
7. Mobile receives message instantly
8. Display in chat thread
```

**Technical Implementation:**
```typescript
// Backend Gateway
@WebSocketGateway({ cors: true })
export class ChatGateway {
  @SubscribeMessage('sendMessage')
  async handleMessage(client: Socket, payload: any) {
    // Extract userId from JWT token
    const user = await this.authenticateSocket(client);

    // Process message (standard chat service)
    const response = await this.chatService.sendMessage(
      user.id,
      payload.content,
      payload.conversationId
    );

    // Emit response back to client
    client.emit('newMessage', response);
  }
}
```

**Key Files:**
- Gateway: `backend/src/chat/chat.gateway.ts`
- Mobile: Socket.io client in `mobile-app/src/screens/ChatScreen.tsx`

**Authentication:** JWT token validated on socket connection

**Events:**
- `sendMessage` (client → server): User sends message
- `newMessage` (server → client): Bot response ready
- `typing` (client → server): User is typing (future)

### Feature 6: User Profile Management

**User Flow:**
```
1. Navigate to Profile screen
2. View current profile:
   - Name
   - Email
   - Account created date
3. Edit name → Save
4. Update clinical profile (automated daily)
5. Logout option
```

**Clinical Profile Auto-Update:**
```
On first message of the day:
  ↓
Check if 24+ hours since last update
  ↓
Yes → Trigger async profile generation
  ↓
Fetch last 50 user messages
  ↓
LLM summarizes:
  ├─ Key themes discussed
  ├─ Life situations/challenges
  ├─ Relevant background info
  └─ Goals mentioned
  ↓
Save to user.clinicalProfile
  ↓
Used in subsequent conversations for context
```

**Location**: `backend/src/chat/chat.service.ts:677-765`

**Example Clinical Profile:**
```
User has been discussing work-related stress and anxiety, particularly
around upcoming presentations and deadlines. They mention difficulty
sleeping when stressed and have expressed interest in learning coping
strategies. Previously shared they're in their late 20s, working in tech,
and living alone. Finds exercise helpful but struggles to maintain routine
during high-stress periods.
```

### Feature 7: Multi-Conversation Support

**Recent Change:** System now creates **new conversation for each session** by default

**Previous Behavior:** Reused last active conversation
**Current Behavior:** Always creates new conversation (unless `conversationId` explicitly provided)

**Rationale:**
1. Clear session boundaries (like therapist appointments)
2. Better conversation organization
3. Clearer conversation titles
4. User can still continue old conversations via history

**Implementation**: `backend/src/chat/chat.service.ts:210-234`

---

## Technical Specifications

### API Endpoints

#### Authentication
```
POST /auth/register
  Body: { email: string }
  Response: { message: "OTP sent to email" }

POST /auth/verify
  Body: { email: string, otp: string }
  Response: { access_token: string, user: User }

POST /auth/login
  Body: { email: string }
  Response: { message: "OTP sent to email" }
```

#### Chat
```
POST /chat/send
  Headers: { Authorization: "Bearer <token>" }
  Body: { content: string, conversationId?: string }
  Response: Message
  Rate Limit: 20 req/min

GET /chat/history?limit=50
  Headers: { Authorization: "Bearer <token>" }
  Response: Message[]

GET /chat/conversations?limit=50
  Headers: { Authorization: "Bearer <token>" }
  Response: Conversation[]
  Rate Limit: 30 req/min

GET /chat/conversations/:id
  Headers: { Authorization: "Bearer <token>" }
  Response: Conversation (with messages)
```

#### Voice
```
POST /voice/message
  Headers: {
    Authorization: "Bearer <token>",
    Content-Type: "multipart/form-data"
  }
  Body: FormData { audio: File, conversationId?: string }
  Response: {
    transcription: string,
    response: string,
    audio: string (base64),
    message: Message
  }
```

#### Mood
```
POST /mood/log
  Headers: { Authorization: "Bearer <token>" }
  Body: { mood: number (1-5), note?: string }
  Response: MoodLog

GET /mood/history?limit=30
  Headers: { Authorization: "Bearer <token>" }
  Response: MoodLog[]

GET /mood/stats
  Headers: { Authorization: "Bearer <token>" }
  Response: {
    averageMood7Days: number,
    averageMood30Days: number,
    trend: string,
    mostCommonMood: number
  }
```

#### Users
```
GET /users/me
  Headers: { Authorization: "Bearer <token>" }
  Response: User

PUT /users/me
  Headers: { Authorization: "Bearer <token>" }
  Body: { name?: string, email?: string }
  Response: User
```

#### Health
```
GET /
  Response: { message: "Angel API is running" }

GET /health
  Response: { status: "ok", timestamp: string }
```

### Environment Variables

#### Backend (.env)
```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=password
DATABASE_NAME=angel
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=false

# AI Providers
AI_PROVIDER=openai  # or 'gemini'
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash

# Google Cloud (for Speech APIs)
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}

# Weaviate
WEAVIATE_SCHEME=http
WEAVIATE_HOST=localhost:8080
WEAVIATE_API_KEY_ALLOWED_KEYS=...

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Email (OTP)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password

# AWS
AWS_REGION=us-east-1
PROMPTS_S3_BUCKET=angel-prompts
PROMPTS_S3_KEY=angel-system-prompt.json

# Features
ENABLE_CONTENT_MODERATION=true
MODERATION_STRICT_MODE=false
ENABLE_THERAPIST_CONTEXT=true
ENABLE_RAG=false
RAG_LIMIT=3
RAG_SIMILARITY_THRESHOLD=0.5

# Rate Limiting
MAX_MESSAGE_LENGTH=5000

# Emergency
EMERGENCY_COUNTRY=US
```

#### Mobile (.env)
```bash
API_URL=http://localhost:3000
APP_ENV=development
API_TIMEOUT=30000
DEBUG_MODE=true
```

### Technology Stack Summary

#### Backend
- **Runtime**: Node.js 18+
- **Framework**: NestJS 11.0.1 (TypeScript)
- **Database ORM**: TypeORM 0.3.27
- **Validation**: class-validator, class-transformer
- **Caching**: cache-manager 7.2.5 (in-memory)
- **WebSocket**: Socket.io 4.8.1
- **Authentication**: JWT with Passport
- **HTTP Client**: Axios (for external APIs)
- **Testing**: Jest 30.0.0

**Key Dependencies:**
```json
{
  "openai": "^4.x",
  "@google/generative-ai": "^1.x",
  "@google-cloud/text-to-speech": "^5.x",
  "@google-cloud/speech": "^6.x",
  "weaviate-ts-client": "^2.x",
  "pg": "^8.16.3",
  "typeorm": "^0.3.27"
}
```

#### Mobile
- **Framework**: React Native 0.81.5
- **Bundler**: Expo 54.0.24
- **Language**: TypeScript
- **UI Library**: Native Base 3.4.28
- **Navigation**: React Navigation 7.1.20
- **State Management**: TanStack React Query 5.90.10
- **HTTP Client**: Axios 1.13.2
- **WebSocket**: socket.io-client 4.8.1
- **Audio**: expo-av (recording/playback)
- **Storage**: AsyncStorage

#### Infrastructure
- **Cloud Provider**: AWS
- **Compute**: ECS with Fargate
- **Database**: RDS PostgreSQL 15
- **Vector DB**: Self-hosted Weaviate on ECS
- **Load Balancer**: Application Load Balancer
- **Storage**: S3 (prompts, future: audio files)
- **Networking**: VPC with public/private subnets
- **IaC**: CloudFormation templates

---

## Infrastructure & Deployment

### AWS Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│          Application Load Balancer (ALB)                     │
│  - HTTPS Listener (port 443)                                │
│  - Target Group: Backend ECS Service                         │
└───────────────────┬─────────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│  Backend ECS     │  │  Weaviate ECS    │
│  Service         │  │  Service         │
│  (Fargate)       │  │  (Fargate)       │
│  - 2-4 tasks     │  │  - 1 task        │
│  - Auto-scaling  │  │  - Persistent    │
│                  │  │    EBS volume    │
└────────┬─────────┘  └──────────────────┘
         │
         ▼
┌──────────────────┐
│  RDS PostgreSQL  │
│  - Multi-AZ      │
│  - Auto backup   │
│  - 20GB storage  │
└──────────────────┘

┌──────────────────┐
│  S3 Bucket       │
│  - Prompts JSON  │
│  - Lambda trigger│
└──────────────────┘
```

### CloudFormation Stack Structure

Angel uses **9 CloudFormation stacks** for modular infrastructure:

1. **01-vpc.yaml**: VPC, subnets, internet gateway, NAT gateway
2. **02-ecs-cluster.yaml**: ECS cluster for containerized services
3. **03-rds.yaml**: PostgreSQL RDS instance with security groups
4. **04-alb.yaml**: Application Load Balancer with HTTPS listener
5. **05-weaviate-service.yaml**: Weaviate container on ECS
6. **06-backend-service.yaml**: NestJS backend on ECS
7. **07-prompts-s3.yaml**: S3 bucket for prompt storage
8. **08-prompts-lambda.yaml**: Lambda for hot-reloading prompts
9. **09-s3-event-notification.yaml**: S3 event trigger for Lambda

**Location**: `/cloudformation/` directory

### Deployment Process

#### Backend Deployment

```bash
# 1. Build Docker image
docker build -t angel-backend:latest ./backend

# 2. Tag for ECR
docker tag angel-backend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/angel-backend:latest

# 3. Push to ECR
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/angel-backend:latest

# 4. Update ECS service (rolling update)
aws ecs update-service \
  --cluster angel-cluster \
  --service angel-backend \
  --force-new-deployment
```

**Result**: Zero-downtime rolling update (ECS starts new tasks before stopping old ones)

#### Mobile App Deployment

```bash
# iOS
cd mobile-app
eas build --platform ios --profile production
eas submit --platform ios

# Android
eas build --platform android --profile production
eas submit --platform android
```

**Build Service**: Expo Application Services (EAS)

### Environment Management

**Environments:**
1. **Development**: Local Docker Compose
2. **Staging**: AWS ECS with test database
3. **Production**: AWS ECS with production RDS

**Configuration Strategy:**
- Base config in `.env.template`
- Environment-specific overrides in AWS Parameter Store
- Secrets in AWS Secrets Manager
- Mobile builds use Expo environment variables

### Database Migrations

```bash
# Generate migration from entity changes
npm run typeorm migration:generate -- -n MigrationName

# Run pending migrations
npm run typeorm migration:run

# Revert last migration
npm run typeorm migration:revert
```

**Deployment Strategy:**
1. Run migrations before deploying new backend version
2. Ensure backward compatibility (no breaking schema changes)
3. Use feature flags for data model changes

### Monitoring & Logging

**Current Implementation:**
- **Logging**: NestJS Logger (console output)
- **Health Checks**: `/health` endpoint polled by ALB
- **Error Tracking**: Try-catch with logging

**Production Recommendations:**
1. **Application Monitoring**: Datadog or New Relic
2. **Error Tracking**: Sentry
3. **Log Aggregation**: CloudWatch Logs or ELK stack
4. **Metrics**:
   - API latency (p50, p95, p99)
   - Error rates by endpoint
   - LLM API call duration
   - Database query performance
   - Crisis detection events
5. **Alerts**:
   - High error rate (>5%)
   - Slow API responses (>5s)
   - Database connection pool exhausted
   - LLM API failures
   - Crisis event spike

### Cost Optimization

**Current Cost Estimates (Monthly):**

| Service | Usage | Cost |
|---------|-------|------|
| ECS Fargate (Backend) | 2 tasks × 0.5 vCPU × 1 GB × 720h | ~$45 |
| ECS Fargate (Weaviate) | 1 task × 1 vCPU × 2 GB × 720h | ~$50 |
| RDS PostgreSQL (db.t3.micro) | 1 instance × 720h | ~$15 |
| ALB | 1 ALB + data transfer | ~$20 |
| OpenAI API | 1M tokens input + 500K output | ~$3 |
| Google Cloud STT/TTS | 1K minutes transcription + TTS | ~$15 |
| **Total** | | **~$148/month** |

**Cost Scaling (per 1,000 active users):**
- Storage: ~$5/month (PostgreSQL + Weaviate)
- LLM API: ~$150/month (avg 50 messages/user/month)
- STT/TTS: ~$75/month (avg 20 voice messages/user/month)
- **Estimated**: ~$230/1K users/month = **$0.23/user/month**

**Optimization Strategies:**
1. Use GPT-4o-mini/Gemini-Flash (already implemented)
2. Cache common responses (not implemented - future)
3. Batch embedding generation (implemented - async)
4. Use reserved RDS instances for production
5. Implement response streaming (future - reduces perceived latency)

---

## Performance Metrics

### Latency Breakdown

| Operation | Target | Actual | Location |
|-----------|--------|--------|----------|
| Input Validation | <10ms | ~5ms | chat.service.ts:72 |
| Content Moderation | <500ms | ~200-400ms | content-moderation.service.ts |
| Crisis Detection | <10ms | ~5ms | crisis-detection.service.ts |
| Context Building | <500ms | ~300-400ms | therapist-context.service.ts |
| RAG Search | <200ms | ~100-150ms | rag.service.ts |
| LLM API Call (OpenAI) | <2s | ~1.5s avg | chat.service.ts:333 |
| LLM API Call (Gemini) | <2s | ~1.8s avg | chat.service.ts:387 |
| Output Moderation | <500ms | ~200-400ms | content-moderation.service.ts |
| Embedding Storage | N/A (async) | ~500ms | rag.service.ts:32 |
| **Total E2E (Text)** | <3s | **~2-2.5s** | |
| **Total E2E (Voice)** | <6s | **~5-6s** | (includes STT + TTS) |

### Throughput

**Current Capacity:**
- **Backend**: 2 ECS tasks × 50 concurrent requests = **100 concurrent users**
- **Database**: PostgreSQL t3.micro = **~200 connections** (pooled to 20)
- **Weaviate**: Single instance = **~10K vectors/sec** search

**Bottlenecks:**
1. LLM API rate limits (OpenAI: 3,500 RPM on Tier 1)
2. Database connections (mitigated by pooling)
3. Weaviate single-instance (needs clustering for >100K users)

**Auto-Scaling Configuration:**
```yaml
# ECS Service Auto-Scaling (backend)
MinTasks: 2
MaxTasks: 10
TargetCPUUtilization: 70%
TargetMemoryUtilization: 80%
```

### Caching Strategy

**Implemented Caches:**
1. **User Context**: 5-minute TTL
   - Key: `user_context:${userId}:${conversationId}`
   - Reduces context building from 400ms to <1ms
2. **Chat History**: 2-minute TTL
   - Key: `chat_history:${userId}:${limit}`
   - Reduces DB queries for conversation list

**Cache Invalidation:**
- On new message sent
- On conversation created/updated
- Manual invalidation: `DELETE /cache/:key` (admin endpoint)

**Future Caching Opportunities:**
- LLM responses for common queries (FAQ-style)
- Embedding vectors (avoid regeneration)
- Mood statistics

### Database Query Performance

**Optimized Queries:**
1. **Get Conversations for User**:
   ```sql
   SELECT * FROM conversation
   WHERE userId = ?
   ORDER BY createdAt DESC
   LIMIT 50;
   ```
   - Index: `(userId, createdAt)` composite
   - Performance: ~10ms for 1K conversations

2. **Get Messages for Conversation**:
   ```sql
   SELECT * FROM message
   WHERE conversationId = ?
   ORDER BY createdAt ASC;
   ```
   - Index: `(conversationId, createdAt)` composite
   - Performance: ~5ms for 100 messages

3. **Get Recent Mood Logs**:
   ```sql
   SELECT * FROM mood_log
   WHERE userId = ?
   ORDER BY createdAt DESC
   LIMIT 30;
   ```
   - Index: `(userId, createdAt)` composite
   - Performance: ~5ms

**N+1 Query Prevention:**
- Use `relations` in TypeORM queries
- Example: `{ relations: ['messages'] }` loads messages in single query

### Mobile App Performance

**Bundle Size:**
- **iOS**: ~45 MB (initial download)
- **Android**: ~35 MB (initial download)
- **Over-the-Air (OTA) Updates**: ~2-5 MB

**Key Optimizations:**
1. **Code Splitting**: Lazy load screens
2. **Image Optimization**: Compressed assets
3. **Network**: Request deduplication with TanStack Query
4. **Memory**: Pagination for conversation history (50 at a time)

**Metrics:**
- **App Launch Time**: <2s (cold start)
- **Time to Interactive**: <3s
- **API Call Time**: ~2-3s (includes network latency)

---

## Security & Compliance

### Authentication & Authorization

**Authentication Method**: OTP (One-Time Password) via Email
- **No password storage**: Eliminates credential theft risk
- **OTP Expiry**: 10 minutes
- **OTP Length**: 6 digits
- **Hashing**: bcrypt with salt (for OTP storage)

**JWT Token:**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234654290
}
```
- **Expiry**: 7 days (configurable via `JWT_EXPIRES_IN`)
- **Secret**: `JWT_SECRET` environment variable
- **Algorithm**: HS256

**Authorization:**
- All endpoints except `/auth/*` and `/health` require valid JWT
- User can only access their own data (enforced by userId in queries)
- No role-based access control (single user type)

### Data Security

**Encryption:**
1. **In Transit**: HTTPS/TLS 1.3 (enforced by ALB)
2. **At Rest**:
   - RDS: Encrypted storage volumes (AWS KMS)
   - Weaviate: Encrypted EBS volumes
   - S3: Server-side encryption (SSE-S3)

**Sensitive Data Handling:**
- **Passwords**: Never stored (OTP-based auth)
- **OTP**: Hashed with bcrypt, expired after 10 min
- **Conversation Content**: Encrypted at rest in RDS
- **API Keys**: Stored in AWS Secrets Manager, never logged
- **Crisis Events**: Message content NOT logged (privacy)

**Data Retention:**
- **Current Policy**: Indefinite retention (user-controlled)
- **Future**: User-initiated deletion (GDPR right to erasure)

### Input Validation & Sanitization

**Layers:**
1. **DTO Validation**: class-validator decorators
   ```typescript
   class SendMessageDto {
     @IsString()
     @MinLength(1)
     @MaxLength(5000)
     content: string;

     @IsUUID()
     @IsOptional()
     conversationId?: string;
   }
   ```
2. **Content Sanitization**: Strip control characters, normalize whitespace
3. **Injection Prevention**: Detect XSS patterns, parameterized queries (TypeORM)

### API Rate Limiting

**Throttler Guards:**
```typescript
@UseGuards(ThrottlerGuard)
@Throttle(20, 60) // 20 requests per 60 seconds
@Post('send')
async sendMessage() { ... }
```

**Rate Limits:**
- `/chat/send`: 20 req/min
- `/chat/conversations`: 30 req/min
- `/voice/message`: 10 req/min (more expensive)
- `/mood/log`: 60 req/min

### Compliance Considerations

**HIPAA Compliance (Future):**
- ❌ **Not currently compliant** (mental health notes are PHI)
- Required changes:
  1. Business Associate Agreement with AWS
  2. Audit logging (all data access)
  3. Encryption key management
  4. User consent management
  5. Data retention policies

**GDPR Compliance (Partial):**
- ✅ **Right to Access**: GET /users/me
- ✅ **Right to Rectification**: PUT /users/me
- ⚠️ **Right to Erasure**: Not implemented (need DELETE /users/me)
- ✅ **Data Portability**: Conversation export (JSON)
- ✅ **Consent**: Implicit consent on registration
- ⚠️ **Data Processing Agreement**: Needed with OpenAI/Google

**Recommended Actions:**
1. Implement user data deletion API
2. Add explicit consent flow on registration
3. Create data processing agreements with AI providers
4. Implement audit logging for data access
5. Add privacy policy and terms of service
6. Conduct security audit (penetration testing)

### Vulnerability Management

**Current Practices:**
1. **Dependency Scanning**: `npm audit` in CI/CD
2. **Code Review**: Manual review for security issues
3. **Secret Management**: AWS Secrets Manager + Parameter Store

**Recommended Additions:**
1. **OWASP Top 10 Testing**: Regular security assessments
2. **Penetration Testing**: Annual third-party testing
3. **Bug Bounty Program**: Responsible disclosure
4. **Security Headers**: CSP, HSTS, X-Frame-Options
5. **SAST/DAST**: Static and dynamic analysis tools

---

## Scalability Considerations

### Current Scale

**Designed For:**
- **Users**: Up to 10,000 active users
- **Messages**: ~500K messages/month
- **Database**: ~10 GB storage
- **Vectors**: ~100K embeddings in Weaviate

**Current Limits:**
- ECS: 2-10 backend tasks (auto-scaling)
- RDS: Single t3.micro instance (limited to ~100 connections)
- Weaviate: Single instance (no clustering)

### Scaling Strategies

#### Horizontal Scaling (Backend)

**Already Implemented:**
- ECS auto-scaling based on CPU/memory
- Stateless backend (can scale horizontally)
- Load balancing via ALB

**To Scale to 100K Users:**
1. Increase ECS task count (10-50 tasks)
2. Use larger RDS instance (t3.large or r6g.xlarge)
3. Implement Weaviate clustering (3+ nodes)
4. Add Redis for distributed caching
5. Use CloudFront CDN for static assets

**Estimated Cost at 100K Users:** ~$2,500/month

#### Database Scaling

**Current Bottlenecks:**
1. Connection pool exhaustion (max 20 connections)
2. Single-instance (no read replicas)
3. No query caching

**Solutions:**
1. **Connection Pooling**: Increase pool size to 100-200
2. **Read Replicas**: Add 1-2 read replicas for conversation history queries
3. **Query Optimization**: Add more indexes, use materialized views
4. **Sharding**: Partition by userId for >1M users (future)

#### Vector Database Scaling (Weaviate)

**Current Limitations:**
- Single instance (~10K vectors/sec search)
- No high availability

**Scaling Path:**
1. **100K users**: Add 2 more Weaviate nodes (cluster mode)
2. **1M users**: Use Weaviate Cloud Service (managed)
3. **10M+ users**: Consider alternatives (Pinecone, Milvus)

#### LLM API Scaling

**Rate Limits (OpenAI Tier 1):**
- 3,500 requests/minute
- 90K tokens/minute

**At 100K users (avg 50 messages/month):**
- **Peak load**: ~1,000 requests/minute (3x off-peak)
- **Solution**: Upgrade to Tier 2 or Tier 3 ($100+ spend/month)

**Gemini Rate Limits:**
- 1,500 requests/minute (free tier)
- 1M requests/day (paid tier)

**Mitigation:**
- Queue requests during peak load
- Implement caching for common queries
- Use multiple API keys (round-robin)

### Caching Strategy for Scale

**Redis Implementation (Future):**

```typescript
// Distributed cache for multi-instance backend
const redis = new Redis({ host: 'redis.cluster.local' });

// Cache user context across all backend instances
await redis.set(
  `user_context:${userId}:${conversationId}`,
  JSON.stringify(context),
  'EX', 300 // 5 min TTL
);
```

**Cache Layers:**
1. **L1 Cache**: In-memory (per backend instance)
2. **L2 Cache**: Redis (shared across instances)
3. **L3 Cache**: Database query results

**Cache Hit Rate Target:** >80%

### Async Processing & Job Queues

**Current Async Operations (Non-Blocking):**
1. Embedding storage
2. Conversation title generation
3. Clinical profile update

**Future Enhancements (Job Queue):**

```typescript
// Bull queue for background jobs
const queue = new Bull('angel-jobs', { redis: redisConfig });

// Job: Generate embeddings
queue.add('generate-embeddings', {
  conversationId,
  userMessage,
  botMessage
});

// Job: Update clinical profile
queue.add('update-clinical-profile', { userId });
```

**Benefits:**
- Offload expensive operations
- Retry failed jobs
- Monitor job performance
- Prioritize critical jobs

### Multi-Region Deployment (Future)

**Architecture:**
```
Global User Base
    │
    ├─ Route 53 (Geo-routing)
    │
    ├─ us-east-1 (North America)
    │   ├─ ECS Cluster
    │   ├─ RDS (Primary)
    │   └─ Weaviate
    │
    ├─ eu-west-1 (Europe)
    │   ├─ ECS Cluster
    │   ├─ RDS (Read Replica)
    │   └─ Weaviate
    │
    └─ ap-southeast-1 (Asia)
        ├─ ECS Cluster
        ├─ RDS (Read Replica)
        └─ Weaviate
```

**Challenges:**
- Data replication latency (RDS cross-region)
- Weaviate multi-region sync
- Cost (3x infrastructure)

**When to Implement:** >500K users with global distribution

---

## Product Roadmap Considerations

### Short-Term Enhancements (0-6 months)

#### 1. Enhanced Crisis Management
- **Human Review Queue**: Flag HIGH/CRITICAL crises for therapist review
- **Emergency Contact Integration**: Allow users to add emergency contacts
- **Crisis Follow-Up**: Automated check-in 24h after crisis event

**Impact:** Improved safety and user trust
**Effort:** Medium (2-3 weeks)

#### 2. Conversation Analytics
- **Mood Correlation**: Link mood logs with conversation topics
- **Progress Tracking**: Visualize improvement over time
- **Topic Detection**: Auto-tag conversations (anxiety, depression, etc.)

**Impact:** User engagement and retention
**Effort:** Medium (3-4 weeks)

#### 3. Therapist-in-the-Loop
- **Human Handoff**: Seamless transfer to human therapist
- **Session Notes**: Export conversation summaries for therapists
- **Therapist Dashboard**: Review AI interactions, provide guidance

**Impact:** Revenue opportunity (B2B model)
**Effort:** High (6-8 weeks)

#### 4. Multi-Language Support
- **Language Detection**: Auto-detect user language
- **Translated Responses**: Support 5-10 languages
- **Localized Crisis Resources**: Country-specific emergency contacts

**Impact:** Global expansion
**Effort:** High (4-6 weeks per language)

### Medium-Term Enhancements (6-12 months)

#### 5. Personalized Therapeutic Approach
- **Therapy Style Selection**: User chooses CBT, DBT, or acceptance-based
- **Adaptive Prompting**: LLM adjusts based on user response
- **Goal Setting**: Structured goal tracking with progress monitoring

**Impact:** Better outcomes, premium feature
**Effort:** High (8-10 weeks)

#### 6. Group Therapy / Peer Support
- **Anonymous Group Chats**: Moderated peer support groups
- **Guided Group Sessions**: AI-facilitated group therapy
- **Safety Mechanisms**: Enhanced moderation for group context

**Impact:** Community building, differentiation
**Effort:** Very High (12-16 weeks)

#### 7. Integration with Health Platforms
- **Apple Health / Google Fit**: Sync mood, sleep, activity data
- **Wearables**: Heart rate variability for stress detection
- **Calendar Integration**: Detect stressful events (deadlines, appointments)

**Impact:** Richer context, better recommendations
**Effort:** Medium (4-6 weeks)

#### 8. Voice-Only Mode
- **Conversational AI**: Real-time voice conversation (no text)
- **Emotion Detection**: Analyze tone, pace, pauses
- **Voice Journaling**: Save voice notes with transcription

**Impact:** Accessibility, user preference
**Effort:** High (6-8 weeks)

### Long-Term Vision (12+ months)

#### 9. Multimodal AI
- **Vision**: Upload photos (journaling, art therapy)
- **Video**: Facial expression analysis for emotion detection
- **Biometrics**: Integration with wearables for real-time stress detection

**Impact:** Next-generation mental health support
**Effort:** Very High (20+ weeks)

#### 10. B2B/Enterprise
- **EAP Integration**: Partner with Employee Assistance Programs
- **Corporate Licensing**: Bulk licenses for companies
- **Custom Branding**: White-label solution
- **HIPAA Compliance**: Required for healthcare organizations

**Impact:** Revenue scaling
**Effort:** Very High (16-20 weeks + compliance)

#### 11. Clinical Trials & Research
- **Academic Partnerships**: Validate therapeutic efficacy
- **Outcome Measurement**: Standardized assessment tools (PHQ-9, GAD-7)
- **Publish Research**: Peer-reviewed papers on AI therapy

**Impact:** Credibility, regulatory approval path
**Effort:** Ongoing (6-12 months per study)

### Technical Debt & Infrastructure

#### Priority 1: Monitoring & Observability
- Implement Datadog/New Relic
- Set up error tracking (Sentry)
- Create dashboards for key metrics
- Configure alerts for critical issues

**Effort:** 2 weeks

#### Priority 2: Testing
- Increase unit test coverage (current: <30%, target: >80%)
- Add integration tests for critical flows
- E2E tests for mobile app
- Load testing (simulate 10K concurrent users)

**Effort:** 4-6 weeks

#### Priority 3: Security Hardening
- Penetration testing
- GDPR compliance (user data deletion)
- Implement audit logging
- Security headers and CSP

**Effort:** 3-4 weeks

#### Priority 4: Performance Optimization
- Implement Redis for distributed caching
- Optimize database queries (add indexes)
- Response streaming for LLM (reduce perceived latency)
- Image/asset optimization for mobile

**Effort:** 4 weeks

### Competitive Analysis

**Key Competitors:**
1. **Woebot**: Rule-based CBT chatbot, FDA-cleared
2. **Wysa**: AI chatbot with human therapist option
3. **Replika**: Companion AI (not therapy-focused)
4. **Talkspace/BetterHelp**: Human therapist platforms (not AI)

**Angel's Differentiators:**
- Multi-modal (text + voice)
- RAG-powered context (remembers past conversations)
- Safety-first architecture (multi-layer moderation + crisis detection)
- Provider flexibility (OpenAI + Gemini)
- Open to human-in-the-loop model

**Areas for Improvement:**
- FDA clearance (Woebot has this)
- Insurance acceptance (competitors have this)
- Proven clinical outcomes (need research)

---

## Conclusion

Angel is a production-ready AI mental health companion with a strong technical foundation. The platform demonstrates thoughtful engineering across:

1. **Safety**: Multi-layer moderation and crisis detection
2. **Intelligence**: Context-aware responses using RAG and LLM
3. **User Experience**: Multi-modal interaction (text + voice)
4. **Scalability**: Cloud-native architecture on AWS
5. **Flexibility**: Multi-provider support (OpenAI + Gemini)

### Key Strengths

- Comprehensive safety mechanisms (input/output moderation + crisis detection)
- Intelligent context management (6K token budget with RAG)
- Production-grade infrastructure (AWS ECS, RDS, Weaviate)
- Strong prompt engineering (23-section modular system prompt)
- Real-time communication (WebSocket support)

### Areas for Growth

- Monitoring and observability (critical for production)
- Testing coverage (need >80% for confidence)
- HIPAA/GDPR compliance (required for healthcare market)
- Clinical validation (research studies needed)
- Scale testing (current capacity: ~10K users)

### Business Model Potential

1. **B2C Subscription**: $10-20/month for premium features
2. **B2B/EAP**: $5-10/employee/month for corporate wellness
3. **Human-in-the-Loop**: $50-100/session for therapist review
4. **Insurance Reimbursement**: $30-50/session (requires FDA clearance)

### Recommended Next Steps

**Immediate (Next 30 days):**
1. Implement monitoring (Datadog + Sentry)
2. Add user data deletion API (GDPR)
3. Increase test coverage to 50%
4. Conduct security audit

**Short-Term (Next 90 days):**
1. Launch beta with 100 users
2. Collect user feedback and iterate
3. Build therapist dashboard for B2B pilot
4. Add mood-conversation correlation analytics

**Medium-Term (6-12 months):**
1. Achieve 80% test coverage
2. Scale to 10K users
3. Launch B2B pilot with 2-3 companies
4. Begin clinical research partnership

---

**Document Prepared By:** AI Analysis System
**For:** Technical Product Management
**Based On:** Angel App Codebase (January 2026)
**Version:** 1.0

---

## Appendix: Key File Locations

### Backend Core Files
- **Main Entry**: `backend/src/main.ts`
- **App Module**: `backend/src/app.module.ts`
- **Chat Service**: `backend/src/chat/chat.service.ts`
- **Voice Service**: `backend/src/chat/voice.service.ts`
- **RAG Service**: `backend/src/chat/rag.service.ts`
- **Context Service**: `backend/src/chat/therapist-context.service.ts`
- **Crisis Detection**: `backend/src/chat/crisis-detection.service.ts`
- **Content Moderation**: `backend/src/chat/content-moderation.service.ts`
- **System Prompt**: `backend/src/prompts/angel-system-prompt.json`

### Database Files
- **User Entity**: `backend/src/entities/user.entity.ts`
- **Conversation Entity**: `backend/src/entities/conversation.entity.ts`
- **Message Entity**: `backend/src/entities/message.entity.ts`
- **Mood Log Entity**: `backend/src/entities/mood-log.entity.ts`
- **Database Config**: `backend/src/config/database.config.ts`
- **Weaviate Config**: `backend/src/config/weaviate.config.ts`

### Mobile App Files
- **App Entry**: `mobile-app/App.tsx`
- **Chat Screen**: `mobile-app/src/screens/ChatScreen.tsx`
- **Mood Screen**: `mobile-app/src/screens/MoodScreen.tsx`
- **Auth Context**: `mobile-app/src/context/AuthContext.tsx`
- **API Service**: `mobile-app/src/services/api.ts`
- **Environment Config**: `mobile-app/src/config/environment.ts`

### Infrastructure Files
- **CloudFormation**: `cloudformation/01-vpc.yaml` through `09-s3-event-notification.yaml`
- **Docker Compose**: `backend/docker-compose.yml` (local Weaviate)

---

## Appendix: Glossary

- **RAG**: Retrieval-Augmented Generation - Using vector search to find relevant past context
- **LLM**: Large Language Model (e.g., GPT-4, Gemini)
- **STT**: Speech-to-Text (audio transcription)
- **TTS**: Text-to-Speech (audio synthesis)
- **CBT**: Cognitive Behavioral Therapy
- **DBT**: Dialectical Behavioral Therapy
- **OTP**: One-Time Password (for authentication)
- **JWT**: JSON Web Token (for authorization)
- **ECS**: Elastic Container Service (AWS)
- **RDS**: Relational Database Service (AWS)
- **ALB**: Application Load Balancer (AWS)
- **HNSW**: Hierarchical Navigable Small World (vector search algorithm)
- **Clinical Profile**: LLM-generated summary of user's mental health patterns
- **Therapist Context**: Intelligent context building system mimicking therapist memory
- **Crisis Detection**: System for identifying users in mental health crisis
- **Content Moderation**: Filtering harmful content using OpenAI Moderation API
