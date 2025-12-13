#!/usr/bin/env python3
"""
Quick script to check the schema of transcriptions collection
"""
import os
from pymongo import MongoClient
from urllib.parse import quote_plus
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

# MongoDB Config
MONGO_USER = os.getenv("MONGO_USER", "admin")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD")
MONGO_HOST = os.getenv("MONGO_HOST", "127.0.0.1")
MONGO_PORT = os.getenv("MONGO_PORT", "12017")
MONGO_DB = os.getenv("MONGO_DB", "backend_sweeten")

MONGO_URI = f"mongodb://{quote_plus(MONGO_USER)}:{quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}"

# Connect to MongoDB
client = MongoClient(MONGO_URI)
db = client[MONGO_DB]

# Check transcriptions collection
print("=== Transcriptions Collection ===")
transcriptions = db["transcriptions"]
count = transcriptions.count_documents({})
print(f"Total documents: {count}")

if count > 0:
    sample = transcriptions.find_one()
    print("\nSample document:")
    print(json.dumps(sample, indent=2, default=str))

client.close()
