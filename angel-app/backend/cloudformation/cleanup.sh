#!/bin/bash

# Angel Backend ECS Fargate Cleanup Script
# This script deletes all CloudFormation stacks in reverse order

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="angel-backend"
ENVIRONMENT="dev"
AWS_REGION=${AWS_REGION:-"us-west-2"}

echo -e "${RED}=== Angel Backend Cleanup ===${NC}\n"
echo -e "${YELLOW}WARNING: This will delete all resources!${NC}"
echo -e "${YELLOW}This includes databases, EFS volumes, and all data!${NC}\n"

read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo -e "\n${GREEN}Starting cleanup...${NC}\n"

# Function to delete stack
delete_stack() {
    local stack_name=$1

    echo -e "${YELLOW}Checking if stack exists: ${stack_name}${NC}"

    if aws cloudformation describe-stacks --stack-name "${stack_name}" --region "${AWS_REGION}" &> /dev/null; then
        echo -e "${YELLOW}Deleting stack: ${stack_name}${NC}"
        aws cloudformation delete-stack \
            --stack-name "${stack_name}" \
            --region "${AWS_REGION}"

        echo -e "${YELLOW}Waiting for stack deletion...${NC}"
        aws cloudformation wait stack-delete-complete \
            --stack-name "${stack_name}" \
            --region "${AWS_REGION}"

        echo -e "${GREEN}✓ Stack ${stack_name} deleted${NC}\n"
    else
        echo -e "${YELLOW}Stack ${stack_name} does not exist, skipping${NC}\n"
    fi
}

# Delete in reverse order
echo -e "${YELLOW}[1/6] Deleting Backend Service...${NC}"
delete_stack "${PROJECT_NAME}-${ENVIRONMENT}-backend"

echo -e "${YELLOW}[2/6] Deleting Weaviate Service...${NC}"
delete_stack "${PROJECT_NAME}-${ENVIRONMENT}-weaviate"

echo -e "${YELLOW}[3/6] Deleting Application Load Balancer...${NC}"
delete_stack "${PROJECT_NAME}-${ENVIRONMENT}-alb"

echo -e "${YELLOW}[4/6] Deleting RDS Database...${NC}"
delete_stack "${PROJECT_NAME}-${ENVIRONMENT}-rds"

echo -e "${YELLOW}[5/6] Deleting ECS Cluster...${NC}"
delete_stack "${PROJECT_NAME}-${ENVIRONMENT}-ecs-cluster"

echo -e "${YELLOW}[6/6] Deleting VPC...${NC}"
delete_stack "${PROJECT_NAME}-${ENVIRONMENT}-vpc"

# Cleanup ECR images (optional)
read -p "Do you want to delete ECR repository and images? (yes/no): " delete_ecr
if [ "$delete_ecr" == "yes" ]; then
    echo -e "${YELLOW}Deleting ECR repository...${NC}"
    aws ecr delete-repository \
        --repository-name "${PROJECT_NAME}" \
        --force \
        --region "${AWS_REGION}" 2>/dev/null || echo "ECR repository not found"
fi

echo -e "\n${GREEN}=== Cleanup Complete! ===${NC}\n"
echo -e "${GREEN}All resources have been deleted.${NC}\n"

# Note about manual cleanup
echo -e "${YELLOW}Note: The following may need manual cleanup:${NC}"
echo -e "  - CloudWatch Log Groups"
echo -e "  - Secrets Manager secrets"
echo -e "  - RDS snapshots (if retention was enabled)"
echo -e "  - EFS snapshots (if any were created)\n"
