# RDS Migration Guide: Clinical Profile Schema Update

Since your RDS is in a private subnet, you need to run the migration from within AWS (ECS task or EC2 bastion).

## Option 1: Run via ECS Task (Recommended)

### Step 1: Get your ECS cluster and task definition

```bash
# List ECS clusters
aws ecs list-clusters

# List task definitions
aws ecs list-task-definitions | grep angel
```

### Step 2: Run migration as one-time ECS task

```bash
# First, get your cluster name and subnet IDs
CLUSTER_NAME="your-cluster-name"  # e.g., angel-backend-cluster
SUBNET_ID="your-private-subnet-id"  # Same subnet as RDS
SECURITY_GROUP="your-security-group-id"  # SG with RDS access

# Run the migration task
aws ecs run-task \
  --cluster $CLUSTER_NAME \
  --task-definition angel-backend:latest \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "angel-backend",
      "command": ["/bin/sh", "-c", "cd /app && ./scripts/migrate-to-clinical-profile.sh"]
    }]
  }'
```

### Step 3: Monitor the task

```bash
# Get task ARN from previous command output, then:
TASK_ARN="your-task-arn"

# Watch task logs
aws logs tail /ecs/angel-backend --follow --filter-pattern "Migration"
```

---

## Option 2: Run via EC2 Bastion Host

If you have an EC2 bastion host with RDS access:

```bash
# 1. Copy the script to the bastion
scp scripts/migrate-to-clinical-profile.sh ec2-user@your-bastion:/tmp/

# 2. SSH to bastion
ssh ec2-user@your-bastion

# 3. Install psql if not available
sudo yum install postgresql -y

# 4. Set environment variables
export DATABASE_HOST="angel-backend-dev-postgres.ctk0cm8egpuv.us-west-2.rds.amazonaws.com"
export DATABASE_PORT="5432"
export DATABASE_NAME="angel_db"
export DATABASE_USER="angel_user"
export DATABASE_PASSWORD="b8d58aa6a9dfa6e3a5afaf!"

# 5. Run migration
chmod +x /tmp/migrate-to-clinical-profile.sh
/tmp/migrate-to-clinical-profile.sh
```

---

## Option 3: Run via AWS Systems Manager Session

If your ECS tasks or EC2 instances have SSM enabled:

```bash
# 1. Find your ECS container instance or EC2 instance
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=*angel*" \
  --query "Reservations[].Instances[].InstanceId"

# 2. Start SSM session
INSTANCE_ID="your-instance-id"
aws ssm start-session --target $INSTANCE_ID

# 3. Once connected, run:
cd /app
./scripts/migrate-to-clinical-profile.sh
```

---

## Option 4: Include in Deployment

**Add to your Docker container startup:**

Update your `Dockerfile` or `docker-compose.yml` to run the migration on startup:

```dockerfile
# In your Dockerfile
COPY scripts/migrate-to-clinical-profile.sh /app/scripts/
RUN chmod +x /app/scripts/migrate-to-clinical-profile.sh

# Run on startup (before the main app)
CMD ["/bin/sh", "-c", "./scripts/migrate-to-clinical-profile.sh || true && npm run start:prod"]
```

**Or update your ECS task definition:**

```json
{
  "containerDefinitions": [{
    "name": "angel-backend",
    "entryPoint": ["/bin/sh", "-c"],
    "command": ["./scripts/migrate-to-clinical-profile.sh || true && npm run start:prod"]
  }]
}
```

---

## Verification

After running the migration, verify the schema change:

```bash
# Connect to RDS (from within AWS network)
PGPASSWORD='your-password' psql -h angel-backend-dev-postgres.ctk0cm8egpuv.us-west-2.rds.amazonaws.com -U angel_user -d angel_db

# Check columns
\d "user"

# Should see:
# - clinicalProfile (instead of conversationContext)
# - clinicalProfileUpdatedAt (instead of contextUpdatedAt)
```

---

## Rollback (if needed)

If you need to rollback the migration:

```sql
ALTER TABLE "user" RENAME COLUMN "clinicalProfile" TO "conversationContext";
ALTER TABLE "user" RENAME COLUMN "clinicalProfileUpdatedAt" TO "contextUpdatedAt";
```

---

## Quick Command Reference

**Find your ECS cluster:**
```bash
aws ecs list-clusters --query 'clusterArns[*]' --output table
```

**Find your subnets:**
```bash
aws ec2 describe-subnets --filters "Name=tag:Name,Values=*private*" --query 'Subnets[*].[SubnetId,CidrBlock,Tags[?Key==`Name`].Value|[0]]' --output table
```

**Find your security groups:**
```bash
aws ec2 describe-security-groups --filters "Name=group-name,Values=*rds*" --query 'SecurityGroups[*].[GroupId,GroupName]' --output table
```

---

## ✅ Recommended Approach

**Best practice:** Run the migration as part of your next deployment by adding it to the container startup command. This ensures it runs in the correct network context and has all necessary AWS credentials.

1. Update your ECS task definition to include the migration script
2. Deploy the new container
3. The migration will run automatically on startup
4. Future deployments will skip it (columns already renamed)
