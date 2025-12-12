#!/bin/bash

# Angel Backend ECS Fargate Deployment Script
# This script deploys all CloudFormation stacks in the correct order

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="angel-backend"
ENVIRONMENT="dev"
AWS_REGION=${AWS_REGION:-"us-west-2"}

echo -e "${GREEN}=== Angel Backend ECS Fargate Deployment ===${NC}\n"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if parameters file exists
if [ ! -f "parameters.json" ]; then
    echo -e "${YELLOW}Warning: parameters.json not found${NC}"
    echo "Creating template parameters.json..."

    cat > parameters.json <<EOF
{
  "ProjectName": "${PROJECT_NAME}",
  "Environment": "${ENVIRONMENT}",
  "DBPassword": "CHANGE_ME_SecurePassword123!",
  "JWTSecret": "CHANGE_ME_JWT_SECRET",
  "OpenAIAPIKey": "sk-CHANGE_ME",
  "GeminiAPIKey": "CHANGE_ME",
  "MailUser": "your-email@example.com",
  "MailPass": "CHANGE_ME",
  "WeaviateAPIKey": "CHANGE_ME_WEAVIATE_KEY",
  "BackendImage": "YOUR_ECR_REPO_URI"
}
EOF

    echo -e "${RED}Please edit parameters.json with your actual values and run again${NC}"
    exit 1
fi

# Function to create stack
create_stack() {
    local stack_name=$1
    local template_file=$2
    local parameters=$3
    local capabilities=$4

    echo -e "${YELLOW}Creating stack: ${stack_name}${NC}"

    if [ -z "$capabilities" ]; then
        aws cloudformation create-stack \
            --stack-name "${stack_name}" \
            --template-body "file://${template_file}" \
            --parameters ${parameters} \
            --region "${AWS_REGION}"
    else
        aws cloudformation create-stack \
            --stack-name "${stack_name}" \
            --template-body "file://${template_file}" \
            --parameters ${parameters} \
            --capabilities "${capabilities}" \
            --region "${AWS_REGION}"
    fi

    echo -e "${YELLOW}Waiting for stack creation to complete...${NC}"
    aws cloudformation wait stack-create-complete \
        --stack-name "${stack_name}" \
        --region "${AWS_REGION}"

    echo -e "${GREEN}✓ Stack ${stack_name} created successfully${NC}\n"
}

# Function to update stack (if exists)
update_or_create_stack() {
    local stack_name=$1
    local template_file=$2
    local parameters=$3
    local capabilities=$4

    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name "${stack_name}" --region "${AWS_REGION}" &> /dev/null; then
        echo -e "${YELLOW}Stack ${stack_name} already exists. Updating...${NC}"

        if [ -z "$capabilities" ]; then
            aws cloudformation update-stack \
                --stack-name "${stack_name}" \
                --template-body "file://${template_file}" \
                --parameters ${parameters} \
                --region "${AWS_REGION}" || true
        else
            aws cloudformation update-stack \
                --stack-name "${stack_name}" \
                --template-body "file://${template_file}" \
                --parameters ${parameters} \
                --capabilities "${capabilities}" \
                --region "${AWS_REGION}" || true
        fi

        echo -e "${GREEN}✓ Stack ${stack_name} update initiated${NC}\n"
    else
        create_stack "${stack_name}" "${template_file}" "${parameters}" "${capabilities}"
    fi
}

# Read parameters from JSON
DB_PASSWORD=$(jq -r '.DBPassword' parameters.json)
JWT_SECRET=$(jq -r '.JWTSecret' parameters.json)
OPENAI_API_KEY=$(jq -r '.OpenAIAPIKey' parameters.json)
GEMINI_API_KEY=$(jq -r '.GeminiAPIKey' parameters.json)
MAIL_USER=$(jq -r '.MailUser' parameters.json)
MAIL_PASS=$(jq -r '.MailPass' parameters.json)
WEAVIATE_API_KEY=$(jq -r '.WeaviateAPIKey' parameters.json)
BACKEND_IMAGE=$(jq -r '.BackendImage' parameters.json)

# Validate critical parameters
if [[ "$DB_PASSWORD" == *"CHANGE_ME"* ]] || [[ "$JWT_SECRET" == *"CHANGE_ME"* ]]; then
    echo -e "${RED}Error: Please update parameters.json with actual values${NC}"
    exit 1
fi

echo -e "${GREEN}Starting deployment...${NC}\n"

# 1. Deploy VPC
echo -e "${YELLOW}[1/6] Deploying VPC and Networking...${NC}"
update_or_create_stack \
    "${PROJECT_NAME}-${ENVIRONMENT}-vpc" \
    "01-vpc.yaml" \
    "ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} ParameterKey=Environment,ParameterValue=${ENVIRONMENT}"

# 2. Deploy ECS Cluster
echo -e "${YELLOW}[2/6] Deploying ECS Cluster...${NC}"
update_or_create_stack \
    "${PROJECT_NAME}-${ENVIRONMENT}-ecs-cluster" \
    "02-ecs-cluster.yaml" \
    "ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} ParameterKey=Environment,ParameterValue=${ENVIRONMENT}" \
    "CAPABILITY_NAMED_IAM"

# 3. Deploy RDS
echo -e "${YELLOW}[3/6] Deploying RDS PostgreSQL...${NC}"
update_or_create_stack \
    "${PROJECT_NAME}-${ENVIRONMENT}-rds" \
    "03-rds.yaml" \
    "ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} ParameterKey=Environment,ParameterValue=${ENVIRONMENT} ParameterKey=DBPassword,ParameterValue=${DB_PASSWORD}"

# 4. Deploy ALB
echo -e "${YELLOW}[4/6] Deploying Application Load Balancer...${NC}"
update_or_create_stack \
    "${PROJECT_NAME}-${ENVIRONMENT}-alb" \
    "04-alb.yaml" \
    "ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} ParameterKey=Environment,ParameterValue=${ENVIRONMENT}"

# 5. Deploy Weaviate
echo -e "${YELLOW}[5/6] Deploying Weaviate Service...${NC}"
update_or_create_stack \
    "${PROJECT_NAME}-${ENVIRONMENT}-weaviate" \
    "05-weaviate-service.yaml" \
    "ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} ParameterKey=Environment,ParameterValue=${ENVIRONMENT} ParameterKey=WeaviateAPIKey,ParameterValue=${WEAVIATE_API_KEY}"

# 6. Deploy Backend
echo -e "${YELLOW}[6/6] Deploying Backend Service...${NC}"
update_or_create_stack \
    "${PROJECT_NAME}-${ENVIRONMENT}-backend" \
    "06-backend-service.yaml" \
    "ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} ParameterKey=Environment,ParameterValue=${ENVIRONMENT} ParameterKey=BackendImage,ParameterValue=${BACKEND_IMAGE} ParameterKey=JWTSecret,ParameterValue=${JWT_SECRET} ParameterKey=OpenAIAPIKey,ParameterValue=${OPENAI_API_KEY} ParameterKey=GeminiAPIKey,ParameterValue=${GEMINI_API_KEY} ParameterKey=MailUser,ParameterValue=${MAIL_USER} ParameterKey=MailPass,ParameterValue=${MAIL_PASS} ParameterKey=WeaviateAPIKey,ParameterValue=${WEAVIATE_API_KEY}"

# Get ALB URL
echo -e "\n${GREEN}=== Deployment Complete! ===${NC}\n"

echo -e "${YELLOW}Getting Application Load Balancer URL...${NC}\n"

# Get ALB DNS name
ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name "${PROJECT_NAME}-${ENVIRONMENT}-alb" \
    --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
    --output text \
    --region "${AWS_REGION}")

if [ ! -z "$ALB_DNS" ]; then
    echo -e "${GREEN}✅ Backend URL: http://${ALB_DNS}${NC}"
    echo -e "${GREEN}✅ Health Check: http://${ALB_DNS}/health${NC}\n"
else
    echo -e "${YELLOW}⚠️  Could not retrieve ALB DNS. Check stack outputs:${NC}"
    echo -e "  aws cloudformation describe-stacks --stack-name ${PROJECT_NAME}-${ENVIRONMENT}-alb --region ${AWS_REGION}"
fi

echo -e "${YELLOW}Note: It may take 2-3 minutes for services to become healthy${NC}"
echo -e "${YELLOW}Backend is accessible via Application Load Balancer${NC}"
echo -e "${YELLOW}Weaviate is internal-only (accessible via service discovery)${NC}\n"

echo -e "${YELLOW}Check CloudWatch Logs for any issues:${NC}"
echo -e "  aws logs tail /ecs/${PROJECT_NAME}-${ENVIRONMENT}/backend --follow --region ${AWS_REGION}"
echo -e "  aws logs tail /ecs/${PROJECT_NAME}-${ENVIRONMENT}/weaviate --follow --region ${AWS_REGION}\n"
