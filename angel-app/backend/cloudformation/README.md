# Angel Backend - ECS Fargate Deployment

This directory contains CloudFormation templates to deploy the Angel Backend application on AWS ECS Fargate.

## Architecture Overview

- **VPC**: Custom VPC with public and private subnets across 2 AZs
- **ECS Fargate**: Serverless container platform (no EC2 management)
- **RDS PostgreSQL**: Managed database for application data
- **Weaviate**: Vector database for RAG (Retrieval Augmented Generation)
- **Application Load Balancer**: Routes traffic to backend and Weaviate
- **Service Discovery**: Internal DNS for service-to-service communication
- **Auto Scaling**: Automatic scaling based on CPU/memory utilization

## Cost Estimate

**Development Environment (~$90/month)**:
- VPC: $0
- ECS Cluster: $0
- Backend (0.25 vCPU, 0.5GB): $4.51/month
- Weaviate (1 vCPU, 2GB): $36/month
- RDS (db.t4g.micro): $15/month
- ALB: $16.20/month
- EFS for Weaviate: $3/month
- VPC Endpoints: $14/month
- CloudWatch Logs: $5/month
- Data Transfer: $5/month

**Production Environment (~$165/month)**:
- Backend (0.5 vCPU, 1GB) x 2: $36/month
- Weaviate (1 vCPU, 2GB): $36/month
- RDS (db.t4g.small Multi-AZ): $60/month
- Other costs: ~$33/month

## Prerequisites

1. **AWS CLI** installed and configured
   ```bash
   aws --version
   aws configure
   ```

2. **Docker** installed (for building and pushing images)
   ```bash
   docker --version
   ```

3. **AWS Account** with sufficient permissions
   - CloudFormation
   - ECS, ECR
   - RDS, Secrets Manager
   - VPC, EC2, ELB
   - IAM (for creating roles)

## Deployment Steps

### Step 1: Create ECR Repository and Push Backend Image

```bash
# Set your AWS region
export AWS_REGION=us-west-2
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export PROJECT_NAME=angel-backend
export ENVIRONMENT=dev

# Create ECR repository
aws ecr create-repository \
  --repository-name ${PROJECT_NAME} \
  --region ${AWS_REGION}

# Build and push Docker image
cd ../  # Go to backend directory
docker build -t ${PROJECT_NAME}:latest .

# Login to ECR
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Tag and push
docker tag ${PROJECT_NAME}:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest

docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest
```

### Step 2: Create Parameters File

Create `parameters.json` with your configuration:

```json
{
  "ProjectName": "angel-backend",
  "Environment": "dev",
  "DBPassword": "your-secure-db-password",
  "JWTSecret": "your-jwt-secret-key",
  "OpenAIAPIKey": "sk-...",
  "GeminiAPIKey": "...",
  "MailUser": "your-email@example.com",
  "MailPass": "your-email-password",
  "WeaviateAPIKey": "your-weaviate-api-key",
  "BackendImage": "123456789012.dkr.ecr.us-west-2.amazonaws.com/angel-backend:latest"
}
```

### Step 3: Deploy CloudFormation Stacks

Use the provided deployment script:

```bash
cd cloudformation
chmod +x deploy.sh
./deploy.sh
```

Or deploy manually in order:

```bash
# 1. Deploy VPC
aws cloudformation create-stack \
  --stack-name angel-backend-dev-vpc \
  --template-body file://01-vpc.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=angel-backend \
    ParameterKey=Environment,ParameterValue=dev

# Wait for completion
aws cloudformation wait stack-create-complete \
  --stack-name angel-backend-dev-vpc

# 2. Deploy ECS Cluster
aws cloudformation create-stack \
  --stack-name angel-backend-dev-ecs-cluster \
  --template-body file://02-ecs-cluster.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=angel-backend \
    ParameterKey=Environment,ParameterValue=dev \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation wait stack-create-complete \
  --stack-name angel-backend-dev-ecs-cluster

# 3. Deploy RDS
aws cloudformation create-stack \
  --stack-name angel-backend-dev-rds \
  --template-body file://03-rds.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=angel-backend \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=DBPassword,ParameterValue=YOUR_DB_PASSWORD

aws cloudformation wait stack-create-complete \
  --stack-name angel-backend-dev-rds

# 4. Deploy ALB
aws cloudformation create-stack \
  --stack-name angel-backend-dev-alb \
  --template-body file://04-alb.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=angel-backend \
    ParameterKey=Environment,ParameterValue=dev

aws cloudformation wait stack-create-complete \
  --stack-name angel-backend-dev-alb

# 5. Deploy Weaviate Service
aws cloudformation create-stack \
  --stack-name angel-backend-dev-weaviate \
  --template-body file://05-weaviate-service.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=angel-backend \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=WeaviateAPIKey,ParameterValue=YOUR_WEAVIATE_KEY

aws cloudformation wait stack-create-complete \
  --stack-name angel-backend-dev-weaviate

# 6. Deploy Backend Service
aws cloudformation create-stack \
  --stack-name angel-backend-dev-backend \
  --template-body file://06-backend-service.yaml \
  --parameters \
    ParameterKey=ProjectName,ParameterValue=angel-backend \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=BackendImage,ParameterValue=YOUR_ECR_IMAGE_URI \
    ParameterKey=JWTSecret,ParameterValue=YOUR_JWT_SECRET \
    ParameterKey=OpenAIAPIKey,ParameterValue=YOUR_OPENAI_KEY \
    ParameterKey=GeminiAPIKey,ParameterValue=YOUR_GEMINI_KEY \
    ParameterKey=MailUser,ParameterValue=YOUR_MAIL_USER \
    ParameterKey=MailPass,ParameterValue=YOUR_MAIL_PASS \
    ParameterKey=WeaviateAPIKey,ParameterValue=YOUR_WEAVIATE_KEY

aws cloudformation wait stack-create-complete \
  --stack-name angel-backend-dev-backend
```

### Step 4: Get Application URL

```bash
aws cloudformation describe-stacks \
  --stack-name angel-backend-dev-alb \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBURL`].OutputValue' \
  --output text
```

### Step 5: Run Database Migrations

```bash
# SSH into a running backend task (via AWS Systems Manager Session Manager)
# Or use ECS Exec
aws ecs execute-command \
  --cluster angel-backend-dev-cluster \
  --task <TASK_ID> \
  --container backend \
  --interactive \
  --command "/bin/sh"

# Inside container, run migrations
npm run typeorm migration:run
```

## Updating the Application

### Update Backend Code

```bash
# Build new image
cd backend
docker build -t angel-backend:latest .

# Tag and push
docker tag angel-backend:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/angel-backend:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/angel-backend:latest

# Force new deployment
aws ecs update-service \
  --cluster angel-backend-dev-cluster \
  --service angel-backend-dev-backend \
  --force-new-deployment
```

### Update CloudFormation Stack

```bash
aws cloudformation update-stack \
  --stack-name angel-backend-dev-backend \
  --template-body file://06-backend-service.yaml \
  --parameters file://parameters.json \
  --capabilities CAPABILITY_NAMED_IAM
```

## Monitoring

### View Logs

```bash
# Backend logs
aws logs tail /ecs/angel-backend-dev/backend --follow

# Weaviate logs
aws logs tail /ecs/angel-backend-dev/weaviate --follow
```

### View ECS Service Status

```bash
aws ecs describe-services \
  --cluster angel-backend-dev-cluster \
  --services angel-backend-dev-backend
```

### CloudWatch Metrics

Navigate to CloudWatch Console:
- ECS Cluster metrics
- ALB metrics
- RDS metrics

## Cleanup

To delete all resources:

```bash
./cleanup.sh
```

Or manually:

```bash
# Delete in reverse order
aws cloudformation delete-stack --stack-name angel-backend-dev-backend
aws cloudformation delete-stack --stack-name angel-backend-dev-weaviate
aws cloudformation delete-stack --stack-name angel-backend-dev-alb
aws cloudformation delete-stack --stack-name angel-backend-dev-rds
aws cloudformation delete-stack --stack-name angel-backend-dev-ecs-cluster
aws cloudformation delete-stack --stack-name angel-backend-dev-vpc
```

## Troubleshooting

### Tasks Not Starting

1. Check task logs in CloudWatch
2. Verify security groups allow traffic
3. Check IAM role permissions
4. Ensure ECR image exists and is accessible

### Database Connection Issues

1. Check security group rules (RDS should allow ECS tasks)
2. Verify database credentials in Secrets Manager
3. Check VPC configuration

### High Costs

1. Enable Fargate Spot for non-production
2. Remove NAT Gateways (use VPC endpoints)
3. Reduce RDS instance size
4. Lower retention period for CloudWatch Logs

## Security Best Practices

1. **Rotate Secrets**: Regularly rotate database and API keys
2. **Enable WAF**: Add AWS WAF to ALB for production
3. **VPC Flow Logs**: Enable for network monitoring
4. **Encryption**: All data encrypted at rest and in transit
5. **IAM Least Privilege**: Review and minimize IAM permissions
6. **Multi-AZ**: Enable Multi-AZ for RDS in production

## Support

For issues or questions, refer to:
- AWS ECS Documentation: https://docs.aws.amazon.com/ecs/
- CloudFormation Documentation: https://docs.aws.amazon.com/cloudformation/
