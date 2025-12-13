# Transcriptions to Conversations Migration with Clinical Analysis

This pipeline migrates data from `backend_sweeten.transcriptions` to `centauraa.conversations` with automated clinical context detection for mental health applications.

## Data Mapping

- `transcriptions` → `messages`
- `transcriptions[].value` → `messages[].message`
- `transcriptions[].speaker == "Agent"` → `messages[].speaker = "Provider"`
- `transcriptions[].speaker == "Customer"` → `messages[].speaker = "User"`
- Each message gets a new `id` field with a GUID
- Each message gets a `turnIndex` field for sequential ordering
- Messages shorter than 3 characters are filtered out
- MongoDB will auto-generate a new `_id` for each conversation document

## Clinical Analysis Features ⚕️

The migration automatically analyzes conversations and extracts:

### 🚨 **Crisis Detection**
- Suicidal ideation keywords
- Self-harm indicators
- Hopelessness expressions
- Crisis level assessment (none, medium, high, critical)

### 🩺 **Symptom Extraction**
- Anxiety mentions
- Depression indicators
- Sleep problems
- Fatigue/energy issues
- Concentration difficulties
- Irritability

### 💊 **Coping Strategies**
- Meditation/mindfulness
- Breathing exercises
- Physical exercise
- Therapy/counseling
- Medication
- Journaling
- Social support
- Music therapy
- Grounding techniques

### ✅ **Outcome Assessment**
- Positive resolution
- Concerning ending
- Neutral conclusion

### 📏 **Conversation Length Validation**
Automatically categorizes and manages conversation length:
- **Too Short** (< 10 messages): Skipped - insufficient content
- **Optimal** (10-300 messages): Ideal for therapeutic analysis
- **Long** (301-500 messages): Accepted with warning
- **Very Long** (501-1000 messages): Accepted, may be truncated
- **Exceeds Limit** (> 1000 messages): Truncated to 1000 for performance

### 🔧 **ML-Grade Data Processing** (NEW)
Production-ready text preprocessing and validation:

#### **Text Preprocessing:**
- Lowercase normalization
- URL removal
- Email removal
- Whitespace normalization
- Punctuation standardization

#### **Embedding Quality Validation:**
- Token count validation (5-8191 tokens)
- Alphanumeric ratio check (>50%)
- Content quality filtering

#### **Data Versioning:**
- Version tracking (v1.0.0)
- Migration run ID
- Preprocessing/validation metadata
- Reproducible transformations

## Prerequisites

1. MongoDB running on port 12017 (or configure in .env)
2. Python 3.x with required packages:
   ```bash
   pip install pymongo python-dotenv tqdm tiktoken
   ```

   **Note:** `tiktoken` is optional but recommended for accurate token counting. Without it, the script will use character-based estimation.

## Configuration

The script uses the `.env` file in the data-pipeline directory:

```env
# MongoDB Connection
MONGO_HOST=127.0.0.1
MONGO_PORT=12017
MONGO_USER=admin                                      # Optional if no auth
MONGO_PASSWORD=YourPassword                           # Optional if no auth

# Filters
MONGO_FILTER_ORG_ID=5d9d3389-29a4-4ea3-95cb-ac8a28ec8920  # Filter by organization ID
MONGO_FILTER_MIN_TRANSCRIPTIONS=100                        # Minimum number of transcriptions required
```

### Filter Details

- **MONGO_FILTER_ORG_ID**: Only migrate transcriptions with matching `orgId` field
- **MONGO_FILTER_MIN_TRANSCRIPTIONS**: Only migrate documents with at least this many transcriptions in the array

## Usage

### Step 1: Verify MongoDB Connection

First, make sure MongoDB is running:
```bash
lsof -i :12017
```

### Step 2: Run the Migration

```bash
cd /Users/dathu/Documents/centauraa/angel-app/data-pipeline
source venv/bin/activate
python migrate_transcriptions.py
```

### Step 3: Check Results

The script will:
- Show progress with a progress bar
- Log details to `migration.log`
- Display summary statistics when complete
- Show a sample conversation document

## Features

- **Idempotent**: Safe to run multiple times - uses `original_transcription_id` to prevent duplicates
- **Progress tracking**: Shows real-time progress bar
- **Error handling**: Continues on errors and logs them
- **Logging**: Detailed logs saved to `migration.log`

## Output Schema

Each conversation document in `centauraa.conversations` will look like:

```json
{
  "_id": "auto-generated-mongodb-id",
  "conversationId": "original-transcription-id",
  "messages": [
    {
      "id": "guid-1",
      "message": "I've been feeling really anxious lately",
      "speaker": "User",
      "turnIndex": 0
    },
    {
      "id": "guid-2",
      "message": "I understand. Tell me more about what's been making you anxious",
      "speaker": "Provider",
      "turnIndex": 1
    },
    {
      "id": "guid-3",
      "message": "Work stress and I can't sleep",
      "speaker": "User",
      "turnIndex": 2
    }
  ],
  "clinicalContext": {
    "crisisLevel": "none",
    "containsSuicidalContent": false,
    "containsSelfHarmContent": false,
    "symptomsPresented": ["anxiety", "insomnia"],
    "copingStrategiesDiscussed": ["breathing", "meditation"],
    "conversationOutcome": "positive",
    "conversationLength": {
      "messageCount": 150,
      "lengthCategory": "optimal",
      "isOptimalLength": true,
      "wasTruncated": false
    },
    "hasSubstantiveContent": true
  }
}
```

### Clinical Context Benefits

The `clinicalContext` enables:
- **Safety filtering**: Exclude crisis content when inappropriate
- **Symptom tracking**: Find conversations about specific mental health issues
- **Strategy retrieval**: Learn from successful coping mechanisms
- **Outcome-based search**: Retrieve conversations that ended positively
- **Length optimization**: Filter by conversation length for better RAG performance
- **Quality assessment**: Filter for substantive therapeutic interactions

## Migration Statistics

When you run the migration, you'll see a detailed report:

```
============================================================
Migration Complete!
============================================================
Data Version: v1.0.0
Migration Run ID: a7f3c2d9
Successfully migrated: 850
Skipped (too short): 45
Errors: 5
Truncated (>1000 msgs): 3

Conversation Length Distribution:
  Optimal (10-300 msgs):  720
  Long (301-500 msgs):    95
  Very Long (501-1000):   35

Data Quality Metrics:
  Total messages kept: 85,420
  Total messages filtered: 12,580
  Filter rate: 12.8%
  Total tokens: 3,842,900
  Avg tokens/message: 45.0
  Estimated embedding cost: $0.77
```

## Troubleshooting

### Authentication Errors
If you get authentication errors:
1. Try removing MONGO_PASSWORD from .env (script will try without auth)
2. Or verify credentials are correct
3. Check if user has proper permissions

### Connection Refused
If MongoDB is not running:
```bash
brew services start mongodb-community
```

### No Documents Found
Verify the collection name and database are correct:
```bash
mongosh --port 12017 --eval "use backend_sweeten; show collections"
```
