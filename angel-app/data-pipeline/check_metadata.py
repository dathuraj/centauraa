#!/usr/bin/env python3
"""Check for _metadata field in centauraa.conversation collection"""
import os
from pymongo import MongoClient
from urllib.parse import quote_plus
from dotenv import load_dotenv
import json

load_dotenv()

MONGO_USER = os.getenv("MONGO_USER", "admin")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_HOST = os.getenv("MONGO_HOST", "127.0.0.1")
MONGO_PORT = os.getenv("MONGO_PORT", "12017")
MONGO_DB = os.getenv("MONGO_DB", "centauraa")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "conversation")

MONGO_URI = f"mongodb://{quote_plus(MONGO_USER)}:{quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}"

client = MongoClient(MONGO_URI)
db = client[MONGO_DB]
collection = db[MONGO_COLLECTION]

print(f"Database: {MONGO_DB}")
print(f"Collection: {MONGO_COLLECTION}")
print(f"Total documents: {collection.count_documents({})}")

# Get one document to inspect
doc = collection.find_one()
if doc:
    print("\nSample document keys:")
    for key in doc.keys():
        print(f"  - {key}")
    
    if "_metadata" in doc:
        print(f"\n_metadata field found: {json.dumps(doc['_metadata'], indent=2, default=str)}")
    else:
        print("\n_metadata field NOT found in sample document")

client.close()
