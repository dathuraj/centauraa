#!/bin/bash
set -e

echo "================================================"
echo "Running RDS Migration via ECS Task"
echo "================================================"

# Your AWS configuration
CLUSTER_NAME="angel-backend-dev-cluster"
TASK_DEFINITION="angel-backend-dev-backend:15"
SUBNETS="subnet-05c68a53a088818eb,subnet-0551177cf1e89ca62"
SECURITY_GROUP="sg-02088c655fdee8a3c"

echo "Cluster: $CLUSTER_NAME"
echo "Task Definition: $TASK_DEFINITION"
echo "Subnets: $SUBNETS"
echo "Security Group: $SECURITY_GROUP"
echo ""

# Run the migration as an ECS task
echo "Starting ECS task to run migration..."
TASK_ARN=$(aws ecs run-task \
  --cluster $CLUSTER_NAME \
  --task-definition $TASK_DEFINITION \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "backend",
      "command": ["/bin/sh", "-c", "apk add --no-cache postgresql-client jq && cd /app && ./scripts/migrate-to-clinical-profile.sh"]
    }]
  }' \
  --query 'tasks[0].taskArn' \
  --output text)

if [ -z "$TASK_ARN" ]; then
  echo "❌ Failed to start ECS task"
  exit 1
fi

echo "✅ Task started successfully!"
echo "Task ARN: $TASK_ARN"
echo ""

# Wait for task to complete
echo "Waiting for task to complete (this may take 1-2 minutes)..."
aws ecs wait tasks-stopped --cluster $CLUSTER_NAME --tasks $TASK_ARN

# Check task exit code
EXIT_CODE=$(aws ecs describe-tasks \
  --cluster $CLUSTER_NAME \
  --tasks $TASK_ARN \
  --query 'tasks[0].containers[0].exitCode' \
  --output text)

echo ""
echo "================================================"
if [ "$EXIT_CODE" = "0" ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed with exit code: $EXIT_CODE"
  echo ""
  echo "Check CloudWatch logs for details:"
  echo "aws logs tail /ecs/angel-backend --follow"
fi
echo "================================================"

# Show task logs
echo ""
echo "Task logs (last 20 lines):"
aws logs tail /ecs/angel-backend --since 5m | tail -20
