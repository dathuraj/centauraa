#!/usr/bin/env python3
"""Test Weaviate insert with v4 API"""
import weaviate
import os
from dotenv import load_dotenv

load_dotenv()

# Configuration
WEAVIATE_SCHEME = os.getenv("WEAVIATE_SCHEME", "http")
WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost:8080")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "")

print(f"Connecting to Weaviate at {WEAVIATE_SCHEME}://{WEAVIATE_HOST}")

# Connect
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
print("✓ Got ConversationEmbedding collection")

# Query total count
count_result = collection.aggregate.over_all()
print(f"✓ Total objects in collection: {count_result.total_count}")

# First, let's see all unique conversation IDs
print("\nFetching all conversation IDs...")
all_objects = collection.query.fetch_objects(limit=1000)
conversation_ids = set()
for obj in all_objects.objects:
    conv_id = obj.properties.get('conversationId')
    if conv_id:
        conversation_ids.add(conv_id)

print(f"\n{'='*80}")
print(f"FOUND {len(conversation_ids)} UNIQUE CONVERSATION IDs")
print(f"{'='*80}\n")
for conv_id in sorted(conversation_ids):
    print(f"  - {conv_id}")

# Now fetch specific conversation
target_conversation_id = conv_id
print(f"\n{'='*80}")
print(f"Fetching conversation: {target_conversation_id}...")
print(f"{'='*80}\n")

from weaviate.classes.query import Filter
result = collection.query.fetch_objects(
    filters=Filter.by_property("conversationId").equal(target_conversation_id),
    limit=100  # Get up to 100 entries for this conversation
)

print(f"\n{'='*80}")
print(f"CONVERSATION: {target_conversation_id}")
print(f"{'='*80}\n")

if len(result.objects) == 0:
    print("❌ No objects found for this conversation ID!")
else:
    # Sort by turn index for better readability
    sorted_objects = sorted(result.objects, key=lambda x: x.properties.get('turnIndex', 0))

    for i, obj in enumerate(sorted_objects, 1):
        print(f"#{i} UUID: {obj.uuid}")
        print(f"   Conversation ID: {obj.properties.get('conversationId', 'N/A')}")
        print(f"   Turn Index: {obj.properties.get('turnIndex', 'N/A')}")
        print(f"   Speaker: {obj.properties.get('speaker', 'N/A')}")
        print(f"   Timestamp: {obj.properties.get('timestamp', 'N/A')}")
        text_chunk = obj.properties.get('textChunk', 'N/A')
        print(f"   Text: {text_chunk}")
        print()

    print(f"{'='*80}")
    print(f"✅ Fetched {len(result.objects)} objects for this conversation!")

client.close()
