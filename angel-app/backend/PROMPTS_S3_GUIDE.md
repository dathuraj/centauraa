# S3-Based Prompts System

This guide explains how to use the S3-based system prompts feature for the Angel backend application.

## Overview

The Angel backend now supports loading system prompts from Amazon S3, allowing for dynamic prompt updates without redeploying the application. The system automatically falls back to local prompts if S3 is not configured.

## Architecture

- **S3 Bucket**: Stores the `angel-system-prompt.json` file
- **PromptsService**: Loads prompts from S3 on application startup
- **Lambda Function**: Automatically restarts ECS service when prompts are updated in S3
- **S3 Event Notification**: Triggers Lambda function on file upload
- **Fallback**: Uses local `src/prompts/angel-system-prompt.json` if S3 is unavailable

## Setup Instructions

### 1. Deploy the S3 Bucket (CloudFormation)

First, deploy the prompts S3 bucket using CloudFormation:

```bash
cd cloudformation

# Deploy the S3 bucket stack
aws cloudformation create-stack \
  --stack-name angel-backend-dev-prompts \
  --template-body file://07-prompts-s3.yaml \
  --parameters ParameterKey=ProjectName,ParameterValue=angel-backend \
               ParameterKey=Environment,ParameterValue=dev \
  --capabilities CAPABILITY_NAMED_IAM
```

Or update the main deployment script to include this stack.

### 2. Upload Prompts to S3

Use the provided script to upload the system prompts:

```bash
cd backend

# Upload prompts for dev environment
./scripts/upload-prompts-to-s3.sh dev

# Upload prompts for production environment
./scripts/upload-prompts-to-s3.sh prod
```

### 3. Deploy/Update Backend Service

The backend service (06-backend-service.yaml) has been updated to include these environment variables:

- `PROMPTS_S3_BUCKET`: Name of the S3 bucket
- `PROMPTS_S3_KEY`: S3 key for the prompts file (default: `angel-system-prompt.json`)
- `AWS_REGION`: AWS region for S3 access

Redeploy the backend service if it's already running:

```bash
cd cloudformation
./deploy.sh dev
```

### 4. Install AWS SDK Dependency

Install the required AWS SDK package:

```bash
cd backend
npm install
```

## Configuration

### Environment Variables

The following environment variables control the prompts loading:

| Variable | Description | Default |
|----------|-------------|---------|
| `PROMPTS_S3_BUCKET` | S3 bucket name for prompts | (empty - uses local file) |
| `PROMPTS_S3_KEY` | S3 key for prompts JSON | `angel-system-prompt.json` |
| `AWS_REGION` | AWS region for S3 | `us-east-1` |

### Fallback Behavior

If the S3 bucket is not configured or if loading from S3 fails, the application will automatically fall back to the local prompts file at `src/prompts/angel-system-prompt.json`.

## Prompt File Format

The prompts JSON file must have the following structure:

```json
{
  "angelCoreGuidelines": "You are a conversational companion...",
  "angelRoleDescription": "You are Angel, a compassionate and supportive AI...",
  "ragInstruction": "\nIMPORTANT: Use the relevant context..."
}
```

## Usage

### Automatic Service Restart on Prompt Updates

When you upload new prompts to S3, the system automatically restarts the ECS service to load the new prompts:

1. **Upload prompts to S3**:
   ```bash
   ./scripts/upload-prompts-to-s3.sh dev
   ```

2. **S3 triggers Lambda function**: The S3 event notification automatically invokes the Lambda function

3. **Lambda restarts ECS service**: The Lambda function forces a new deployment of the ECS service

4. **ECS loads new prompts**: The new tasks start and load the updated prompts from S3

**Note**: The restart process takes 1-2 minutes. During this time, the old tasks continue serving requests until the new tasks are healthy.

### Monitor Auto-Restart

To monitor the auto-restart process:

```bash
# Watch Lambda function logs
aws logs tail /aws/lambda/angel-backend-dev-restart-ecs-service --follow

# Watch ECS service deployment
aws ecs describe-services \
  --cluster angel-backend-dev-cluster \
  --services angel-backend-dev-backend \
  --query 'services[0].deployments'
```

### Manual Hot-Reloading (Alternative)

The PromptsService includes a `reloadPrompts()` method for hot-reloading prompts without restarting the application. You can add an admin endpoint to trigger this:

```typescript
// In a controller
@Post('admin/reload-prompts')
async reloadPrompts() {
  await this.promptsService.reloadPrompts();
  return { message: 'Prompts reloaded successfully' };
}
```

**Note**: The automatic restart approach is preferred as it ensures all tasks load the new prompts consistently.

### Verifying S3 Upload

To verify that prompts are properly uploaded:

```bash
# List files in the bucket
aws s3 ls s3://angel-backend-dev-prompts/

# Download and view the prompts
aws s3 cp s3://angel-backend-dev-prompts/angel-system-prompt.json -
```

## Troubleshooting

### Auto-Restart Not Working

If the service doesn't restart after uploading prompts:

1. **Check Lambda function logs**:
   ```bash
   aws logs tail /aws/lambda/angel-backend-dev-restart-ecs-service --follow
   ```

2. **Verify S3 event notification**:
   ```bash
   aws s3api get-bucket-notification-configuration \
     --bucket angel-backend-dev-prompts
   ```

3. **Check Lambda permissions**:
   ```bash
   aws lambda get-policy \
     --function-name angel-backend-dev-restart-ecs-service
   ```

4. **Manually trigger Lambda**:
   ```bash
   aws lambda invoke \
     --function-name angel-backend-dev-restart-ecs-service \
     --payload '{"Records":[{"eventName":"ObjectCreated:Put","s3":{"bucket":{"name":"angel-backend-dev-prompts"},"object":{"key":"angel-system-prompt.json"}}}]}' \
     response.json
   ```

### Prompts Not Loading from S3

Check the application logs:

```bash
# ECS logs will show:
# "PromptsService initialized with S3: bucket=angel-backend-dev-prompts..."
# "Successfully loaded prompts from S3"

# Or if falling back:
# "Failed to load prompts from S3, falling back to local file"
```

### IAM Permissions

**ECS Task Role** must have the following permissions (already configured in 02-ecs-cluster.yaml):

```yaml
- Effect: Allow
  Action:
    - s3:GetObject
    - s3:PutObject
  Resource:
    - !Sub 'arn:aws:s3:::${ProjectName}-${Environment}-*/*'
```

**Lambda Execution Role** must have the following permissions (already configured in 08-prompts-lambda.yaml):

```yaml
- Effect: Allow
  Action:
    - ecs:UpdateService
    - ecs:DescribeServices
    - ecs:DescribeClusters
  Resource:
    - ECS Cluster ARN
    - ECS Service ARN
```

### Local Development

For local development without S3:

1. Don't set the `PROMPTS_S3_BUCKET` environment variable
2. The application will automatically use the local prompts file
3. Edit `src/prompts/angel-system-prompt.json` directly

## Benefits

1. **Dynamic Updates**: Update prompts without redeploying the application
2. **Automatic Restart**: Lambda function automatically restarts ECS service when prompts change
3. **Zero Downtime**: Rolling deployment ensures continuous availability during restart
4. **Version Control**: S3 versioning is enabled for rollback capability
5. **Environment Separation**: Different prompts per environment (dev/staging/prod)
6. **Fallback Safety**: Automatically uses local prompts if S3 is unavailable
7. **Centralized Management**: Single source of truth for prompts across multiple instances
8. **Audit Trail**: CloudWatch logs track all prompt updates and service restarts

## Security

- Bucket is private with public access blocked
- Server-side encryption (AES256) enabled
- Only ECS Task Role has read access
- Versioning enabled for audit trail
