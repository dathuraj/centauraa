#!/usr/bin/env python3
"""Create indexes on MongoDB to speed up queries"""
import os
from pymongo import MongoClient, ASCENDING, DESCENDING
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

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

print(f"Connecting to MongoDB: {MONGO_DB}.{MONGO_COLLECTION}")
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
collection = client[MONGO_DB][MONGO_COLLECTION]

print("\nExisting indexes:")
for index in collection.list_indexes():
    print(f"  - {index['name']}: {index.get('key', {})}")

print("\nCreating new indexes...")

# Index on organization_id (used in filter)
try:
    result = collection.create_index([("organization_id", ASCENDING)], name="organization_id_1")
    print(f"✓ Created index: {result}")
except Exception as e:
    print(f"⚠ organization_id index: {e}")

# Index on timestamp (used in range query)
try:
    result = collection.create_index([("timestamp", ASCENDING)], name="timestamp_1")
    print(f"✓ Created index: {result}")
except Exception as e:
    print(f"⚠ timestamp index: {e}")

# Compound index on organization_id + timestamp (most efficient for this query)
try:
    result = collection.create_index([
        ("organization_id", ASCENDING),
        ("timestamp", ASCENDING)
    ], name="org_timestamp_1")
    print(f"✓ Created compound index: {result}")
except Exception as e:
    print(f"⚠ compound index: {e}")

# Index on call_id for checkpoint lookups
try:
    result = collection.create_index([("call_id", ASCENDING)], name="call_id_1")
    print(f"✓ Created index: {result}")
except Exception as e:
    print(f"⚠ call_id index: {e}")

print("\nFinal indexes:")
for index in collection.list_indexes():
    print(f"  - {index['name']}: {index.get('key', {})}")

client.close()
print("\n✅ Done!")
