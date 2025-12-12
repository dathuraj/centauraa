#!/bin/bash

API_KEY="b5196cb8d5f0fae0d98899701e8aa6a9dfa6e3a5afaf8eb1f4a506fcff33edff"

echo "Querying Weaviate data..."
curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:8080/v1/objects?class=ConversationEmbedding&limit=5" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Total objects: {data[\"totalResults\"]}\n')
for obj in data['objects'][:5]:
    props = obj['properties']
    print(f'Speaker: {props[\"speaker\"]}')
    print(f'Conversation: {props[\"conversationId\"][:20]}...')
    print(f'Turn: {props[\"turnIndex\"]}')
    print(f'Text: {props[\"textChunk\"][:100]}...')
    print('-' * 80)
"
