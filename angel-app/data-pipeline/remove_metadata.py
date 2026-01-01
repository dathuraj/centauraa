#!/usr/bin/env python3
"""Remove _metadata field from centauraa.conversations collection"""
import os
from pymongo import MongoClient
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

# MongoDB Config
MONGO_USER = os.getenv("MONGO_USER", "admin")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_HOST = os.getenv("MONGO_HOST", "127.0.0.1")
MONGO_PORT = os.getenv("MONGO_PORT", "12017")
MONGO_DB = os.getenv("MONGO_DB", "centauraa")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "conversations")

if not MONGO_PASSWORD:
    raise ValueError("MONGO_PASSWORD environment variable must be set")

MONGO_URI = f"mongodb://{quote_plus(MONGO_USER)}:{quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}"

print(f"Connecting to MongoDB at {MONGO_HOST}:{MONGO_PORT}")
print(f"Database: {MONGO_DB}")
print(f"Collection: {MONGO_COLLECTION}")

client = MongoClient(MONGO_URI)
db = client[MONGO_DB]
collection = db[MONGO_COLLECTION]

print("✓ Connected to MongoDB")

# Count documents with _metadata field
count_with_metadata = collection.count_documents({"_metadata": {"$exists": True}})
print(f"Documents with _metadata field: {count_with_metadata}")

if count_with_metadata == 0:
    print("No documents with _metadata field found. Nothing to do.")
    client.close()
    exit(0)

# Remove _metadata field from all documents
print("Removing _metadata field from all documents...")
result = collection.update_many(
    {"_metadata": {"$exists": True}},
    {"$unset": {"_metadata": ""}}
)

print(f"✓ Modified {result.modified_count} documents")
print("Done!")

client.close()
