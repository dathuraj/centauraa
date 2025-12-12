#!/usr/bin/env python3
"""Import Weaviate data from JSON file"""
import weaviate
import json
import os
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

# Configuration
WEAVIATE_SCHEME = os.getenv("WEAVIATE_SCHEME", "http")
WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost:8080")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "")
INPUT_FILE = "weaviate_backup.json"
BATCH_SIZE = 100

print(f"Connecting to Weaviate at {WEAVIATE_SCHEME}://{WEAVIATE_HOST}")

# Connect to Weaviate
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

print("✓ Connected to Weaviate")

# Load backup file
print(f"\nLoading {INPUT_FILE}...")
with open(INPUT_FILE, 'r') as f:
    backup_data = json.load(f)

total_objects = len(backup_data['objects'])
print(f"✓ Loaded {total_objects} objects from backup")

# Get collection
collection = client.collections.get('ConversationEmbedding')
print("✓ Got ConversationEmbedding collection")

# Import in batches
print(f"\nImporting {total_objects} objects...")
imported_count = 0
failed_count = 0

with collection.batch.dynamic() as batch:
    for obj in tqdm(backup_data['objects'], desc="Importing"):
        try:
            batch.add_object(
                properties=obj['properties'],
                vector=obj['vector'],
                # uuid=obj['uuid']  # Optionally preserve original UUID
            )
            imported_count += 1
        except Exception as e:
            print(f"\n⚠️  Failed to import object {obj.get('uuid', 'unknown')}: {e}")
            failed_count += 1

print(f"\n✅ Import complete!")
print(f"   Imported: {imported_count}")
print(f"   Failed: {failed_count}")

# Verify count
count_result = collection.aggregate.over_all()
print(f"   Total in Weaviate now: {count_result.total_count}")

client.close()
