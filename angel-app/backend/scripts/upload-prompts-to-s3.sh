#!/bin/bash

# Script to upload system prompts to S3
# Usage: ./scripts/upload-prompts-to-s3.sh <environment>
# Example: ./scripts/upload-prompts-to-s3.sh dev

set -e

ENVIRONMENT=${1:-dev}
PROJECT_NAME="angel-backend"
BUCKET_NAME="${PROJECT_NAME}-${ENVIRONMENT}-prompts"
SOURCE_FILE="src/prompts/angel-system-prompt.json"
S3_KEY="angel-system-prompt.json"

echo "============================================"
echo "Uploading System Prompts to S3"
echo "============================================"
echo "Environment: ${ENVIRONMENT}"
echo "Bucket: ${BUCKET_NAME}"
echo "Source: ${SOURCE_FILE}"
echo "S3 Key: ${S3_KEY}"
echo "============================================"

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file not found: ${SOURCE_FILE}"
    exit 1
fi

# Check if bucket exists
echo "Checking if bucket exists..."
if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "Error: Bucket does not exist: ${BUCKET_NAME}"
    echo "Please deploy the CloudFormation stack first:"
    echo "  cd cloudformation"
    echo "  ./deploy.sh ${ENVIRONMENT}"
    exit 1
fi

# Upload file to S3
echo "Uploading ${SOURCE_FILE} to s3://${BUCKET_NAME}/${S3_KEY}..."
aws s3 cp "${SOURCE_FILE}" "s3://${BUCKET_NAME}/${S3_KEY}" \
    --content-type "application/json" \
    --metadata "uploaded-at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "✓ Successfully uploaded prompts to S3"
echo ""
echo "To verify the upload, run:"
echo "  aws s3 ls s3://${BUCKET_NAME}/"
echo "  aws s3 cp s3://${BUCKET_NAME}/${S3_KEY} -"
echo ""
