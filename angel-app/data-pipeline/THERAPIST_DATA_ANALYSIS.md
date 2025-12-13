# Therapist's Perspective: Essential Data for Angel App

## Current Angel App Capabilities

Based on code analysis, Angel app currently has:
- **Crisis Detection System** (4 severity levels: NONE, LOW, MEDIUM, HIGH, CRITICAL)
- **Mood Tracking** (1-5 scale with notes)
- **Conversation Management** (user/bot message exchanges)
- **RAG System** (context-aware responses based on conversation history)
- **Content Moderation** (safety filters)
- **User Preferences** (personalization)

## Critical Data Fields Needed from Transcriptions

### 1. **ESSENTIAL - Crisis & Safety Indicators** ⚠️

#### What to Extract:
- **Suicidal Ideation Markers**
  - Direct statements ("I want to die", "kill myself")
  - Indirect statements ("better off without me", "no reason to live")
  - Plan specificity (method, timing, means)

- **Self-Harm Indicators**
  - Current behavior
  - Past history
  - Frequency and severity

- **Safety Status**
  - Current safety level
  - Support system availability
  - Crisis resources awareness

#### Why It Matters:
In therapy, immediate safety assessment is priority #1. The Angel app needs this to:
- Trigger appropriate crisis interventions
- Escalate to emergency resources
- Track risk over time
- Provide continuity of care

#### Data Fields Needed:
```javascript
{
  crisis: {
    level: "NONE|LOW|MEDIUM|HIGH|CRITICAL",
    indicators: ["keyword1", "keyword2"],
    hasActivePlan: boolean,
    hasMeans: boolean,
    safetyContractStatus: "accepted|declined|unknown",
    lastCrisisDate: timestamp,
    interventionHistory: [{
      date: timestamp,
      action: string,
      outcome: string
    }]
  }
}
```

---

### 2. **ESSENTIAL - Presenting Problems & Chief Complaints**

#### What to Extract:
- **Primary concerns** user expresses
- **Duration** of problems ("feeling this way for weeks")
- **Severity** self-assessment
- **Impact** on daily functioning

#### Example Extraction:
```
User: "I've been feeling really anxious for the past 3 weeks,
      can't sleep, and it's affecting my work"
```

#### Data Fields Needed:
```javascript
{
  presentingProblems: [{
    category: "anxiety|depression|trauma|grief|stress|relationship|other",
    description: string,
    duration: string,
    severity: 1-10,
    functionalImpact: {
      work: boolean,
      relationships: boolean,
      sleep: boolean,
      appetite: boolean,
      selfCare: boolean
    },
    firstMentioned: timestamp,
    lastMentioned: timestamp,
    frequency: number  // times mentioned
  }]
}
```

---

### 3. **ESSENTIAL - Emotional State & Mood Patterns**

#### What to Extract:
- **Specific emotions** mentioned (anxiety, depression, anger, fear, hopelessness)
- **Mood descriptors** ("numb", "empty", "overwhelmed")
- **Mood duration** and patterns
- **Triggers** mentioned

#### Why It Matters:
Therapists track mood longitudinally to:
- Identify patterns and cycles
- Assess treatment effectiveness
- Recognize warning signs
- Celebrate progress

#### Data Fields Needed:
```javascript
{
  emotionalState: [{
    timestamp: Date,
    primaryEmotion: string,
    intensity: 1-10,
    duration: string,
    triggers: [string],
    physicalSymptoms: [string],  // "tight chest", "headache", "fatigue"
    copingStrategies: [string],   // what they tried
    effectiveness: 1-5            // how well coping worked
  }],

  moodPatterns: {
    predominantMood: string,
    moodStability: "stable|fluctuating|cycling",
    timeOfDayPatterns: {},
    seasonalPatterns: {}
  }
}
```

---

### 4. **IMPORTANT - Social Support & Relationships**

#### What to Extract:
- **Support system** (family, friends, partner, therapist, support groups)
- **Relationship quality** (positive, strained, conflicted)
- **Social isolation** indicators
- **Significant relationships** affecting mental health

#### Example Patterns:
```
"My partner doesn't understand"
"I don't have anyone to talk to"
"My mom is very supportive"
"My therapist suggested..."
```

#### Data Fields Needed:
```javascript
{
  socialSupport: {
    supportNetwork: [{
      relationship: "partner|parent|friend|therapist|sibling|other",
      quality: "supportive|neutral|strained|absent",
      availability: "always|usually|sometimes|rarely",
      notes: string
    }],
    isolationLevel: "none|mild|moderate|severe",
    loneliness: 1-10,
    recentSocialChanges: [string],
    professionalSupport: {
      hasTherapist: boolean,
      hasTherapyHistory: boolean,
      hasPsychiatrist: boolean,
      inTreatment: boolean
    }
  }
}
```

---

### 5. **IMPORTANT - Coping Mechanisms & Resilience**

#### What to Extract:
- **Healthy coping strategies** (exercise, meditation, talking to friends)
- **Unhealthy coping** (substance use, avoidance, self-harm)
- **What's helped in the past**
- **Barriers to coping**

#### Why It Matters:
Understanding coping patterns helps:
- Build on existing strengths
- Identify maladaptive patterns
- Suggest alternatives
- Track skill development

#### Data Fields Needed:
```javascript
{
  copingStrategies: [{
    strategy: string,
    category: "healthy|unhealthy|avoidant|adaptive",
    frequency: "daily|weekly|occasionally|rarely",
    effectiveness: 1-10,
    barriers: [string],
    lastUsed: timestamp
  }],

  resilience: {
    strengths: [string],
    pastSuccesses: [string],
    motivations: [string],
    hopefulnessLevel: 1-10
  }
}
```

---

### 6. **IMPORTANT - Treatment History & Current Care**

#### What to Extract:
- **Current treatment** (therapy, medication, support groups)
- **Past treatment** experiences
- **Medication** (names, effectiveness, side effects, adherence)
- **Therapy history** (what worked, what didn't)

#### Data Fields Needed:
```javascript
{
  treatmentHistory: {
    currentlyInTreatment: boolean,
    treatments: [{
      type: "therapy|medication|support_group|other",
      name: string,
      startDate: timestamp,
      endDate: timestamp,
      status: "current|past|discontinued",
      effectiveness: 1-10,
      sideEffects: [string],
      adherence: "excellent|good|fair|poor",
      notes: string
    }],

    medications: [{
      name: string,
      dosage: string,
      prescriber: string,
      purpose: string,
      effectiveness: 1-10,
      sideEffects: [string],
      adherence: "taking_as_prescribed|missing_doses|discontinued"
    }],

    barriersToCare: [string]  // cost, access, stigma, etc.
  }
}
```

---

### 7. **VALUABLE - Life Stressors & Context**

#### What to Extract:
- **Major life events** (loss, divorce, job change, trauma)
- **Chronic stressors** (financial, health, family)
- **Recent changes** (moves, relationship changes)
- **Environmental factors** (housing, safety, stability)

#### Data Fields Needed:
```javascript
{
  lifeContext: {
    majorLifeEvents: [{
      event: string,
      category: "loss|trauma|change|achievement|other",
      date: timestamp,
      impact: 1-10,
      ongoing: boolean
    }],

    chronicStressors: [{
      type: "financial|health|family|work|housing|legal|other",
      severity: 1-10,
      duration: string,
      impact: string
    }],

    recentChanges: [string],
    stability: "stable|unstable|crisis"
  }
}
```

---

### 8. **VALUABLE - Behavioral Indicators**

#### What to Extract:
- **Sleep patterns** (insomnia, oversleeping, nightmares)
- **Appetite/eating** (loss of appetite, overeating, eating disorders)
- **Energy levels** (fatigue, lethargy, restlessness)
- **Concentration** (difficulty focusing, memory issues)
- **Activity level** (isolation, withdrawal, hyperactivity)

#### Data Fields Needed:
```javascript
{
  behavioralIndicators: {
    sleep: {
      quality: 1-10,
      hours: number,
      issues: ["insomnia", "nightmares", "oversleeping"],
      pattern: string
    },

    appetite: {
      level: "normal|decreased|increased|erratic",
      changes: string
    },

    energy: {
      level: 1-10,
      pattern: string
    },

    concentration: {
      level: 1-10,
      impact: string
    },

    socialWithdrawal: boolean,
    dailyFunctioning: 1-10
  }
}
```

---

### 9. **VALUABLE - Goals & Motivations**

#### What to Extract:
- **What user wants to achieve**
- **Barriers to goals**
- **Progress indicators**
- **Values and priorities**

#### Data Fields Needed:
```javascript
{
  goals: [{
    description: string,
    category: "symptom_reduction|relationship|work|self_improvement|other",
    priority: "high|medium|low",
    progress: 0-100,
    barriers: [string],
    dateSet: timestamp,
    targetDate: timestamp,
    achieved: boolean
  }],

  values: [string],  // what matters most to them
  motivations: [string]
}
```

---

### 10. **CONTEXTUAL - Session Metadata**

#### What to Track:
- **Conversation quality indicators**
- **Engagement level**
- **User responsiveness**
- **Topic continuity**

#### Data Fields Needed:
```javascript
{
  sessionMetadata: {
    duration: number,  // seconds
    messageCount: number,
    userEngagement: "high|medium|low",
    topicsDiscussed: [string],
    emotionalRange: [string],
    crisisInterventionTriggered: boolean,
    followUpNeeded: boolean,
    continuityFromPrevious: boolean
  }
}
```

---

## Recommended Migration Strategy

### Phase 1: Critical Safety Data (Implement First)
1. Crisis indicators and severity
2. Safety assessment data
3. Self-harm indicators
4. Support system availability

### Phase 2: Clinical Core (Implement Second)
1. Presenting problems
2. Emotional state tracking
3. Mood patterns
4. Behavioral indicators

### Phase 3: Treatment Context (Implement Third)
1. Treatment history
2. Coping strategies
3. Social support details
4. Medication adherence

### Phase 4: Enrichment (Implement Last)
1. Life stressors
2. Goals and progress
3. Values and motivations
4. Session analytics

---

## Privacy & Ethics Considerations

### ⚠️ CRITICAL REMINDERS:
1. **De-identification**: Remove or hash PII (names, locations, specific identifiers)
2. **Consent**: Ensure users consented to data use
3. **HIPAA Compliance**: If applicable
4. **Minimum Necessary**: Only collect what's needed
5. **Security**: Encrypt sensitive mental health data
6. **Retention**: Define data lifecycle
7. **Right to Delete**: User can request data deletion

### Sensitive Data Categories:
- Suicidal ideation specifics (HIGH sensitivity)
- Self-harm details (HIGH sensitivity)
- Trauma details (HIGH sensitivity)
- Medication names (MEDIUM sensitivity)
- Relationship details (MEDIUM sensitivity)

---

## Recommended Enhanced Schema for Migration

```javascript
{
  // Basic Info
  _id: "auto-generated",
  original_transcription_id: "string",
  orgId: "string",
  userId: "string",  // if available

  // Conversation Data
  messages: [{
    id: "guid",
    message: "string",
    speaker: "Provider|User",
    timestamp: Date,
    sentiment: number,  // -1 to 1
    topics: [string],
    entities: [string]  // extracted entities
  }],

  // Clinical Assessment (NEW - CRITICAL)
  clinicalAssessment: {
    crisis: { /* see section 1 */ },
    presentingProblems: { /* see section 2 */ },
    emotionalState: { /* see section 3 */ },
    behavioralIndicators: { /* see section 8 */ }
  },

  // Social Context (NEW - IMPORTANT)
  socialContext: {
    supportSystem: { /* see section 4 */ },
    lifeStressors: { /* see section 7 */ }
  },

  // Treatment Info (NEW - IMPORTANT)
  treatmentInfo: {
    history: { /* see section 6 */ },
    coping: { /* see section 5 */ },
    goals: { /* see section 9 */ }
  },

  // Metadata
  metadata: {
    conversationDate: Date,
    duration: number,
    messageCount: number,
    qualityScore: number,
    tags: [string],
    flags: [string]  // needs_followup, crisis_detected, etc.
  },

  migrated_at: Date
}
```

---

## Next Steps

1. **Sample Data Review**: Review 10-20 actual transcriptions to identify:
   - What data is actually present
   - What's missing
   - Data quality issues
   - Privacy concerns

2. **NLP Enhancement**: Consider adding:
   - Sentiment analysis
   - Entity extraction (medication names, relationships)
   - Topic modeling
   - Crisis keyword detection

3. **Validation**: Test migration with small batch and validate:
   - Data completeness
   - Accuracy of mappings
   - Clinical relevance
   - Privacy compliance

4. **Iterative Enrichment**: Start with basic mapping, then add:
   - Automated analysis
   - Pattern detection
   - Longitudinal tracking

Would you like me to:
1. Update the migration script to include these enhanced fields?
2. Create NLP scripts to extract clinical information?
3. Review sample transcriptions to identify what data exists?
