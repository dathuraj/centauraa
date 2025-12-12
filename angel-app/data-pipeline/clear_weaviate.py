#!/usr/bin/env python3
"""Clear the ConversationEmbedding collection in Weaviate"""
import os
import weaviate
from dotenv import load_dotenv

load_dotenv()

WEAVIATE_SCHEME = os.getenv("WEAVIATE_SCHEME", "http")
WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost:8080")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "")

print(f"Connecting to Weaviate at {WEAVIATE_SCHEME}://{WEAVIATE_HOST}")

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

# Delete the collection
if client.collections.exists('ConversationEmbedding'):
    print("Deleting ConversationEmbedding collection...")
    client.collections.delete('ConversationEmbedding')
    print("✓ Collection deleted")
else:
    print("⚠ Collection does not exist")

client.close()
print("Done!")
