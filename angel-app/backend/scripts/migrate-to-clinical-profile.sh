#!/bin/bash
set -e

# Migration script for renaming conversationContext to clinicalProfile
# This should be run from within the ECS task or EC2 instance with RDS access

echo "================================================"
echo "Clinical Profile Migration"
echo "================================================"

# Get database credentials from environment or AWS Secrets Manager
if [ -z "$DATABASE_HOST" ]; then
  echo "Fetching credentials from AWS Secrets Manager..."
  SECRET=$(aws secretsmanager get-secret-value --secret-id angel-backend/dev/database --query SecretString --output text)

  export DATABASE_HOST=$(echo $SECRET | jq -r .host)
  export DATABASE_PORT=$(echo $SECRET | jq -r .port)
  export DATABASE_NAME=$(echo $SECRET | jq -r .dbname)
  export DATABASE_USER=$(echo $SECRET | jq -r .username)
  export DATABASE_PASSWORD=$(echo $SECRET | jq -r .password)
fi

echo "Database: $DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"
echo "User: $DATABASE_USER"
echo ""

# Run migration
echo "Running migration 1/2: Renaming conversationContext to clinicalProfile..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "ALTER TABLE \"user\" RENAME COLUMN \"conversationContext\" TO \"clinicalProfile\";" 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Migration 1/2 completed successfully"
else
  echo "⚠️  Migration 1/2 failed or column already renamed"
fi

echo ""
echo "Running migration 2/2: Renaming contextUpdatedAt to clinicalProfileUpdatedAt..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "ALTER TABLE \"user\" RENAME COLUMN \"contextUpdatedAt\" TO \"clinicalProfileUpdatedAt\";" 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Migration 2/2 completed successfully"
else
  echo "⚠️  Migration 2/2 failed or column already renamed"
fi

echo ""
echo "Verifying migration..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "\d \"user\"" | grep -E "clinicalProfile|conversationContext"

echo ""
echo "================================================"
echo "Migration completed!"
echo "================================================"
