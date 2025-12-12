#!/bin/bash
# Weaviate Backup using S3 (requires Weaviate backup module enabled)

WEAVIATE_URL="${WEAVIATE_SCHEME:-http}://${WEAVIATE_HOST:-localhost:8080}"
BACKUP_ID="backup-$(date +%Y%m%d-%H%M%S)"
S3_BUCKET="your-backup-bucket"

echo "Creating backup: $BACKUP_ID"
echo "Weaviate URL: $WEAVIATE_URL"

# Create backup
curl -X POST \
  "$WEAVIATE_URL/v1/backups/s3" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$BACKUP_ID\",
    \"include\": [\"ConversationEmbedding\"],
    \"backend\": \"s3\",
    \"config\": {
      \"bucket\": \"$S3_BUCKET\",
      \"path\": \"weaviate-backups/\"
    }
  }"

echo ""
echo "Checking backup status..."
sleep 2

# Check status
curl -X GET "$WEAVIATE_URL/v1/backups/s3/$BACKUP_ID"

echo ""
echo "✅ Backup created: $BACKUP_ID"
echo "   Stored in S3: s3://$S3_BUCKET/weaviate-backups/"
