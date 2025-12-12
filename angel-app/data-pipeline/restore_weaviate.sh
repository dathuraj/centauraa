#!/bin/bash
# Restore Weaviate Backup from S3

WEAVIATE_URL="${WEAVIATE_SCHEME:-http}://${WEAVIATE_HOST:-localhost:8080}"
BACKUP_ID="${1:-}"
S3_BUCKET="your-backup-bucket"

if [ -z "$BACKUP_ID" ]; then
  echo "Usage: ./restore_weaviate.sh <backup-id>"
  echo "Example: ./restore_weaviate.sh backup-20231201-143000"
  exit 1
fi

echo "Restoring backup: $BACKUP_ID"
echo "Weaviate URL: $WEAVIATE_URL"

# Restore backup
curl -X POST \
  "$WEAVIATE_URL/v1/backups/s3/$BACKUP_ID/restore" \
  -H "Content-Type: application/json" \
  -d "{
    \"include\": [\"ConversationEmbedding\"],
    \"backend\": \"s3\",
    \"config\": {
      \"bucket\": \"$S3_BUCKET\",
      \"path\": \"weaviate-backups/\"
    }
  }"

echo ""
echo "Checking restore status..."
sleep 2

# Check status
curl -X GET "$WEAVIATE_URL/v1/backups/s3/$BACKUP_ID/restore"

echo ""
echo "✅ Restore initiated: $BACKUP_ID"
