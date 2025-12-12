#!/usr/bin/env python3
"""Export Weaviate data to JSON file"""
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
OUTPUT_FILE = "weaviate_backup.json"

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

# Get collection
collection = client.collections.get('ConversationEmbedding')

# Get total count
count_result = collection.aggregate.over_all()
total_count = count_result.total_count
print(f"✓ Found {total_count} objects to export")

# Export all objects
print(f"\nExporting to {OUTPUT_FILE}...")
exported_data = []

# Fetch in batches
batch_size = 1000
offset = 0

with tqdm(total=total_count) as pbar:
    while offset < total_count:
        result = collection.query.fetch_objects(
            limit=batch_size,
            offset=offset
        )

        for obj in result.objects:
            exported_data.append({
                'uuid': str(obj.uuid),
                'properties': obj.properties,
                'vector': obj.vector  # Include the embedding vector
            })

        offset += len(result.objects)
        pbar.update(len(result.objects))

        if len(result.objects) == 0:
            break

# Save to JSON file
with open(OUTPUT_FILE, 'w') as f:
    json.dump({
        'collection': 'ConversationEmbedding',
        'count': len(exported_data),
        'objects': exported_data
    }, f, indent=2)

print(f"\n✅ Exported {len(exported_data)} objects to {OUTPUT_FILE}")
print(f"   File size: {os.path.getsize(OUTPUT_FILE) / 1024 / 1024:.2f} MB")

client.close()
