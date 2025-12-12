# Quick Start Guide - Angel Backend on ECS Fargate

Get your Angel Backend running on AWS ECS Fargate in under 15 minutes.

## Prerequisites

- AWS Account
- AWS CLI configured (`aws configure`)
- Docker installed
- 15 minutes

## Step-by-Step Deployment

### 1. Build and Push Docker Image (5 minutes)

```bash
# Set your AWS region and get account ID
export AWS_REGION=us-west-2
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export PROJECT_NAME=angel-backend

# Create ECR repository
aws ecr create-repository \
  --repository-name ${PROJECT_NAME} \
  --region ${AWS_REGION}

# Build Docker image
cd backend
docker build -t ${PROJECT_NAME}:latest .

# Login to ECR
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Tag and push
docker tag ${PROJECT_NAME}:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest

docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest

echo "Your image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest"
```

### 2. Configure Deployment (2 minutes)

```bash
cd cloudformation

# Copy example parameters
cp parameters.json.example parameters.json

# Edit parameters with your values
nano parameters.json
# or
vi parameters.json
```

**Required changes in `parameters.json`:**
```json
{
  "BackendImage": "YOUR_ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com/angel-backend:latest",
  "DBPassword": "YourSecurePassword123!",
  "JWTSecret": "your-random-jwt-secret-at-least-32-characters",
  "OpenAIAPIKey": "sk-your-openai-key",
  "GeminiAPIKey": "your-gemini-key",
  "MailUser": "your-email@example.com",
  "MailPass": "your-email-password",
  "WeaviateAPIKey": "your-weaviate-api-key"
}
```

### 3. Deploy Everything (8 minutes)

```bash
# Make script executable (if not already)
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will:
- ✅ Create VPC and networking (2 min)
- ✅ Create ECS cluster (1 min)
- ✅ Create RDS database (5 min)
- ✅ Create Application Load Balancer (1 min)
- ✅ Deploy Weaviate service (2 min)
- ✅ Deploy Backend service (2 min)

### 4. Test Your Deployment (1 minute)

```bash
# Get your application URL
ALB_URL=$(aws cloudformation describe-stacks \
  --stack-name angel-backend-dev-alb \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBURL`].OutputValue' \
  --output text \
  --region ${AWS_REGION})

echo "Your Backend: ${ALB_URL}"

# Test health endpoints
curl ${ALB_URL}/health
# Should return: {"status":"ok"}

curl ${ALB_URL}/v1/.well-known/ready
# Should return: {"status":"ok"}
```

### 5. Run Database Migrations (Optional)

If your application has database migrations:

```bash
# List running tasks
TASK_ARN=$(aws ecs list-tasks \
  --cluster angel-backend-dev-cluster \
  --service-name angel-backend-dev-backend \
  --query 'taskArns[0]' \
  --output text \
  --region ${AWS_REGION})

# Execute command in running task
aws ecs execute-command \
  --cluster angel-backend-dev-cluster \
  --task ${TASK_ARN} \
  --container backend \
  --interactive \
  --command "/bin/sh" \
  --region ${AWS_REGION}

# Inside the container:
npm run typeorm migration:run
exit
```

## What You've Deployed

### Infrastructure Created

1. **VPC** (10.0.0.0/16)
   - 2 Public subnets
   - 2 Private subnets
   - VPC Endpoints (ECR, Secrets Manager, CloudWatch)

2. **ECS Fargate Cluster**
   - Backend service (auto-scaling 1-4 tasks)
   - Weaviate service (1 task)

3. **RDS PostgreSQL**
   - db.t4g.micro instance
   - Automated backups (7 days)
   - Encrypted storage

4. **Application Load Balancer**
   - HTTP listener (port 80)
   - Backend target group
   - Weaviate target group

5. **EFS Volume**
   - Persistent storage for Weaviate data

### Cost Breakdown

**Monthly Cost: ~$117**
- ECS Cluster: $0 (no control plane cost!)
- Backend (0.5 vCPU, 1GB): $36
- Weaviate (1 vCPU, 2GB): $36
- RDS (db.t4g.micro): $15
- ALB: $16.20
- EFS: $3
- VPC Endpoints: $14
- CloudWatch Logs: $5

## Monitoring Your Application

### View Logs

```bash
# Backend logs
aws logs tail /ecs/angel-backend-dev/backend --follow --region ${AWS_REGION}

# Weaviate logs
aws logs tail /ecs/angel-backend-dev/weaviate --follow --region ${AWS_REGION}
```

### Check Service Status

```bash
# Backend service
aws ecs describe-services \
  --cluster angel-backend-dev-cluster \
  --services angel-backend-dev-backend \
  --region ${AWS_REGION}

# Weaviate service
aws ecs describe-services \
  --cluster angel-backend-dev-cluster \
  --services angel-backend-dev-weaviate \
  --region ${AWS_REGION}
```

### CloudWatch Dashboard

```bash
# Open in browser
echo "https://${AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards:"
```

## Updating Your Application

### Deploy New Code

```bash
# Build new image
cd backend
docker build -t angel-backend:latest .

# Push to ECR
docker tag angel-backend:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/angel-backend:latest
docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/angel-backend:latest

# Force new deployment (ECS will pull latest image)
aws ecs update-service \
  --cluster angel-backend-dev-cluster \
  --service angel-backend-dev-backend \
  --force-new-deployment \
  --region ${AWS_REGION}
```

### Update Configuration

```bash
# Edit parameters
vi cloudformation/parameters.json

# Redeploy
cd cloudformation
./deploy.sh
```

## Troubleshooting

### Tasks Not Starting

```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster angel-backend-dev-cluster \
  --tasks TASK_ID \
  --query 'tasks[0].stopppedReason' \
  --region ${AWS_REGION}

# Check logs
aws logs tail /ecs/angel-backend-dev/backend --since 10m --region ${AWS_REGION}
```

### Health Checks Failing

```bash
# Check ALB target health
aws elbv2 describe-target-health \
  --target-group-arn YOUR_TARGET_GROUP_ARN \
  --region ${AWS_REGION}

# Common fixes:
# 1. Adjust health check path in 04-alb.yaml
# 2. Increase health check grace period
# 3. Check security group rules
```

### Database Connection Errors

```bash
# Test database connectivity from ECS task
aws ecs execute-command \
  --cluster angel-backend-dev-cluster \
  --task TASK_ARN \
  --container backend \
  --interactive \
  --command "/bin/sh" \
  --region ${AWS_REGION}

# Inside container:
nc -zv $DB_HOST $DB_PORT
```

## Cleanup

When you're done testing:

```bash
cd cloudformation
./cleanup.sh
```

This will delete:
- All ECS services and tasks
- Load balancer
- RDS database (creates snapshot)
- VPC and all networking

**Cost after cleanup: $0** ✅

## Next Steps

1. **Set up CI/CD**: Automate deployments with GitHub Actions or AWS CodePipeline
2. **Add HTTPS**: Create ACM certificate and update ALB listener
3. **Custom Domain**: Set up Route 53 for your domain
4. **Monitoring**: Set up CloudWatch alarms for errors
5. **Backup Strategy**: Configure RDS snapshot schedule
6. **Production Config**: Enable Multi-AZ, increase resources

## Common Issues

### "Stack already exists"
```bash
# Update existing stack instead
aws cloudformation update-stack --stack-name STACK_NAME ...
```

### "No default VPC available"
The templates create a custom VPC, no default VPC needed.

### "Service discovery timeout"
Wait 2-3 minutes for DNS propagation after Weaviate service starts.

### "Task execution role error"
Ensure IAM permissions allow ECS to pull from ECR and access Secrets Manager.

## Get Help

- **CloudWatch Logs**: `/ecs/angel-backend-dev/backend`
- **Stack Events**: Check CloudFormation console for detailed errors
- **ECS Console**: View task status and errors
- **Cost Explorer**: Monitor actual costs

## Success Checklist

- [ ] Backend health endpoint returns 200 OK
- [ ] Weaviate health endpoint returns 200 OK
- [ ] Can create user account via API
- [ ] Database migrations completed
- [ ] Logs visible in CloudWatch
- [ ] Auto-scaling working (test with load)

Congratulations! Your Angel Backend is now running on AWS ECS Fargate! 🎉
