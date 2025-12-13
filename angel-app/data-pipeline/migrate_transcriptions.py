#!/usr/bin/env python3
"""
Data Pipeline: Migrate transcriptions to conversations with clinical analysis
Reads from backend_sweeten.transcriptions and writes to centauraa.conversations

Mapping:
- transcriptions -> messages
- transcriptions[].value -> messages[].message
- transcriptions[].speaker == "Agent" -> messages[].speaker = "Provider"
- transcriptions[].speaker == "Customer" -> messages[].speaker = "User"
- Add messages[].id = GUID
- Add messages[].turnIndex = sequential message order
- Filter out messages < 3 characters

Clinical Analysis (NEW):
- Crisis detection (suicidal content, self-harm, hopelessness)
- Symptom extraction (anxiety, depression, insomnia, etc.)
- Coping strategy identification (meditation, exercise, therapy, etc.)
- Conversation outcome assessment (positive, concerning, neutral)
- Quality metrics (message count, substantive content)
"""
import os
import sys
from pymongo import MongoClient
from urllib.parse import quote_plus
from dotenv import load_dotenv
import uuid
import logging
from tqdm import tqdm
from typing import List, Dict, Any, Set
from datetime import datetime
import re
import hashlib

# Try to import tiktoken for token counting
try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False
    logging.warning("tiktoken not installed - using character-based estimation for token counts")

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('migration.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# MongoDB Configuration
MONGO_USER = os.getenv("MONGO_USER", "admin")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_HOST = os.getenv("MONGO_HOST", "127.0.0.1")
MONGO_PORT = os.getenv("MONGO_PORT", "12017")

# Source Configuration
SOURCE_DB = "backend_sweeten"
SOURCE_COLLECTION = "call_transcripts"

# Destination Configuration
DEST_DB = "centauraa"
DEST_COLLECTION = "conversations"

# Filter Configuration
MONGO_FILTER_ORG_ID = os.getenv("MONGO_FILTER_ORG_ID")
MONGO_FILTER_MIN_TRANSCRIPTIONS = int(os.getenv("MONGO_FILTER_MIN_TRANSCRIPTIONS", "0"))

# Build MongoDB URI - try without auth first, then with auth if password is provided
if MONGO_PASSWORD:
    MONGO_URI = f"mongodb://{quote_plus(MONGO_USER)}:{quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}"
    logger.info("Using MongoDB with authentication")
else:
    MONGO_URI = f"mongodb://{MONGO_HOST}:{MONGO_PORT}"
    logger.info("Using MongoDB without authentication")

# Batch size for processing
BATCH_SIZE = 100

# Conversation length thresholds
MIN_MESSAGES = 20           # Too short - likely incomplete
OPTIMAL_MAX = 600           # Ideal length for therapy session
WARNING_THRESHOLD = 1000     # Flag for review
HARD_LIMIT = 2000          # Absolute maximum to prevent performance issues

# Data versioning
DATA_VERSION = "v1.0.0"
MIGRATION_RUN_ID = hashlib.md5(str(datetime.utcnow()).encode()).hexdigest()[:8]

# Embedding validation thresholds
MIN_TOKENS = 5              # Minimum tokens for meaningful embedding
MAX_TOKENS = 8191           # OpenAI embedding limit
MIN_ALPHA_RATIO = 0.5       # Minimum alphanumeric content ratio


def remove_pii(text: str) -> str:
    """
    Remove Personally Identifiable Information (PII) from text

    Removes/redacts:
    - Phone numbers
    - Email addresses
    - Social Security Numbers
    - Credit card numbers
    - Street addresses
    - Dates (potential DOB)
    - Numbers that could be IDs
    - Names (common patterns)
    """
    if not text:
        return ""

    # Remove phone numbers (various formats)
    # (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890
    text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE]', text)
    text = re.sub(r'\(\d{3}\)\s*\d{3}[-.]?\d{4}', '[PHONE]', text)

    # Remove email addresses
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)

    # Remove Social Security Numbers (XXX-XX-XXXX)
    text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', text)

    # Remove credit card numbers (various formats)
    text = re.sub(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b', '[CARD]', text)

    # Remove zip codes (5 or 9 digit)
    text = re.sub(r'\b\d{5}(?:-\d{4})?\b', '[ZIP]', text)

    # Remove specific dates (MM/DD/YYYY, DD/MM/YYYY, etc.)
    text = re.sub(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', '[DATE]', text)
    text = re.sub(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b', '[DATE]', text, flags=re.IGNORECASE)

    # Remove street addresses (number + street name pattern)
    text = re.sub(r'\b\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way)\b', '[ADDRESS]', text, flags=re.IGNORECASE)

    # Remove potential ID numbers (6+ consecutive digits)
    text = re.sub(r'\b\d{6,}\b', '[ID]', text)

    # Remove common name patterns preceded by titles
    # Mr., Mrs., Ms., Dr., followed by capitalized words
    text = re.sub(r'\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', '[NAME]', text)

    # Remove "My name is..." patterns
    text = re.sub(r'\b(?:my name is|i\'m|i am|this is)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b',
                  lambda m: m.group(0).split()[0:3][0] + ' ' + '[NAME]', text, flags=re.IGNORECASE)

    # Remove insurance/policy numbers (letters + numbers)
    text = re.sub(r'\b[A-Z]{2,}\d{6,}\b', '[POLICY]', text)

    return text


def preprocess_text_for_embedding(text: str) -> str:
    """
    Normalize text for consistent embeddings

    This preprocessing ensures:
    - PII removal (FIRST - before lowercasing)
    - Consistent casing
    - Clean whitespace
    - Removed URLs
    - Normalized punctuation
    """
    if not text:
        return ""

    # STEP 1: Remove PII BEFORE lowercasing (to preserve detection patterns)
    text = remove_pii(text)

    # STEP 2: Convert to lowercase for consistency
    text = text.lower()

    # STEP 3: Remove URLs
    text = re.sub(r'http\S+|www\S+', '', text)

    # STEP 4: Normalize whitespace (spaces, tabs, newlines)
    text = re.sub(r'\s+', ' ', text)

    # STEP 5: Remove excessive punctuation (keep single)
    text = re.sub(r'([!?.،])\1+', r'\1', text)

    # STEP 6: Remove special characters but keep basic punctuation and apostrophes
    text = re.sub(r'[^\w\s.,!?\'-\[\]]', '', text)  # Keep brackets for PII markers

    return text.strip()


def estimate_token_count(text: str) -> int:
    """
    Estimate token count for text
    Uses tiktoken if available, otherwise rough estimation
    """
    if HAS_TIKTOKEN:
        try:
            encoding = tiktoken.encoding_for_model("text-embedding-3-small")
            return len(encoding.encode(text))
        except Exception as e:
            logger.debug(f"Tiktoken encoding failed: {e}, falling back to estimation")

    # Fallback: rough estimation (1 token ≈ 4 characters)
    return len(text) // 4


def validate_for_embedding(text: str) -> Dict[str, Any]:
    """
    Validate text is suitable for embedding generation

    Returns validation result with:
    - isValid: bool
    - tokenCount: int
    - issues: list of problems found
    """
    issues = []

    # Estimate token count
    token_count = estimate_token_count(text)

    # Check minimum length
    if token_count < MIN_TOKENS:
        issues.append(f"Too short: {token_count} tokens (min {MIN_TOKENS})")

    # Check maximum length
    if token_count > MAX_TOKENS:
        issues.append(f"Too long: {token_count} tokens (max {MAX_TOKENS})")

    # Check alphanumeric ratio (avoid symbol-heavy text)
    if len(text) > 0:
        alpha_ratio = sum(c.isalnum() for c in text) / len(text)
        if alpha_ratio < MIN_ALPHA_RATIO:
            issues.append(f"Low content ratio: {alpha_ratio:.2f} (min {MIN_ALPHA_RATIO})")

    return {
        "isValid": len(issues) == 0,
        "tokenCount": token_count,
        "issues": issues
    }


def map_speaker(speaker: str) -> str:
    """
    Map speaker from transcription format to conversation format
    Agent/AGENT -> Provider
    Customer/CUSTOMER -> User
    """
    speaker_upper = speaker.upper() if speaker else ""
    if speaker_upper == "AGENT":
        return "Provider"
    elif speaker_upper == "CUSTOMER":
        return "User"
    else:
        # Default to original value if unknown
        logger.warning(f"Unknown speaker type: {speaker}")
        return speaker


def detect_crisis_content(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect crisis-related content in messages
    Returns crisis indicators for clinical safety
    """
    crisis_patterns = {
        "suicidal": [
            r'\b(suicide|suicidal|kill myself|end my life|take my life)\b',
            r'\b(want to die|wish I was dead|better off dead)\b',
            r'\b(no reason to live|nothing to live for)\b'
        ],
        "self_harm": [
            r'\b(self[- ]harm|hurt(ing)? myself|cut(ting)? myself)\b',
            r'\b(harm myself|injure myself)\b'
        ],
        "hopelessness": [
            r'\b(hopeless|give up|no point|what\'?s the point)\b',
            r'\b(can\'?t go on|can\'?t take (it|this))\b'
        ]
    }

    crisis_indicators = {
        "containsSuicidalContent": False,
        "containsSelfHarmContent": False,
        "containsHopelessness": False,
        "crisisLevel": "none"
    }

    for msg in messages:
        if msg.get("speaker") == "User":
            text = msg.get("message", "").lower()

            # Check for suicidal content
            for pattern in crisis_patterns["suicidal"]:
                if re.search(pattern, text, re.IGNORECASE):
                    crisis_indicators["containsSuicidalContent"] = True
                    crisis_indicators["crisisLevel"] = "critical"

            # Check for self-harm
            for pattern in crisis_patterns["self_harm"]:
                if re.search(pattern, text, re.IGNORECASE):
                    crisis_indicators["containsSelfHarmContent"] = True
                    if crisis_indicators["crisisLevel"] == "none":
                        crisis_indicators["crisisLevel"] = "high"

            # Check for hopelessness
            for pattern in crisis_patterns["hopelessness"]:
                if re.search(pattern, text, re.IGNORECASE):
                    crisis_indicators["containsHopelessness"] = True
                    if crisis_indicators["crisisLevel"] == "none":
                        crisis_indicators["crisisLevel"] = "medium"

    return crisis_indicators


def extract_symptoms(messages: List[Dict[str, Any]]) -> Set[str]:
    """
    Extract mental health symptoms mentioned in conversation
    """
    symptom_keywords = {
        "anxiety": r'\b(anxiety|anxious|panic|worried|nervous|stress(ed)?)\b',
        "depression": r'\b(depress(ed|ion)|sad|down|hopeless|empty)\b',
        "insomnia": r'\b(can\'?t sleep|insomnia|sleep(ing)? (problem|issue))\b',
        "fatigue": r'\b(tired|exhausted|fatigue|no energy|drained)\b',
        "irritability": r'\b(irritab(le|ility)|angry|frustrated|on edge)\b',
        "concentration": r'\b(can\'?t (focus|concentrate)|distracted|foggy)\b'
    }

    symptoms = set()

    for msg in messages:
        if msg.get("speaker") == "User":
            text = msg.get("message", "").lower()

            for symptom, pattern in symptom_keywords.items():
                if re.search(pattern, text, re.IGNORECASE):
                    symptoms.add(symptom)

    return symptoms


def extract_coping_strategies(messages: List[Dict[str, Any]]) -> Set[str]:
    """
    Extract coping strategies mentioned in conversation
    """
    strategy_keywords = {
        "meditation": r'\b(meditat(e|ion|ing)|mindfulness)\b',
        "breathing": r'\b(breathing|breath|deep breath)\b',
        "exercise": r'\b(exercise|exercising|workout|gym|walk(ing)?|run(ning)?)\b',
        "therapy": r'\b(therapy|therapist|counseling|counselor)\b',
        "medication": r'\b(medication|medicine|pills?|prescri(bed|ption))\b',
        "journaling": r'\b(journal(ing)?|writing|wrote)\b',
        "social_support": r'\b(talk(ed|ing) to|call(ed|ing)|friend|family|support)\b',
        "music": r'\b(music|listen(ing)?|song)\b',
        "grounding": r'\b(grounding|5[- ]4[- ]3[- ]2[- ]1)\b'
    }

    strategies = set()

    for msg in messages:
        text = msg.get("message", "").lower()

        for strategy, pattern in strategy_keywords.items():
            if re.search(pattern, text, re.IGNORECASE):
                strategies.add(strategy)

    return strategies


def validate_conversation_length(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validate and categorize conversation length
    Returns validation status and recommended action
    """
    length = len(messages)

    if length < MIN_MESSAGES:
        return {
            "status": "too_short",
            "action": "skip",
            "reason": f"Only {length} messages - insufficient for analysis",
            "lengthCategory": "too_short"
        }
    elif length <= OPTIMAL_MAX:
        return {
            "status": "optimal",
            "action": "accept",
            "reason": "Good length for therapeutic analysis",
            "lengthCategory": "optimal"
        }
    elif length <= WARNING_THRESHOLD:
        return {
            "status": "long",
            "action": "accept_with_warning",
            "reason": "Longer than typical session - may span multiple topics",
            "lengthCategory": "long"
        }
    elif length <= HARD_LIMIT:
        return {
            "status": "very_long",
            "action": "truncate",
            "reason": f"Approaching limits - truncating to {HARD_LIMIT}",
            "lengthCategory": "very_long"
        }
    else:
        return {
            "status": "exceeds_limit",
            "action": "truncate",
            "reason": f"Exceeds hard limit - truncating to {HARD_LIMIT}",
            "lengthCategory": "exceeds_limit"
        }


def assess_conversation_outcome(messages: List[Dict[str, Any]]) -> str:
    """
    Assess if conversation ended positively or with concern
    """
    if not messages:
        return "unknown"

    # Check last 3 user messages
    user_messages = [m for m in messages if m.get("speaker") == "User"]
    if not user_messages:
        return "unknown"

    last_messages = user_messages[-3:] if len(user_messages) >= 3 else user_messages

    positive_patterns = [
        r'\b(thank|helpful|better|good|appreciate|calmer|relief)\b',
        r'\b(feel(ing)? (better|good|okay)|that helped)\b'
    ]

    negative_patterns = [
        r'\b(worse|scared|hopeless|can\'?t|giving up)\b',
        r'\b(no point|nothing helps|still (bad|awful))\b'
    ]

    positive_count = 0
    negative_count = 0

    for msg in last_messages:
        text = msg.get("message", "").lower()

        for pattern in positive_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                positive_count += 1
                break

        for pattern in negative_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                negative_count += 1
                break

    if positive_count > negative_count:
        return "positive"
    elif negative_count > positive_count:
        return "concerning"
    else:
        return "neutral"


def transform_transcription(transcription_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform a transcription document with clinical analysis

    Input: transcription document with transcriptions array
    Output: conversation document with messages and clinical context
    """
    # Extract transcriptions array
    transcriptions = transcription_doc.get('transcriptions', [])

    # Transform each transcription entry to a message
    messages = []
    turn_index = 0

    # Track quality metrics
    total_processed = 0
    filtered_preprocessing = 0
    filtered_validation = 0
    total_tokens = 0
    pii_detected_count = 0

    for trans in transcriptions:
        total_processed += 1
        raw_text = trans.get('value', '').strip()

        # Skip empty messages
        if len(raw_text) < 3:
            filtered_preprocessing += 1
            continue

        # Check if PII was detected in raw text
        if any(marker in raw_text for marker in ['[PHONE]', '[EMAIL]', '[SSN]', '[CARD]', '[ADDRESS]', '[NAME]']):
            pii_detected_count += 1

        # Apply text preprocessing for consistent embeddings (includes PII removal)
        message_text = preprocess_text_for_embedding(raw_text)

        # Track if PII markers are present in preprocessed text
        if any(marker in message_text for marker in ['[phone]', '[email]', '[ssn]', '[card]', '[address]', '[name]', '[id]', '[zip]', '[date]', '[policy]']):
            pii_detected_count += 1

        # Check if preprocessing removed all content
        if len(message_text) < 3:
            filtered_preprocessing += 1
            logger.debug(f"Message filtered during preprocessing: '{raw_text[:50]}'")
            continue

        # Validate for embedding quality
        validation = validate_for_embedding(message_text)
        if not validation["isValid"]:
            filtered_validation += 1
            logger.debug(f"Message failed validation: {validation['issues']}")
            continue

        speaker = map_speaker(trans.get('speaker', ''))
        total_tokens += validation["tokenCount"]

        message = {
            "id": str(uuid.uuid4()),
            "message": message_text,
            "speaker": speaker,
            "turnIndex": turn_index,
            "tokenCount": validation["tokenCount"]  # Store for cost estimation
        }
        messages.append(message)
        turn_index += 1

    # Skip if no valid messages
    if not messages:
        logger.warning(f"No valid messages in transcription {transcription_doc.get('_id')}")
        return None

    # Use original transcription ID as conversationId
    conversation_id = str(transcription_doc.get('_id'))

    # Validate conversation length
    length_validation = validate_conversation_length(messages)

    if length_validation["action"] == "skip":
        logger.warning(
            f"Conversation {conversation_id}: {length_validation['reason']}"
        )
        return None

    if length_validation["action"] == "truncate":
        original_length = len(messages)
        messages = messages[:HARD_LIMIT]
        logger.warning(
            f"Conversation {conversation_id}: Truncated from {original_length} to {HARD_LIMIT} messages"
        )

    if length_validation["status"] in ["long", "very_long"]:
        logger.info(
            f"Conversation {conversation_id}: {length_validation['reason']}"
        )

    # Perform clinical analysis
    crisis_data = detect_crisis_content(messages)
    symptoms = extract_symptoms(messages)
    coping_strategies = extract_coping_strategies(messages)
    outcome = assess_conversation_outcome(messages)

    # Calculate quality metrics
    avg_tokens = total_tokens / len(messages) if messages else 0
    filter_rate = (filtered_preprocessing + filtered_validation) / total_processed if total_processed > 0 else 0

    # Create conversation document with clinical context
    conversation = {
        "conversationId": conversation_id,
        "messages": messages,

        # Clinical context for therapeutic RAG
        "clinicalContext": {
            # Safety indicators
            "crisisLevel": crisis_data["crisisLevel"],
            "containsSuicidalContent": crisis_data["containsSuicidalContent"],
            "containsSelfHarmContent": crisis_data["containsSelfHarmContent"],

            # Clinical data
            "symptomsPresented": list(symptoms),
            "copingStrategiesDiscussed": list(coping_strategies),
            "conversationOutcome": outcome,

            # Conversation length analysis
            "conversationLength": {
                "messageCount": len(messages),
                "lengthCategory": length_validation["lengthCategory"],
                "isOptimalLength": length_validation["status"] == "optimal",
                "wasTruncated": length_validation["action"] == "truncate"
            },

            # Quality metrics
            "hasSubstantiveContent": len(messages) >= 10,
            "dataQuality": {
                "totalProcessed": total_processed,
                "messagesKept": len(messages),
                "filteredPreprocessing": filtered_preprocessing,
                "filteredValidation": filtered_validation,
                "filterRate": round(filter_rate, 3),
                "avgTokenCount": round(avg_tokens, 1),
                "totalTokens": total_tokens,
                "piiDetectedCount": pii_detected_count,
                "piiRemovalApplied": True
            }
        },

        # Data versioning and metadata
        "_metadata": {
            "dataVersion": DATA_VERSION,
            "migrationRunId": MIGRATION_RUN_ID,
            "migrationTimestamp": datetime.utcnow(),
            "sourceCollection": SOURCE_COLLECTION,
            "sourceDatabase": SOURCE_DB,
            "preprocessingApplied": [
                "pii_removal",  # FIRST
                "lowercase",
                "url_removal",
                "whitespace_normalization",
                "punctuation_normalization"
            ],
            "piiRemovalTypes": [
                "phone_numbers",
                "email_addresses",
                "ssn",
                "credit_cards",
                "addresses",
                "dates",
                "names",
                "id_numbers",
                "zip_codes",
                "policy_numbers"
            ],
            "validationApplied": [
                f"min_tokens_{MIN_TOKENS}",
                f"max_tokens_{MAX_TOKENS}",
                f"min_alpha_ratio_{MIN_ALPHA_RATIO}"
            ]
        }
    }

    return conversation


def migrate_transcriptions():
    """
    Main migration function
    """
    logger.info("Starting transcription migration...")
    logger.info(f"Connecting to MongoDB at {MONGO_HOST}:{MONGO_PORT}")

    try:
        # Connect to MongoDB
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)

        # Test connection
        client.admin.command('ping')
        logger.info("Successfully connected to MongoDB")

        # Get source and destination collections
        source_db = client[SOURCE_DB]
        dest_db = client[DEST_DB]

        source_col = source_db[SOURCE_COLLECTION]
        dest_col = dest_db[DEST_COLLECTION]

        # Build query filter
        query_filter = {}

        if MONGO_FILTER_ORG_ID:
            query_filter["organization_id"] = MONGO_FILTER_ORG_ID
            logger.info(f"Filtering by organization_id: {MONGO_FILTER_ORG_ID}")

        if MONGO_FILTER_MIN_TRANSCRIPTIONS > 0:
            query_filter["transcriptions"] = {
                "$exists": True,
                "$not": {"$size": 0}
            }
            # Add size check using $expr
            query_filter["$expr"] = {
                "$gte": [{"$size": "$transcriptions"}, MONGO_FILTER_MIN_TRANSCRIPTIONS]
            }
            logger.info(f"Filtering by minimum transcriptions: {MONGO_FILTER_MIN_TRANSCRIPTIONS}")

        logger.info(f"Query filter: {query_filter}")

        # Count total documents
        total_docs = source_col.count_documents(query_filter)
        logger.info(f"Found {total_docs} documents in {SOURCE_DB}.{SOURCE_COLLECTION}")

        if total_docs == 0:
            logger.warning("No documents to migrate")
            return

        # Process in batches
        migrated_count = 0
        error_count = 0
        skipped_count = 0
        truncated_count = 0
        length_stats = {
            "optimal": 0,
            "long": 0,
            "very_long": 0
        }

        # Quality metrics
        total_tokens_processed = 0
        total_messages_filtered = 0
        total_messages_kept = 0
        total_pii_detected = 0

        with tqdm(total=total_docs, desc="Migrating") as pbar:
            cursor = source_col.find(query_filter)

            for doc in cursor:
                try:
                    # Transform the document
                    conversation = transform_transcription(doc)

                    # Skip if no valid messages
                    if conversation is None:
                        skipped_count += 1
                        pbar.update(1)
                        continue

                    # Track length statistics
                    length_cat = conversation["clinicalContext"]["conversationLength"]["lengthCategory"]
                    if length_cat in length_stats:
                        length_stats[length_cat] += 1

                    if conversation["clinicalContext"]["conversationLength"]["wasTruncated"]:
                        truncated_count += 1

                    # Track quality metrics
                    quality = conversation["clinicalContext"]["dataQuality"]
                    total_tokens_processed += quality["totalTokens"]
                    total_messages_filtered += quality["filteredPreprocessing"] + quality["filteredValidation"]
                    total_messages_kept += quality["messagesKept"]
                    total_pii_detected += quality.get("piiDetectedCount", 0)

                    # Insert or update in destination (based on conversationId to prevent duplicates)
                    dest_col.update_one(
                        {"conversationId": conversation["conversationId"]},
                        {"$set": conversation},
                        upsert=True
                    )

                    migrated_count += 1
                    pbar.update(1)

                except Exception as e:
                    error_count += 1
                    logger.error(f"Error migrating document {doc.get('_id')}: {e}")
                    pbar.update(1)
                    continue

        logger.info(f"\n{'='*60}")
        logger.info(f"Migration Complete!")
        logger.info(f"{'='*60}")
        logger.info(f"Data Version: {DATA_VERSION}")
        logger.info(f"Migration Run ID: {MIGRATION_RUN_ID}")
        logger.info(f"Successfully migrated: {migrated_count}")
        logger.info(f"Skipped (too short): {skipped_count}")
        logger.info(f"Errors: {error_count}")
        logger.info(f"Truncated (>1000 msgs): {truncated_count}")

        logger.info(f"\nConversation Length Distribution:")
        logger.info(f"  Optimal (10-300 msgs):  {length_stats['optimal']}")
        logger.info(f"  Long (301-500 msgs):    {length_stats['long']}")
        logger.info(f"  Very Long (501-1000):   {length_stats['very_long']}")

        # Data quality metrics
        logger.info(f"\nData Quality Metrics:")
        logger.info(f"  Total messages kept: {total_messages_kept}")
        logger.info(f"  Total messages filtered: {total_messages_filtered}")
        if total_messages_kept + total_messages_filtered > 0:
            filter_rate = total_messages_filtered / (total_messages_kept + total_messages_filtered)
            logger.info(f"  Filter rate: {filter_rate:.1%}")
        logger.info(f"  Total tokens: {total_tokens_processed:,}")
        if total_messages_kept > 0:
            avg_tokens = total_tokens_processed / total_messages_kept
            logger.info(f"  Avg tokens/message: {avg_tokens:.1f}")

            # Cost estimation (OpenAI text-embedding-3-small: $0.02 per 1M tokens)
            estimated_cost = (total_tokens_processed / 1_000_000) * 0.02
            logger.info(f"  Estimated embedding cost: ${estimated_cost:.2f}")

        # PII removal metrics
        logger.info(f"\nPrivacy & Security:")
        logger.info(f"  Messages with PII detected: {total_pii_detected}")
        if total_messages_kept > 0:
            pii_rate = total_pii_detected / total_messages_kept
            logger.info(f"  PII detection rate: {pii_rate:.1%}")
        logger.info(f"  PII removal: ENABLED")

        # Show sample from destination
        logger.info(f"\n{'='*60}")
        logger.info("Sample Conversation:")
        logger.info(f"{'='*60}")
        sample = dest_col.find_one({})
        if sample:
            logger.info(f"Conversation ID: {sample.get('conversationId')}")
            logger.info(f"Messages: {len(sample.get('messages', []))}")

            clinical = sample.get('clinicalContext', {})
            logger.info(f"\nClinical Context:")
            logger.info(f"  Crisis Level: {clinical.get('crisisLevel', 'N/A')}")
            logger.info(f"  Symptoms: {', '.join(clinical.get('symptomsPresented', [])) or 'None'}")
            logger.info(f"  Coping Strategies: {', '.join(clinical.get('copingStrategiesDiscussed', [])) or 'None'}")
            logger.info(f"  Outcome: {clinical.get('conversationOutcome', 'N/A')}")

            length_info = clinical.get('conversationLength', {})
            logger.info(f"  Length Category: {length_info.get('lengthCategory', 'N/A')}")
            logger.info(f"  Truncated: {length_info.get('wasTruncated', False)}")

            quality_info = clinical.get('dataQuality', {})
            logger.info(f"\nData Quality:")
            logger.info(f"  Messages kept: {quality_info.get('messagesKept', 'N/A')}")
            logger.info(f"  Filter rate: {quality_info.get('filterRate', 0):.1%}")
            logger.info(f"  Avg tokens: {quality_info.get('avgTokenCount', 'N/A')}")
            logger.info(f"  PII detected: {quality_info.get('piiDetectedCount', 0)} messages")
            logger.info(f"  PII removal: {'ENABLED' if quality_info.get('piiRemovalApplied') else 'DISABLED'}")

            metadata = sample.get('_metadata', {})
            logger.info(f"\nMetadata:")
            logger.info(f"  Version: {metadata.get('dataVersion', 'N/A')}")
            logger.info(f"  Run ID: {metadata.get('migrationRunId', 'N/A')}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise

    finally:
        client.close()
        logger.info("MongoDB connection closed")


if __name__ == "__main__":
    try:
        migrate_transcriptions()
    except KeyboardInterrupt:
        logger.info("\nMigration interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
