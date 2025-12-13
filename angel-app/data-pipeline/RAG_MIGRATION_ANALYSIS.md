# RAG System Requirements for Transcription Migration

## What is RAG in Angel App?

RAG (Retrieval Augmented Generation) allows the AI to:
- **Find similar past conversations** when a user asks something
- **Provide context-aware responses** based on conversation history
- **Maintain continuity** across sessions
- **Learn from patterns** in user interactions

## How RAG Works in Angel App

```
User Message → Generate Embedding → Search Similar Past Conversations → Include Context → LLM Response
```

### RAG Data Structure (Weaviate Vector DB)

```typescript
{
  conversationId: string,    // Unique conversation identifier
  turnIndex: number,         // Message order in conversation (0, 1, 2...)
  speaker: string,           // "CUSTOMER" or "AGENT"
  textChunk: string,         // The actual message content
  timestamp: number,         // Unix timestamp
  embedding: number[]        // 1536-dimensional vector (OpenAI text-embedding-3-small)
}
```

## Current Migration Mapping Issue

### ❌ Current Mapping (NOT compatible with RAG):
```javascript
transcriptions[].speaker == "Agent" → messages[].speaker = "Provider"
transcriptions[].speaker == "Customer" → messages[].speaker = "User"
```

### ✅ Should be (RAG compatible):
```javascript
transcriptions[].speaker == "Agent" → messages[].speaker = "AGENT"
transcriptions[].speaker == "Customer" → messages[].speaker = "CUSTOMER"
```

## What Data from Transcriptions is Valuable for RAG?

### 1. **CRITICAL: Message Content & Order**

#### What RAG Needs:
- **Clean, coherent text chunks** - Each message as a separate chunk
- **Sequential order** - turnIndex to maintain conversation flow
- **Speaker identification** - To filter by role (CUSTOMER vs AGENT)

#### Quality Requirements:
✅ **Good for RAG:**
- Clear, complete sentences
- Contextually meaningful messages
- Proper speaker attribution
- Chronological order preserved

❌ **Bad for RAG:**
- Truncated messages
- Out-of-order messages
- Missing speaker labels
- System messages/noise
- Empty messages

#### Example:
```javascript
// GOOD - RAG will learn from this
{
  turnIndex: 0,
  speaker: "CUSTOMER",
  textChunk: "I've been feeling really anxious about my job for the past 3 weeks"
}

// BAD - Not useful for RAG
{
  turnIndex: 0,
  speaker: "CUSTOMER",
  textChunk: "um... uh... like..."
}
```

---

### 2. **IMPORTANT: Conversation Boundaries**

#### What RAG Needs:
- **Unique conversationId** for each complete conversation
- **Clear start/end** of conversation sessions
- **Related conversations** should have different IDs

#### Why It Matters:
RAG retrieves **entire conversations** when a similar topic is detected. If conversations are split incorrectly, context is lost.

#### Best Practices:
- One transcription session = One conversationId
- Use original transcription _id or generate new UUID
- Don't merge unrelated conversations
- Don't split mid-conversation

---

### 3. **IMPORTANT: Temporal Information**

#### What RAG Needs:
- **Timestamp** for each message (or at least conversation)
- **Relative ordering** within conversation

#### Why It Matters:
- Recent conversations are more relevant
- Temporal patterns (e.g., "user gets anxious on Mondays")
- Decay old/outdated information

#### Migration Strategy:
```javascript
// If transcription has timestamp per message - USE IT
message.timestamp = transcription.timestamp

// If only conversation-level timestamp - DERIVE IT
message.timestamp = conversation.timestamp + (turnIndex * 1000)
```

---

### 4. **VALUABLE: Semantic Content Quality**

#### What Makes Good RAG Content:

**✅ High Value Messages:**
- Emotional expressions: "I feel hopeless"
- Specific problems: "I can't sleep for 3 weeks"
- Progress indicators: "Therapy has been helping"
- Goals/desires: "I want to feel better"
- Coping strategies: "Exercise helps me"
- Relationship dynamics: "My partner is supportive"

**⚠️ Medium Value Messages:**
- General check-ins: "How are you today?"
- Acknowledgments: "I understand"
- Clarifications: "Tell me more"

**❌ Low Value Messages:**
- Greetings: "Hello"
- Filler: "um, uh, like"
- System messages: "Session started"
- Incomplete: "I just... you know..."

#### Filter Strategy:
```javascript
// Minimum message length (in characters)
MIN_MESSAGE_LENGTH = 20

// Filter out low-value patterns
EXCLUDE_PATTERNS = [
  /^(hi|hello|hey|thanks|bye|okay|yes|no|um|uh)$/i,
  /^[\W_]+$/,  // Only punctuation/symbols
]
```

---

### 5. **VALUABLE: Conversation Metadata**

#### Additional Context for RAG:

```javascript
{
  conversationMetadata: {
    orgId: string,              // For filtering by organization
    duration: number,           // Conversation length indicator
    messageCount: number,       // Quality indicator
    dominantTopics: [string],   // For topic-based retrieval
    emotionalTone: string,      // "positive|negative|neutral|crisis"
    crisisDetected: boolean,    // Important safety context
    qualityScore: number        // Filter low-quality conversations
  }
}
```

---

## Migration Strategy for RAG

### Phase 1: Basic Migration (Current Script)
✅ Convert transcriptions → conversations
✅ Map speakers correctly (CUSTOMER/AGENT)
✅ Preserve message order
✅ Generate unique conversation IDs

### Phase 2: Embedding Generation (NEW)
Create script to:
1. Read migrated conversations from MongoDB
2. Generate embeddings for each message
3. Store in Weaviate vector DB

### Phase 3: Quality Enhancement (FUTURE)
1. Filter low-quality messages
2. Extract dominant topics
3. Add metadata enrichment
4. Implement conversation scoring

---

## Updated Migration Script Requirements

### Must Have:
1. ✅ Use "CUSTOMER" and "AGENT" (not "User" and "Provider")
2. ✅ Preserve turnIndex (message order)
3. ✅ Include timestamps (real or derived)
4. ✅ Filter empty/invalid messages
5. ✅ Generate unique conversationId

### Should Have:
1. ⚠️ Minimum message length filter
2. ⚠️ Extract conversation metadata
3. ⚠️ Add quality indicators

### Nice to Have:
1. 💡 Topic extraction
2. 💡 Sentiment analysis
3. 💡 Crisis keyword detection
4. 💡 De-duplication

---

## Recommended Next Steps

### 1. Update Migration Script
```bash
# Fix speaker mapping for RAG compatibility
Agent → AGENT
Customer → CUSTOMER

# Add message filtering
- Remove messages < 10 characters
- Remove filler-only messages
- Validate speaker attribution
```

### 2. Create Embedding Generation Script
```python
# New script: generate_embeddings.py
1. Read conversations from centauraa.conversations
2. For each message:
   - Generate embedding using OpenAI API
   - Store in Weaviate with metadata
3. Track progress and handle errors
```

### 3. Validate RAG Integration
```bash
# Test that migrated data works with RAG
1. Query similar conversations
2. Verify retrieval quality
3. Check semantic search results
4. Validate conversation boundaries
```

---

## Example: Good vs Bad Migration

### ❌ BAD Migration (Not RAG-optimized):
```javascript
{
  "_id": "...",
  "messages": [
    {
      "id": "guid-1",
      "message": "",  // EMPTY
      "speaker": "Provider"  // WRONG - should be AGENT
    },
    {
      "id": "guid-2",
      "message": "um",  // TOO SHORT
      "speaker": "User"  // WRONG - should be CUSTOMER
    }
  ]
  // Missing: turnIndex, timestamp, conversationId for RAG
}
```

### ✅ GOOD Migration (RAG-optimized):
```javascript
{
  "_id": "new-generated-id",
  "conversationId": "original-transcription-id",  // For Weaviate
  "orgId": "5d9d3389...",
  "messages": [
    {
      "id": "guid-1",
      "message": "I've been feeling really anxious lately",
      "speaker": "CUSTOMER",  // CORRECT
      "turnIndex": 0,  // ADDED for RAG
      "timestamp": 1702598400000  // ADDED for RAG
    },
    {
      "id": "guid-2",
      "message": "I understand. Tell me more about when this started",
      "speaker": "AGENT",  // CORRECT
      "turnIndex": 0,  // Same turn
      "timestamp": 1702598401000  // Sequential
    }
  ],
  "metadata": {
    "messageCount": 2,
    "hasValidContent": true,
    "qualityScore": 0.85
  },
  "migrated_at": "2025-12-12T..."
}
```

---

## Testing RAG After Migration

### Validation Queries:
1. **Semantic Search**: "I feel anxious"
   - Should return conversations with similar emotional content
   - Similarity score should be > 0.7

2. **Conversation Retrieval**: Get full conversation by ID
   - Messages in correct order (turnIndex)
   - Both CUSTOMER and AGENT messages present

3. **Context Summary**: Format for LLM
   - Should show relevant past conversations
   - Include similarity percentages
   - Maintain conversational flow

---

## Performance Considerations

### Weaviate Storage:
- **Size per message**: ~6KB (1536-dim embedding + metadata)
- **100,000 messages**: ~600MB
- **Index time**: ~1-2 seconds per 100 messages

### OpenAI Embedding Costs:
- **Model**: text-embedding-3-small
- **Cost**: $0.02 per 1M tokens (~$0.00002 per message)
- **100,000 messages**: ~$2.00

### Migration Time Estimate:
- **Transcription migration**: Fast (~1000/sec)
- **Embedding generation**: Slower (~10/sec due to API limits)
- **Total for 100k conversations**: ~3-4 hours

---

## Conclusion

### For RAG to work effectively, the migrated data MUST have:
1. ✅ Correct speaker labels (CUSTOMER/AGENT)
2. ✅ Sequential turnIndex
3. ✅ Timestamps
4. ✅ Clean, meaningful text content
5. ✅ Unique conversation identifiers

### The current migration script needs updates to:
1. Change speaker mapping
2. Add turnIndex to each message
3. Add timestamps
4. Filter low-quality messages
5. Generate embeddings (separate script)
