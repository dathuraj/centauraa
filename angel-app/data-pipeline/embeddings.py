import os
import sys
from pymongo import MongoClient
import weaviate
from tqdm import tqdm
from urllib.parse import quote_plus
import time
from typing import List, Tuple, Dict
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
from dotenv import load_dotenv
import threading

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('embeddings_ultra.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ----------------- Config -----------------
USE_GEMINI = os.getenv("USE_GEMINI", "false").lower() == "true"
USE_SMALL_MODEL = os.getenv("USE_SMALL_MODEL", "true").lower() == "true"

# OPTIMIZATION 1: Larger chunk size = fewer embeddings = lower cost
# Increased from 400 to 800 words (can reduce costs by 30-40%)
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "800"))  # words per chunk

# OPTIMIZATION 2: Larger batch size = fewer API calls = faster
# OpenAI supports up to 2048 inputs per batch
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "500"))  # Increased from 100

# Rate limiting configuration
INTER_BATCH_DELAY = float(os.getenv("INTER_BATCH_DELAY", "0.5"))  # Delay between batches (seconds)
ADAPTIVE_BATCH_SIZING = os.getenv("ADAPTIVE_BATCH_SIZING", "true").lower() == "true"
MIN_BATCH_SIZE = int(os.getenv("MIN_BATCH_SIZE", "10"))  # Minimum batch size when reducing

# OPTIMIZATION 3: Smart deduplication
CHECK_EXISTING = os.getenv("CHECK_EXISTING", "true").lower() == "true"

# OPTIMIZATION 4: Text preprocessing to reduce token count
REMOVE_FILLER_WORDS = os.getenv("REMOVE_FILLER_WORDS", "true").lower() == "true"

# OPTIMIZATION 5: Parallel processing
# Reduced from 3 to 2 to prevent thread pool deadlocks
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "2"))  # Concurrent conversation processing

# MongoDB Config
MONGO_USER = os.getenv("MONGO_USER", "admin")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_HOST = os.getenv("MONGO_HOST", "127.0.0.1")
MONGO_PORT = os.getenv("MONGO_PORT", "12017")
MONGO_DB = os.getenv("MONGO_DB", "backend_sweeten")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "call_transcripts")

if not MONGO_PASSWORD:
    raise ValueError("MONGO_PASSWORD environment variable must be set")

MONGO_URI = f"mongodb://{quote_plus(MONGO_USER)}:{quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}"

# Weaviate Config
WEAVIATE_SCHEME = os.getenv("WEAVIATE_SCHEME", "http")
WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost:8080")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "")

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

BATCH_COMMIT_SIZE = int(os.getenv("BATCH_COMMIT_SIZE", "1000"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
RETRY_DELAY = int(os.getenv("RETRY_DELAY", "5"))

# MEMORY OPTIMIZATION: Process MongoDB documents in batches to avoid loading entire dataset
MONGO_BATCH_SIZE = int(os.getenv("MONGO_BATCH_SIZE", "100"))  # Read this many conversations at a time

# Checkpoint file (configurable to avoid conflicts with parallel runs)
CHECKPOINT_FILE = os.getenv("CHECKPOINT_FILE", "embeddings_ultra_checkpoint.txt")

# Filler words to remove (optional optimization)
FILLER_WORDS = {
    'um', 'uh', 'like', 'you know', 'i mean', 'sort of', 'kind of',
    'basically', 'actually', 'literally', 'right', 'okay', 'so'
}

# HIPAA/PHI related words and patterns to remove
HIPAA_KEYWORDS = {
    # Identifiers
    'ssn', 'social security', 'medical record', 'mrn', 'patient id', 'dob', 'date of birth',
    'insurance', 'medicaid', 'medicare', 'health plan', 'policy number',
}

# Enable/disable HIPAA filtering
REMOVE_HIPAA_KEYWORDS = os.getenv("REMOVE_HIPAA_KEYWORDS", "true").lower() == "true"

# ----------------- Database Connections -----------------
def get_mongo_connection():
    """Get MongoDB connection (thread-safe)"""
    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=10000,
        socketTimeoutMS=120000,  # 120 second socket timeout (for slow queries)
        connectTimeoutMS=10000,  # 10 second connection timeout
        maxPoolSize=10
    )
    return client

def get_weaviate_client():
    """Get Weaviate client (thread-safe)"""
    url = f"{WEAVIATE_SCHEME}://{WEAVIATE_HOST}"

    if WEAVIATE_API_KEY:
        client = weaviate.connect_to_custom(
            http_host=WEAVIATE_HOST.split(':')[0],
            http_port=int(WEAVIATE_HOST.split(':')[1]) if ':' in WEAVIATE_HOST else 80,
            http_secure=WEAVIATE_SCHEME == 'https',
            grpc_host=WEAVIATE_HOST.split(':')[0],
            grpc_port=50051,
            grpc_secure=WEAVIATE_SCHEME == 'https',
            auth_credentials=weaviate.auth.AuthApiKey(WEAVIATE_API_KEY)
        )
    else:
        client = weaviate.connect_to_custom(
            http_host=WEAVIATE_HOST.split(':')[0],
            http_port=int(WEAVIATE_HOST.split(':')[1]) if ':' in WEAVIATE_HOST else 80,
            http_secure=WEAVIATE_SCHEME == 'https',
            grpc_host=WEAVIATE_HOST.split(':')[0],
            grpc_port=50051,
            grpc_secure=WEAVIATE_SCHEME == 'https',
        )
    return client

# Initial connections
try:
    mongo_client = get_mongo_connection()
    mongo_client.server_info()
    collection = mongo_client[MONGO_DB][MONGO_COLLECTION]
    logger.info(f"Connected to MongoDB: {MONGO_DB}.{MONGO_COLLECTION}")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    sys.exit(1)

try:
    weaviate_client = get_weaviate_client()

    # Check if collection exists, if not create it (v4 API)
    if not weaviate_client.collections.exists('ConversationEmbedding'):
        logger.info("Creating ConversationEmbedding collection in Weaviate...")
        from weaviate.classes.config import Property, DataType, Configure

        weaviate_client.collections.create(
            name='ConversationEmbedding',
            description='Conversation embeddings for semantic search and RAG',
            vectorizer_config=Configure.Vectorizer.none(),
            properties=[
                Property(
                    name='conversationId',
                    data_type=DataType.TEXT,
                    description='ID of the conversation',
                    index_filterable=True,  # Enable filtering by conversationId
                    index_searchable=False
                ),
                Property(
                    name='turnIndex',
                    data_type=DataType.INT,
                    description='Position in conversation',
                    index_filterable=True
                ),
                Property(
                    name='speaker',
                    data_type=DataType.TEXT,
                    description='CUSTOMER or AGENT',
                    index_filterable=True,  # Enable filtering by speaker
                    index_searchable=False
                ),
                Property(
                    name='textChunk',
                    data_type=DataType.TEXT,
                    description='Message content',
                    index_filterable=False,
                    index_searchable=True  # Enable full-text search on content
                ),
                # Clinical Context Fields
                Property(
                    name='crisisLevel',
                    data_type=DataType.TEXT,
                    description='Crisis level: none, low, medium, high',
                    index_filterable=True,
                    index_searchable=False
                ),
                Property(
                    name='containsSuicidalContent',
                    data_type=DataType.BOOL,
                    description='Whether conversation contains suicidal content',
                    index_filterable=True
                ),
                Property(
                    name='containsSelfHarmContent',
                    data_type=DataType.BOOL,
                    description='Whether conversation contains self-harm content',
                    index_filterable=True
                ),
                Property(
                    name='symptomsPresented',
                    data_type=DataType.TEXT_ARRAY,
                    description='List of symptoms discussed',
                    index_filterable=True,
                    index_searchable=True
                ),
                Property(
                    name='copingStrategiesDiscussed',
                    data_type=DataType.TEXT_ARRAY,
                    description='List of coping strategies discussed',
                    index_filterable=True,
                    index_searchable=True
                ),
                Property(
                    name='conversationOutcome',
                    data_type=DataType.TEXT,
                    description='Outcome: positive, neutral, negative',
                    index_filterable=True,
                    index_searchable=False
                ),
            ]
        )
        logger.info("ConversationEmbedding collection created with indexed properties")
    else:
        logger.info("ConversationEmbedding collection already exists")

    logger.info(f"Connected to Weaviate: {WEAVIATE_SCHEME}://{WEAVIATE_HOST}")
except Exception as e:
    logger.error(f"Failed to connect to Weaviate: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ----------------- Embedding Client -----------------
if USE_GEMINI:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY environment variable must be set")
    from google import genai
    embedding_client = genai.Client(api_key=GEMINI_API_KEY)
    EMBED_MODEL = "gemini-embedding-001"
    logger.info("Using Gemini embeddings")
else:
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY environment variable must be set")
    from openai import OpenAI
    embedding_client = OpenAI(
        api_key=OPENAI_API_KEY,
        timeout=60.0,  # 60 second timeout for API calls
        max_retries=2  # Limit retries to prevent hanging
    )
    EMBED_MODEL = "text-embedding-3-small" if USE_SMALL_MODEL else "text-embedding-3-large"
    logger.info(f"Using OpenAI embeddings: {EMBED_MODEL}")
    if USE_SMALL_MODEL:
        logger.info("💡 Using small model - 85% cost savings!")

logger.info(f"Chunk size: {CHUNK_SIZE} words (larger = fewer embeddings)")
logger.info(f"Max batch size: {MAX_BATCH_SIZE} (larger = fewer API calls)")
logger.info(f"Inter-batch delay: {INTER_BATCH_DELAY}s (prevents rate limits)")
logger.info(f"Adaptive batch sizing: {ADAPTIVE_BATCH_SIZING}")
logger.info(f"Parallel workers: {MAX_WORKERS}")
logger.info(f"MongoDB batch size: {MONGO_BATCH_SIZE} (memory optimization)")
logger.info(f"Batch commit size: {BATCH_COMMIT_SIZE}")
logger.info(f"Text preprocessing: {REMOVE_FILLER_WORDS}")
logger.info(f"HIPAA/PHI filtering: {REMOVE_HIPAA_KEYWORDS}")
if REMOVE_HIPAA_KEYWORDS:
    logger.info(f"  Removing {len(HIPAA_KEYWORDS)} medical keywords and PHI patterns")

# Global state for adaptive rate limiting
class RateLimitState:
    def __init__(self):
        self.current_batch_size = MAX_BATCH_SIZE
        self.rate_limit_hits = 0
        self.last_request_time = 0
        self.consecutive_successes = 0

    def on_rate_limit(self):
        """Called when we hit a rate limit - reduce batch size"""
        self.rate_limit_hits += 1
        if ADAPTIVE_BATCH_SIZING and self.current_batch_size > MIN_BATCH_SIZE:
            old_size = self.current_batch_size
            self.current_batch_size = max(MIN_BATCH_SIZE, self.current_batch_size // 2)
            logger.info(f"📉 Reducing batch size: {old_size} → {self.current_batch_size}")
        self.consecutive_successes = 0

    def on_success(self):
        """Called on successful request - potentially increase batch size"""
        self.consecutive_successes += 1
        # After 10 consecutive successes, try increasing batch size
        if ADAPTIVE_BATCH_SIZING and self.consecutive_successes >= 10:
            if self.current_batch_size < MAX_BATCH_SIZE:
                old_size = self.current_batch_size
                self.current_batch_size = min(MAX_BATCH_SIZE, int(self.current_batch_size * 1.5))
                logger.info(f"📈 Increasing batch size: {old_size} → {self.current_batch_size}")
            self.consecutive_successes = 0

    def wait_if_needed(self):
        """Enforce inter-batch delay"""
        if INTER_BATCH_DELAY > 0:
            elapsed = time.time() - self.last_request_time
            if elapsed < INTER_BATCH_DELAY:
                time.sleep(INTER_BATCH_DELAY - elapsed)
        self.last_request_time = time.time()

rate_limit_state = RateLimitState()

# Global state for HIPAA redaction tracking (thread-safe)
class HIPAARedactionStats:
    def __init__(self):
        self.ssn_count = 0
        self.phone_count = 0
        self.email_count = 0
        self.date_count = 0
        self.id_count = 0
        self.keyword_count = 0
        self.total_texts_processed = 0
        self._lock = threading.Lock()  # Thread-safe counter updates

    def increment(self, **kwargs):
        """Thread-safe increment of counters"""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, getattr(self, key) + value)

    def log_stats(self):
        """Log redaction statistics"""
        if self.total_texts_processed == 0:
            logger.info("No texts processed for HIPAA filtering")
            return

        total_redactions = (self.ssn_count + self.phone_count + self.email_count +
                          self.date_count + self.id_count + self.keyword_count)

        logger.info(f"\n{'='*60}")
        logger.info(f"HIPAA REDACTION STATISTICS")
        logger.info(f"{'='*60}")
        logger.info(f"Total texts processed: {self.total_texts_processed:,}")
        logger.info(f"Total redactions: {total_redactions:,}")
        logger.info(f"  SSNs redacted: {self.ssn_count:,}")
        logger.info(f"  Phone numbers redacted: {self.phone_count:,}")
        logger.info(f"  Email addresses redacted: {self.email_count:,}")
        logger.info(f"  PHI dates redacted: {self.date_count:,}")
        logger.info(f"  MRN/Patient IDs redacted: {self.id_count:,}")
        logger.info(f"  Medical terms redacted: {self.keyword_count:,}")
        if self.total_texts_processed > 0:
            redaction_rate = (total_redactions / self.total_texts_processed) * 100
            logger.info(f"Redaction rate: {redaction_rate:.2f}% (avg per text)")
        logger.info(f"{'='*60}\n")

hipaa_stats = HIPAARedactionStats()

# ----------------- Optimization Functions -----------------
def preprocess_text(text: str) -> str:
    """Remove PHI patterns while preserving case and semantic meaning"""

    if REMOVE_HIPAA_KEYWORDS:
        # Accumulate counts for thread-safe batch update
        counts = {'total_texts_processed': 1}

        # Remove specific PHI patterns (case-insensitive but preserve rest of text)
        # SSN pattern: XXX-XX-XXXX
        text, ssn_count = re.subn(r'\b\d{3}-\d{2}-\d{4}\b', '[REDACTED_SSN]', text, flags=re.IGNORECASE)
        if ssn_count > 0:
            counts['ssn_count'] = ssn_count

        # Phone numbers: (XXX) XXX-XXXX or XXX-XXX-XXXX
        text, phone_count = re.subn(r'\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '[REDACTED_PHONE]', text)
        if phone_count > 0:
            counts['phone_count'] = phone_count

        # Email addresses
        text, email_count = re.subn(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[REDACTED_EMAIL]', text)
        if email_count > 0:
            counts['email_count'] = email_count

        # Dates ONLY when preceded by PHI context (DOB, date of birth, etc.)
        text, date_count = re.subn(
            r'\b(dob|date\s+of\s+birth|born\s+on|birthday)[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
            r'\1 [REDACTED_DATE]',
            text,
            flags=re.IGNORECASE
        )
        if date_count > 0:
            counts['date_count'] = date_count

        # MRN/Patient ID with context-aware replacement
        text, id_count = re.subn(
            r'\b(mrn|patient\s*id|medical\s*record\s*number?)[:\s#]*\d+\b',
            r'\1 [REDACTED_ID]',
            text,
            flags=re.IGNORECASE
        )
        if id_count > 0:
            counts['id_count'] = id_count

        # Remove HIPAA keywords (case-insensitive, handle multi-word phrases)
        total_kw_count = 0
        for keyword in HIPAA_KEYWORDS:
            # Handle multi-word phrases by replacing spaces with flexible whitespace
            pattern = r'\b' + re.escape(keyword).replace(' ', r'\s+') + r'\b'
            text, kw_count = re.subn(pattern, '[MEDICAL_TERM]', text, flags=re.IGNORECASE)
            total_kw_count += kw_count
        if total_kw_count > 0:
            counts['keyword_count'] = total_kw_count

        # Thread-safe batch update of all counters
        hipaa_stats.increment(**counts)

    # Optionally remove filler words (disabled by default for better semantic embeddings)
    if REMOVE_FILLER_WORDS:
        for filler in FILLER_WORDS:
            # Only remove filler words that are standalone (not part of meaningful phrases)
            pattern = r'\b' + re.escape(filler).replace(' ', r'\s+') + r'\b'
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)

    # Normalize whitespace only (preserve case for better embeddings)
    text = ' '.join(text.split())

    return text

def chunk_text(text: str, size: int = CHUNK_SIZE) -> List[str]:
    """Split text into larger chunks"""
    words = text.split()
    if len(words) <= size:
        return [text]
    return [" ".join(words[i:i+size]) for i in range(0, len(words), size)]

def get_text_hash(text: str) -> str:
    """Generate hash for deduplication"""
    return hashlib.md5(text.encode()).hexdigest()

def check_embedding_exists(weaviate_client, conversation_id: str) -> bool:
    """Check if embeddings already exist for a conversation (v4 API)"""
    if not CHECK_EXISTING:
        return False

    try:
        from weaviate.classes.query import Filter

        collection = weaviate_client.collections.get('ConversationEmbedding')
        result = collection.aggregate.over_all(
            filters=Filter.by_property('conversationId').equal(conversation_id)
        )
        return result.total_count > 0
    except Exception as e:
        logger.warning(f"Error checking existing embeddings: {e}")
        return False

def parse_retry_after(error_message: str) -> float:
    """Parse retry time from OpenAI rate limit error message"""
    # Look for "Please try again in XXXms" or "Please try again in Xs"
    match = re.search(r'try again in (\d+(?:\.\d+)?)(ms|s)', str(error_message))
    if match:
        value = float(match.group(1))
        unit = match.group(2)
        # Convert to seconds
        if unit == 'ms':
            return value / 1000.0
        else:
            return value
    return None

def get_batch_embeddings(texts: List[str], retry_count: int = 0) -> List[List[float]]:
    """Get embeddings with intelligent retry logic and rate limit handling"""
    # Enforce inter-batch delay to prevent rate limits
    rate_limit_state.wait_if_needed()

    try:
        if USE_GEMINI:
            results = embedding_client.models.embed_content(model=EMBED_MODEL, contents=texts)
            embeddings = [emb.values for emb in results.embeddings]
        else:
            result = embedding_client.embeddings.create(model=EMBED_MODEL, input=texts)
            embeddings = [item.embedding for item in result.data]

        # Success! Update state
        rate_limit_state.on_success()
        return embeddings

    except Exception as e:
        if retry_count < MAX_RETRIES:
            error_str = str(e)

            # Check if it's a rate limit error
            is_rate_limit = 'rate_limit' in error_str.lower() or '429' in error_str

            if is_rate_limit:
                # Update state to reduce batch size for future requests
                rate_limit_state.on_rate_limit()

                # Try to parse the retry-after time from the error
                retry_after = parse_retry_after(error_str)

                if retry_after:
                    # Add a small buffer (20%) to the suggested wait time
                    wait_time = retry_after * 1.2
                    logger.warning(f"⏱️  Rate limit hit (attempt {retry_count + 1}/{MAX_RETRIES}). "
                                 f"API suggests waiting {retry_after:.2f}s. Waiting {wait_time:.2f}s...")
                else:
                    # Fallback to exponential backoff if we can't parse the time
                    wait_time = RETRY_DELAY * (2 ** retry_count)  # Exponential: 5s, 10s, 20s
                    logger.warning(f"⏱️  Rate limit hit (attempt {retry_count + 1}/{MAX_RETRIES}). "
                                 f"Waiting {wait_time:.1f}s (exponential backoff)...")
            else:
                # For non-rate-limit errors, use shorter exponential backoff
                wait_time = RETRY_DELAY * (retry_count + 1)
                logger.warning(f"API error (attempt {retry_count + 1}/{MAX_RETRIES}): {error_str[:200]}")
                logger.warning(f"Retrying in {wait_time}s...")

            time.sleep(wait_time)
            return get_batch_embeddings(texts, retry_count + 1)
        else:
            logger.error(f"❌ Failed after {MAX_RETRIES} retries: {e}")
            raise

class CheckpointWriter:
    """Buffered checkpoint writer to reduce I/O overhead"""
    def __init__(self, filename: str, buffer_size: int = 50):
        self.filename = filename
        self.buffer_size = buffer_size
        self.buffer = []
        self._lock = threading.Lock()

    def save(self, call_id: str):
        """Add to buffer and flush if needed"""
        with self._lock:
            self.buffer.append(call_id)
            if len(self.buffer) >= self.buffer_size:
                self._flush()

    def _flush(self):
        """Write buffer to file (must be called with lock held)"""
        if self.buffer:
            with open(self.filename, 'a') as f:
                f.write('\n'.join(self.buffer) + '\n')
            self.buffer = []

    def flush(self):
        """Public flush method with lock"""
        with self._lock:
            self._flush()

def load_checkpoint() -> set:
    """Load processed conversation IDs"""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            processed = set(line.strip() for line in f)
        logger.info(f"Loaded checkpoint: {len(processed)} conversations processed")
        return processed
    return set()

def bulk_insert_embeddings(weaviate_client, batch_data: List[Tuple]):
    """Bulk insert embeddings into Weaviate (v4 API) - OPTIMIZED"""
    try:
        from weaviate.util import generate_uuid5
        collection = weaviate_client.collections.get('ConversationEmbedding')

        # Use batch insertion with context manager for better performance
        with collection.batch.dynamic() as batch:
            for data in batch_data:
                conversation_id, turn_index, speaker, text_chunk, embedding, crisis_level, contains_suicidal, contains_self_harm, symptoms, coping_strategies, outcome = data

                batch.add_object(
                    properties={
                        'conversationId': conversation_id,
                        'turnIndex': turn_index,
                        'speaker': speaker,
                        'textChunk': text_chunk,
                        'crisisLevel': crisis_level,
                        'containsSuicidalContent': contains_suicidal,
                        'containsSelfHarmContent': contains_self_harm,
                        'symptomsPresented': symptoms,
                        'copingStrategiesDiscussed': coping_strategies,
                        'conversationOutcome': outcome
                    },
                    vector=embedding
                )

        logger.info(f"✓ Batch inserted {len(batch_data)} embeddings into Weaviate")
    except Exception as e:
        logger.error(f"Weaviate insert error: {e}")
        import traceback
        traceback.print_exc()
        raise

def process_conversation(call_data: dict) -> Tuple[str, List[Tuple], int]:
    """Process a single conversation (thread-safe) - AGGREGATES TURNS BEFORE CHUNKING"""
    call_id = str(call_data.get("conversationId", call_data.get("_id")))
    messages = call_data.get("messages", [])

    # Extract clinical context
    clinical_context = call_data.get("clinicalContext", {})
    crisis_level = clinical_context.get("crisisLevel", "none")
    contains_suicidal = clinical_context.get("containsSuicidalContent", False)
    contains_self_harm = clinical_context.get("containsSelfHarmContent", False)
    symptoms = clinical_context.get("symptomsPresented", [])
    coping_strategies = clinical_context.get("copingStrategiesDiscussed", [])
    outcome = call_data.get("conversationOutcome", "unknown")

    if not messages:
        return call_id, [], 0

    # NEW APPROACH: Aggregate entire conversation into one text, then chunk
    # This ensures each embedding has meaningful context across multiple turns
    conversation_text = []
    turn_metadata = []  # Track which turn each word belongs to

    for turn_index, msg in enumerate(messages):
        speaker = msg.get("speaker", "unknown")
        # Map "user" to "Patient"
        if speaker.lower() == "user":
            speaker = "Patient"
        text = msg.get("message", "").strip()
        if not text:
            continue

        # Preprocess text
        text = preprocess_text(text)

        # Skip if preprocessing resulted in empty or very short text
        if not text or len(text.strip()) < 3:
            continue

        # Add speaker prefix for context
        formatted_text = f"[{speaker}]: {text}"
        conversation_text.append(formatted_text)

        # Track metadata for this turn
        turn_metadata.append({
            'turn_index': turn_index,
            'speaker': speaker,
            'text': formatted_text,
            'word_count': len(formatted_text.split())
        })

    if not conversation_text:
        return call_id, [], 0

    # Combine entire conversation into one string
    full_conversation = " ".join(conversation_text)

    # Now chunk the full conversation into CHUNK_SIZE pieces
    chunks = chunk_text(full_conversation, CHUNK_SIZE)

    # Prepare chunks with metadata
    all_chunks = []
    all_metadata = []

    # Calculate word positions for each turn to map chunks back to turns
    word_positions = []
    cumulative_words = 0
    for meta in turn_metadata:
        word_count = meta['word_count']
        word_positions.append({
            'turn_index': meta['turn_index'],
            'speaker': meta['speaker'],
            'start_word': cumulative_words,
            'end_word': cumulative_words + word_count
        })
        cumulative_words += word_count

    for chunk_index, chunk in enumerate(chunks):
        chunk_clean = chunk.strip()
        if chunk_clean and len(chunk_clean) >= 10:  # Require at least 10 chars
            all_chunks.append(chunk_clean)

            # Estimate which turn this chunk starts at based on word position
            chunk_start_word = chunk_index * CHUNK_SIZE

            # Find the turn that contains this chunk's starting position
            turn_index_for_chunk = 0
            speaker_for_chunk = 'MIXED'

            for pos in word_positions:
                if pos['start_word'] <= chunk_start_word < pos['end_word']:
                    turn_index_for_chunk = pos['turn_index']
                    speaker_for_chunk = pos['speaker']
                    break
                elif chunk_start_word >= pos['end_word']:
                    # Chunk starts after this turn
                    turn_index_for_chunk = pos['turn_index']
                    speaker_for_chunk = pos['speaker']

            all_metadata.append({
                'turn_index': turn_index_for_chunk,
                'speaker': speaker_for_chunk if chunk_index == 0 or len(word_positions) == 1 else 'MIXED',
                'chunk': chunk_clean,
                'chunk_index': chunk_index
            })

    if not all_chunks:
        return call_id, [], 0

    # Process in batches (use adaptive batch size from rate limit state)
    insert_data = []

    for i in range(0, len(all_chunks), rate_limit_state.current_batch_size):
        # Use current adaptive batch size
        batch_size = rate_limit_state.current_batch_size
        batch_chunks = all_chunks[i:i+batch_size]
        batch_metadata = all_metadata[i:i+batch_size]

        try:
            embeddings = get_batch_embeddings(batch_chunks)

            for metadata, embedding in zip(batch_metadata, embeddings):
                insert_data.append((
                    call_id,
                    metadata['turn_index'],
                    metadata['speaker'],
                    metadata['chunk'],
                    embedding,
                    crisis_level,
                    contains_suicidal,
                    contains_self_harm,
                    symptoms,
                    coping_strategies,
                    outcome
                ))
        except Exception as e:
            logger.error(f"Error embedding conversation {call_id}: {e}")
            return call_id, [], 0

    return call_id, insert_data, len(all_chunks)

# ----------------- Main Processing -----------------

# Build filter dynamically
mongo_filter = {}



logger.info(f"MongoDB filter: {mongo_filter if mongo_filter else 'None (processing all documents)'}")

processed_ids = load_checkpoint()
checkpoint_writer = CheckpointWriter(CHECKPOINT_FILE, buffer_size=50)  # Buffer 50 IDs before writing
total_conversations = collection.count_documents(mongo_filter)

logger.info(f"Total conversations matching filter: {total_conversations}")
logger.info(f"Already processed: {len(processed_ids)}")
logger.info(f"Remaining: {total_conversations - len(processed_ids)}")

insert_buffer = []
conversations_processed = 0
total_chunks_processed = 0
api_calls_saved = 0
start_time = time.time()

try:
    # MEMORY OPTIMIZATION: Process in batches instead of loading all at once
    logger.info("Processing conversations in batches to optimize memory usage...")

    # Create cursor for batched reading
    mongo_cursor = collection.find(mongo_filter).batch_size(MONGO_BATCH_SIZE)

    # PERFORMANCE: Create ONE ThreadPoolExecutor and reuse it for all batches
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Create progress bar for total conversations
        with tqdm(total=total_conversations - len(processed_ids), desc="Processing",
                  unit="conv", mininterval=1.0) as pbar:

            # Process conversations in batches
            conversations_batch = []

            def process_batch(batch):
                """Helper function to process a batch of conversations"""
                futures = {executor.submit(process_conversation, c): c for c in batch}

                for future in as_completed(futures):
                    try:
                        call_id, insert_data, chunk_count = future.result(timeout=300)  # 5 min timeout

                        if insert_data:
                            insert_buffer.extend(insert_data)
                            nonlocal total_chunks_processed
                            total_chunks_processed += chunk_count

                        checkpoint_writer.save(call_id)
                        processed_ids.add(call_id)  # Add to memory to avoid re-processing
                        nonlocal conversations_processed
                        conversations_processed += 1

                        # Bulk commit to Weaviate
                        if len(insert_buffer) >= BATCH_COMMIT_SIZE:
                            logger.info(f"Committing batch of {len(insert_buffer)} embeddings to Weaviate...")
                            bulk_insert_embeddings(weaviate_client, insert_buffer)
                            insert_buffer.clear()

                        # Update progress with stats
                        pbar.set_postfix({
                            'chunks': total_chunks_processed,
                            'buffer': len(insert_buffer),
                            'rate': f'{conversations_processed/(time.time()-start_time):.1f}/min' if conversations_processed > 0 else '0/min'
                        })
                        pbar.update(1)

                    except TimeoutError:
                        logger.error(f"Timeout processing conversation (exceeded 5 minutes)")
                        pbar.update(1)
                    except Exception as e:
                        logger.error(f"Error processing conversation: {e}")
                        import traceback
                        traceback.print_exc()
                        pbar.update(1)

            for call in mongo_cursor:
                call_id = str(call.get("conversationId", call.get("_id")))

                # Skip if already processed
                if call_id in processed_ids:
                    continue

                # Skip if already has embeddings
                if CHECK_EXISTING and check_embedding_exists(weaviate_client, call_id):
                    logger.debug(f"Skipping {call_id} - embeddings exist")
                    checkpoint_writer.save(call_id)
                    api_calls_saved += 1
                    processed_ids.add(call_id)  # Add to memory to avoid re-checking
                    pbar.update(1)
                    continue

                conversations_batch.append(call)

                # Process batch when it reaches MONGO_BATCH_SIZE
                if len(conversations_batch) >= MONGO_BATCH_SIZE:
                    logger.debug(f"Processing batch of {len(conversations_batch)} conversations...")
                    process_batch(conversations_batch)
                    # Clear batch to free memory
                    conversations_batch = []

            # Process remaining conversations in final batch
            if conversations_batch:
                logger.debug(f"Processing final batch of {len(conversations_batch)} conversations...")
                process_batch(conversations_batch)

    # Final commit
    if insert_buffer:
        bulk_insert_embeddings(weaviate_client, insert_buffer)
        logger.info("Final batch committed")

    # Flush any remaining checkpoints
    checkpoint_writer.flush()
    logger.info("Checkpoint buffer flushed")

    if api_calls_saved > 0:
        logger.info(f"💡 Skipped {api_calls_saved} conversations (already embedded)")

except KeyboardInterrupt:
    logger.info("\n\nInterrupted. Progress saved to checkpoint.")
    checkpoint_writer.flush()  # Ensure checkpoints are saved on interrupt
except Exception as e:
    logger.error(f"Fatal error: {e}")
    checkpoint_writer.flush()  # Ensure checkpoints are saved on error
finally:
    mongo_client.close()
    weaviate_client.close()

    elapsed_time = time.time() - start_time
    logger.info(f"\n{'='*60}")
    logger.info(f"COMPLETED")
    logger.info(f"{'='*60}")
    logger.info(f"Conversations processed: {conversations_processed}")
    logger.info(f"Total chunks: {total_chunks_processed}")
    logger.info(f"API calls saved (deduplication): {api_calls_saved}")
    logger.info(f"Rate limit hits: {rate_limit_state.rate_limit_hits}")
    logger.info(f"Final batch size: {rate_limit_state.current_batch_size} (started at {MAX_BATCH_SIZE})")
    logger.info(f"Elapsed time: {elapsed_time/60:.1f} minutes ({elapsed_time/3600:.2f} hours)")
    if conversations_processed > 0:
        logger.info(f"Average chunks per conversation: {total_chunks_processed/conversations_processed:.1f}")
        logger.info(f"Processing rate: {conversations_processed/(elapsed_time/60):.1f} conversations/minute")
        logger.info(f"Time per conversation: {elapsed_time/conversations_processed:.1f} seconds")

    # Log HIPAA redaction statistics
    if REMOVE_HIPAA_KEYWORDS:
        hipaa_stats.log_stats()
