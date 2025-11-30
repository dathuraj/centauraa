import os
import sys
from pymongo import MongoClient
import psycopg2
from psycopg2.extras import execute_batch
from tqdm import tqdm
from urllib.parse import quote_plus
import time
from typing import List, Tuple, Dict
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
from dotenv import load_dotenv

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

# OPTIMIZATION 3: Smart deduplication
CHECK_EXISTING = os.getenv("CHECK_EXISTING", "true").lower() == "true"

# OPTIMIZATION 4: Text preprocessing to reduce token count
REMOVE_FILLER_WORDS = os.getenv("REMOVE_FILLER_WORDS", "true").lower() == "true"

# OPTIMIZATION 5: Parallel processing
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "3"))  # Concurrent conversation processing

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

# PostgreSQL Config
PG_DBNAME = os.getenv("PG_DBNAME", "angel_db")
PG_USER = os.getenv("PG_USER", "angel_user")
PG_PASSWORD = os.getenv("PG_PASSWORD")
PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = os.getenv("PG_PORT", "5432")

if not PG_PASSWORD:
    raise ValueError("PG_PASSWORD environment variable must be set")

PG_CONN_INFO = f"dbname={PG_DBNAME} user={PG_USER} password={PG_PASSWORD} host={PG_HOST} port={PG_PORT}"

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

BATCH_COMMIT_SIZE = int(os.getenv("BATCH_COMMIT_SIZE", "1000"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
RETRY_DELAY = int(os.getenv("RETRY_DELAY", "5"))

CHECKPOINT_FILE = "embeddings_ultra_checkpoint.txt"

# Filler words to remove (optional optimization)
FILLER_WORDS = {
    # 'um', 'uh', 'like', 'you know', 'i mean', 'sort of', 'kind of',
    # 'basically', 'actually', 'literally', 'right', 'okay', 'so'
}

# HIPAA/PHI related words and patterns to remove
HIPAA_KEYWORDS = {
    # Identifiers
    # 'ssn', 'social security', 'medical record', 'mrn', 'patient id', 'dob', 'date of birth',
    # 'insurance', 'medicaid', 'medicare', 'health plan', 'policy number',
}

# Enable/disable HIPAA filtering
REMOVE_HIPAA_KEYWORDS = os.getenv("REMOVE_HIPAA_KEYWORDS", "true").lower() == "true"

# ----------------- Database Connections -----------------
def get_mongo_connection():
    """Get MongoDB connection (thread-safe)"""
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return client

def get_pg_connection():
    """Get PostgreSQL connection (thread-safe)"""
    return psycopg2.connect(PG_CONN_INFO)

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
    pg_conn = get_pg_connection()
    pg_cursor = pg_conn.cursor()
    logger.info("Connected to PostgreSQL")
except Exception as e:
    logger.error(f"Failed to connect to PostgreSQL: {e}")
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
    embedding_client = OpenAI(api_key=OPENAI_API_KEY)
    EMBED_MODEL = "text-embedding-3-small" if USE_SMALL_MODEL else "text-embedding-3-large"
    logger.info(f"Using OpenAI embeddings: {EMBED_MODEL}")
    if USE_SMALL_MODEL:
        logger.info("💡 Using small model - 85% cost savings!")

logger.info(f"Chunk size: {CHUNK_SIZE} words (larger = fewer embeddings)")
logger.info(f"Max batch size: {MAX_BATCH_SIZE} (larger = fewer API calls)")
logger.info(f"Parallel workers: {MAX_WORKERS}")
logger.info(f"Text preprocessing: {REMOVE_FILLER_WORDS}")
logger.info(f"HIPAA/PHI filtering: {REMOVE_HIPAA_KEYWORDS}")
if REMOVE_HIPAA_KEYWORDS:
    logger.info(f"  Removing {len(HIPAA_KEYWORDS)} medical keywords and PHI patterns")

# ----------------- Optimization Functions -----------------
def preprocess_text(text: str) -> str:
    """Remove filler words, HIPAA/PHI keywords, and clean text to reduce tokens"""
    # Convert to lowercase for matching
    text_lower = text.lower()

    # Remove HIPAA/PHI keywords
    if REMOVE_HIPAA_KEYWORDS:
        # Remove specific PHI patterns
        # SSN pattern: XXX-XX-XXXX
        text_lower = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[REDACTED]', text_lower)

        # Phone numbers: (XXX) XXX-XXXX or XXX-XXX-XXXX
        text_lower = re.sub(r'\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '[REDACTED]', text_lower)

        # Email addresses
        text_lower = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[REDACTED]', text_lower)

        # Dates: MM/DD/YYYY or MM-DD-YYYY
        text_lower = re.sub(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', '[REDACTED]', text_lower)

        # Medical Record Numbers (MRN): Common patterns
        text_lower = re.sub(r'\bmrn\s*[:#]?\s*\d+\b', '[REDACTED]', text_lower)
        text_lower = re.sub(r'\bpatient\s*id\s*[:#]?\s*\d+\b', '[REDACTED]', text_lower)

        # Remove HIPAA keywords
        for keyword in HIPAA_KEYWORDS:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            text_lower = re.sub(pattern, '[MEDICAL_TERM]', text_lower)

    # Remove filler words
    if REMOVE_FILLER_WORDS:
        for filler in FILLER_WORDS:
            pattern = r'\b' + re.escape(filler) + r'\b'
            text_lower = re.sub(pattern, '', text_lower)

    # Remove extra whitespace
    text_lower = ' '.join(text_lower.split())

    return text_lower

def chunk_text(text: str, size: int = CHUNK_SIZE) -> List[str]:
    """Split text into larger chunks"""
    words = text.split()
    if len(words) <= size:
        return [text]
    return [" ".join(words[i:i+size]) for i in range(0, len(words), size)]

def get_text_hash(text: str) -> str:
    """Generate hash for deduplication"""
    return hashlib.md5(text.encode()).hexdigest()

def check_embedding_exists(pg_cursor, conversation_id: str) -> bool:
    """Check if embeddings already exist for a conversation"""
    if not CHECK_EXISTING:
        return False

    pg_cursor.execute(
        "SELECT COUNT(*) FROM conversation_embeddings WHERE conversation_id = %s",
        (conversation_id,)
    )
    count = pg_cursor.fetchone()[0]
    return count > 0

def get_batch_embeddings(texts: List[str], retry_count: int = 0) -> List[List[float]]:
    """Get embeddings with retry logic and larger batch support"""
    try:
        if USE_GEMINI:
            results = embedding_client.models.embed_content(model=EMBED_MODEL, contents=texts)
            return [emb.values for emb in results.embeddings]
        else:
            result = embedding_client.embeddings.create(model=EMBED_MODEL, input=texts)
            return [item.embedding for item in result.data]
    except Exception as e:
        if retry_count < MAX_RETRIES:
            logger.warning(f"API error (attempt {retry_count + 1}/{MAX_RETRIES}): {e}")
            time.sleep(RETRY_DELAY * (retry_count + 1))  # Exponential backoff
            return get_batch_embeddings(texts, retry_count + 1)
        else:
            logger.error(f"Failed after {MAX_RETRIES} retries: {e}")
            raise

def load_checkpoint() -> set:
    """Load processed conversation IDs"""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            processed = set(line.strip() for line in f)
        logger.info(f"Loaded checkpoint: {len(processed)} conversations processed")
        return processed
    return set()

def save_checkpoint(call_id: str):
    """Save checkpoint"""
    with open(CHECKPOINT_FILE, 'a') as f:
        f.write(f"{call_id}\n")

def bulk_insert_embeddings(pg_conn, batch_data: List[Tuple]):
    """Bulk insert with connection management"""
    cursor = pg_conn.cursor()
    try:
        execute_batch(
            cursor,
            """
            INSERT INTO conversation_embeddings
            (conversation_id, turn_index, speaker, text_chunk, embedding)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            batch_data,
            page_size=100
        )
        pg_conn.commit()
    except Exception as e:
        logger.error(f"Database insert error: {e}")
        pg_conn.rollback()
        raise
    finally:
        cursor.close()

def process_conversation(call_data: dict) -> Tuple[str, List[Tuple], int]:
    """Process a single conversation (thread-safe)"""
    call_id = str(call_data.get("call_id", call_data.get("_id")))
    transcriptions = call_data.get("transcriptions", [])

    if not transcriptions:
        return call_id, [], 0

    # Collect all chunks for this conversation
    all_chunks = []
    all_metadata = []

    for turn_index, transcription in enumerate(transcriptions):
        speaker = transcription.get("speaker", "unknown")
        text = transcription.get("value", "").strip()
        if not text:
            continue

        # Preprocess text
        text = preprocess_text(text)

        # Skip if preprocessing resulted in empty or very short text
        if not text or len(text.strip()) < 3:
            continue

        # Chunk text
        chunks = chunk_text(text, CHUNK_SIZE)

        for chunk in chunks:
            # Only add non-empty chunks with meaningful content
            chunk_clean = chunk.strip()
            if chunk_clean and len(chunk_clean) >= 3:
                all_chunks.append(chunk_clean)
                all_metadata.append({
                    'turn_index': turn_index,
                    'speaker': speaker,
                    'chunk': chunk_clean
                })

    if not all_chunks:
        return call_id, [], 0

    # Process in batches (up to MAX_BATCH_SIZE)
    insert_data = []

    for i in range(0, len(all_chunks), MAX_BATCH_SIZE):
        batch_chunks = all_chunks[i:i+MAX_BATCH_SIZE]
        batch_metadata = all_metadata[i:i+MAX_BATCH_SIZE]

        try:
            embeddings = get_batch_embeddings(batch_chunks)

            for metadata, embedding in zip(batch_metadata, embeddings):
                insert_data.append((
                    call_id,
                    metadata['turn_index'],
                    metadata['speaker'],
                    metadata['chunk'],
                    embedding
                ))
        except Exception as e:
            logger.error(f"Error embedding conversation {call_id}: {e}")
            return call_id, [], 0

    return call_id, insert_data, len(all_chunks)

# ----------------- Main Processing -----------------
# MongoDB filter from environment variables
MONGO_FILTER_ORG_ID = os.getenv("MONGO_FILTER_ORG_ID")
MONGO_FILTER_MIN_TRANSCRIPTIONS = int(os.getenv("MONGO_FILTER_MIN_TRANSCRIPTIONS", "0"))
MONGO_FILTER_TIMESTAMP_GTE = os.getenv("MONGO_FILTER_TIMESTAMP_GTE")
MONGO_FILTER_TIMESTAMP_LT = os.getenv("MONGO_FILTER_TIMESTAMP_LT")

# Build filter dynamically
mongo_filter = {}

if MONGO_FILTER_MIN_TRANSCRIPTIONS > 0:
    mongo_filter["$expr"] = {"$gt": [{"$size": "$transcriptions"}, MONGO_FILTER_MIN_TRANSCRIPTIONS]}

if MONGO_FILTER_ORG_ID:
    mongo_filter["organization_id"] = MONGO_FILTER_ORG_ID

if MONGO_FILTER_TIMESTAMP_GTE or MONGO_FILTER_TIMESTAMP_LT:
    timestamp_filter = {}
    if MONGO_FILTER_TIMESTAMP_GTE:
        timestamp_filter["$gte"] = MONGO_FILTER_TIMESTAMP_GTE
    if MONGO_FILTER_TIMESTAMP_LT:
        timestamp_filter["$lt"] = MONGO_FILTER_TIMESTAMP_LT
    mongo_filter["timestamp"] = timestamp_filter

logger.info(f"MongoDB filter: {mongo_filter if mongo_filter else 'None (processing all documents)'}")

processed_ids = load_checkpoint()
total_conversations = collection.count_documents(mongo_filter)

logger.info(f"Total conversations matching filter: {total_conversations}")
logger.info(f"Filter: organization_id=5d9d3389-29a4-4ea3-95cb-ac8a28ec8920, >10 transcriptions, date range")
logger.info(f"Already processed: {len(processed_ids)}")
logger.info(f"Remaining: {total_conversations - len(processed_ids)}")

insert_buffer = []
conversations_processed = 0
total_chunks_processed = 0
api_calls_saved = 0

try:
    # Fetch conversations to process
    conversations_to_process = []

    logger.info("Loading conversations from MongoDB...")
    for call in collection.find(mongo_filter):
        call_id = str(call.get("call_id", call.get("_id")))

        if call_id in processed_ids:
            continue

        # Skip if already has embeddings
        if CHECK_EXISTING and check_embedding_exists(pg_cursor, call_id):
            logger.debug(f"Skipping {call_id} - embeddings exist")
            save_checkpoint(call_id)
            api_calls_saved += 1
            continue

        conversations_to_process.append(call)

    logger.info(f"Processing {len(conversations_to_process)} conversations")

    if api_calls_saved > 0:
        logger.info(f"💡 Skipped {api_calls_saved} conversations (already embedded)")

    # Process conversations in parallel
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_conversation, call): call for call in conversations_to_process}

        with tqdm(total=len(conversations_to_process), desc="Processing") as pbar:
            for future in as_completed(futures):
                try:
                    call_id, insert_data, chunk_count = future.result()

                    if insert_data:
                        insert_buffer.extend(insert_data)
                        total_chunks_processed += chunk_count

                    save_checkpoint(call_id)
                    conversations_processed += 1

                    # Bulk commit
                    if len(insert_buffer) >= BATCH_COMMIT_SIZE:
                        bulk_insert_embeddings(pg_conn, insert_buffer)
                        insert_buffer = []

                    pbar.update(1)

                except Exception as e:
                    logger.error(f"Error processing conversation: {e}")
                    pbar.update(1)

    # Final commit
    if insert_buffer:
        bulk_insert_embeddings(pg_conn, insert_buffer)
        logger.info("Final batch committed")

except KeyboardInterrupt:
    logger.info("\n\nInterrupted. Progress saved to checkpoint.")
except Exception as e:
    logger.error(f"Fatal error: {e}")
finally:
    pg_cursor.close()
    pg_conn.close()
    mongo_client.close()

    logger.info(f"\n{'='*60}")
    logger.info(f"COMPLETED")
    logger.info(f"{'='*60}")
    logger.info(f"Conversations processed: {conversations_processed}")
    logger.info(f"Total chunks: {total_chunks_processed}")
    logger.info(f"API calls saved (deduplication): {api_calls_saved}")
    if conversations_processed > 0:
        logger.info(f"Average chunks per conversation: {total_chunks_processed/conversations_processed:.1f}")
