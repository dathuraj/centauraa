#!/bin/bash
set -e

# Configuration
AWS_REGION=${AWS_REGION:-us-west-2}
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}
ECR_REPOSITORY=${ECR_REPOSITORY:-angel-backend}
IMAGE_TAG=${IMAGE_TAG:-$(git rev-parse --short HEAD)}

echo "================================================"
echo "Building and pushing Docker image"
echo "================================================"
echo "AWS Region: $AWS_REGION"
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "ECR Repository: $ECR_REPOSITORY"
echo "Image Tag: $IMAGE_TAG"
echo "================================================"

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Create ECR repository if it doesn't exist
echo "Ensuring ECR repository exists..."
aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION

# Build Docker image for AMD64 platform (required for AWS Fargate)
echo "Building Docker image for linux/amd64..."
docker build --platform linux/amd64 -t $ECR_REPOSITORY:$IMAGE_TAG -t $ECR_REPOSITORY:latest .

# Tag for ECR
echo "Tagging image for ECR..."
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
docker tag $ECR_REPOSITORY:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

# Push to ECR
echo "Pushing image to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

echo "================================================"
echo "✅ Image pushed successfully!"
echo "Image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
echo "================================================"

# Output for use in deployment
echo ""
echo "To deploy this image, use:"
echo "export CONTAINER_IMAGE=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY"
echo "export CONTAINER_TAG=$IMAGE_TAG"
