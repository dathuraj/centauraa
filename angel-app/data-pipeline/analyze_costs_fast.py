import os
from pymongo import MongoClient
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# MongoDB Config
MONGO_USER = "admin"
MONGO_PASSWORD = "WetiPosi@2020!"
MONGO_URI = f"mongodb://{quote_plus(MONGO_USER)}:{quote_plus(MONGO_PASSWORD)}@127.0.0.1:12017"
MONGO_DB = "backend_sweeten"
MONGO_COLLECTION = "call_transcripts"

CHUNK_SIZE = 400  # words per chunk
TOKENS_PER_WORD = 1.33  # average for English text

# OpenAI pricing
OPENAI_COST_PER_1M_TOKENS = 0.13  # text-embedding-3-large

# Connect to MongoDB
mongo_client = MongoClient(MONGO_URI)
collection = mongo_client[MONGO_DB][MONGO_COLLECTION]

print("Analyzing conversation data using aggregation pipeline...\n")

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

if mongo_filter:
    print(f"Filter settings:")
    if MONGO_FILTER_ORG_ID:
        print(f"  Organization ID: {MONGO_FILTER_ORG_ID}")
    if MONGO_FILTER_MIN_TRANSCRIPTIONS > 0:
        print(f"  Minimum transcriptions: >{MONGO_FILTER_MIN_TRANSCRIPTIONS}")
    if MONGO_FILTER_TIMESTAMP_GTE:
        print(f"  Timestamp from: {MONGO_FILTER_TIMESTAMP_GTE}")
    if MONGO_FILTER_TIMESTAMP_LT:
        print(f"  Timestamp to: {MONGO_FILTER_TIMESTAMP_LT}")
    print()
else:
    print("No filter applied - analyzing all conversations\n")

# Use MongoDB aggregation for faster analysis
pipeline = [
    {"$match": mongo_filter},
    {
        "$project": {
            "has_transcripts": {"$gt": [{"$size": {"$ifNull": ["$transcriptions", []]}}, 0]},
            "turn_count": {"$size": {"$ifNull": ["$transcriptions", []]}},
            "transcriptions": 1
        }
    },
    {
        "$facet": {
            "stats": [
                {
                    "$group": {
                        "_id": None,
                        "total": {"$sum": 1},
                        "with_transcripts": {"$sum": {"$cond": ["$has_transcripts", 1, 0]}},
                        "without_transcripts": {"$sum": {"$cond": ["$has_transcripts", 0, 1]}}
                    }
                }
            ]
        }
    }
]

print("Fetching conversation counts...")
result = list(collection.aggregate(pipeline))
stats = result[0]["stats"][0] if result and result[0]["stats"] else {}

total_docs = stats.get("total", 0)
with_transcripts = stats.get("with_transcripts", 0)
without_transcripts = stats.get("without_transcripts", 0)

print(f"Found {total_docs} total conversations")
print(f"  - With transcripts: {with_transcripts}")
print(f"  - Without transcripts: {without_transcripts}")
print()

# Sample 1000 conversations for detailed analysis
print("Sampling conversations for detailed word/chunk analysis...")
sample_size = min(1000, with_transcripts)

total_turns = 0
total_words = 0
total_chunks = 0
sampled_count = 0

for call in collection.find(mongo_filter).limit(sample_size):
    transcriptions = call.get("transcriptions", [])
    if not transcriptions:
        continue

    sampled_count += 1

    for transcription in transcriptions:
        text = transcription.get("value", "").strip()
        if not text:
            continue

        total_turns += 1
        words = len(text.split())
        total_words += words

        # Calculate chunks for this turn
        chunks_needed = max(1, (words + CHUNK_SIZE - 1) // CHUNK_SIZE)
        total_chunks += chunks_needed

    if sampled_count % 100 == 0:
        print(f"  Processed {sampled_count}/{sample_size} samples...")

# Calculate statistics from sample
if sampled_count > 0:
    avg_turns = total_turns / sampled_count
    avg_words = total_words / sampled_count
    avg_chunks = total_chunks / sampled_count
    avg_tokens = avg_chunks * CHUNK_SIZE * TOKENS_PER_WORD
else:
    avg_turns = avg_words = avg_chunks = avg_tokens = 0

# Cost calculations
cost_per_conversation = (avg_tokens / 1_000_000) * OPENAI_COST_PER_1M_TOKENS

# Extrapolate to full dataset
full_tokens = with_transcripts * avg_tokens
full_cost = (full_tokens / 1_000_000) * OPENAI_COST_PER_1M_TOKENS

# Print results
print()
print("=" * 60)
print("CONVERSATION ANALYSIS")
print("=" * 60)
print(f"Total conversations in DB:        {total_docs}")
print(f"Conversations with transcripts:   {with_transcripts}")
print(f"Conversations without transcripts: {without_transcripts}")
print(f"Sample size analyzed:             {sampled_count}")
print()
print("AVERAGES PER CONVERSATION (from sample):")
print(f"  Turns:                          {avg_turns:.1f}")
print(f"  Words:                          {avg_words:.1f}")
print(f"  Chunks (400 words each):        {avg_chunks:.1f}")
print(f"  Tokens (estimated):             {avg_tokens:.0f}")
print()
print("=" * 60)
print("COST ANALYSIS - OpenAI text-embedding-3-large")
print("=" * 60)
print(f"Cost per conversation:            ${cost_per_conversation:.4f}")
print(f"Current DB ({with_transcripts} conversations):")
print(f"  Total tokens:                   {full_tokens:,.0f}")
print(f"  Total cost:                     ${full_cost:.2f}")
print()
print("PROJECTIONS:")
print(f"  10,000 conversations:           ${cost_per_conversation * 10_000:.2f}")
print(f"  50,000 conversations:           ${cost_per_conversation * 50_000:.2f}")
print(f"  100,000 conversations:          ${cost_per_conversation * 100_000:.2f}")
print(f"  500,000 conversations:          ${cost_per_conversation * 500_000:.2f}")
print(f"  1,000,000 conversations:        ${cost_per_conversation * 1_000_000:.2f}")
print()

# Additional stats
print("=" * 60)
print("OPTIMIZATION OPPORTUNITIES")
print("=" * 60)

# Calculate smaller model savings
small_model_cost = 0.02  # text-embedding-3-small
small_model_total = (full_tokens / 1_000_000) * small_model_cost
savings = full_cost - small_model_total
savings_pct = (savings / full_cost * 100) if full_cost > 0 else 0

print(f"Using text-embedding-3-small instead:")
print(f"  Current DB cost: ${small_model_total:.2f} (saves ${savings:.2f} or {savings_pct:.0f}%)")
print(f"  100K conversations: ${cost_per_conversation * 100_000 * (small_model_cost/OPENAI_COST_PER_1M_TOKENS):.2f}")
print()

mongo_client.close()
print("Analysis complete!")
