# Angel Backend AWS Deployment Guide

This guide walks you through deploying the Angel Backend application to AWS using EKS, RDS PostgreSQL, and Weaviate vector database.

## Architecture Overview

- **EKS (Elastic Kubernetes Service)**: Container orchestration for the backend and Weaviate
- **RDS PostgreSQL**: Managed relational database for application data
- **Weaviate**: Vector database for RAG (Retrieval Augmented Generation) embeddings
- **AWS Secrets Manager**: Secure secret storage with External Secrets Operator
- **Application Load Balancer**: Managed load balancing with auto-provisioning via Ingress

## Prerequisites

1. **AWS CLI** (v2.x or later)
   ```bash
   aws --version
   ```

2. **kubectl** (v1.28 or later)
   ```bash
   kubectl version --client
   ```

3. **Terraform** (v1.0 or later)
   ```bash
   terraform version
   ```

4. **Docker** (for building images)
   ```bash
   docker --version
   ```

5. **AWS Account** with appropriate permissions:
   - VPC, EKS, RDS management
   - IAM role creation
   - Secrets Manager access
   - ECR repository access

## Step 1: Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, region, and output format
```

Verify credentials:
```bash
aws sts get-caller-identity
```

## Step 2: Build and Push Docker Image

1. Navigate to the backend directory:
   ```bash
   cd angel-app/backend
   ```

2. Set environment variables:
   ```bash
   export AWS_REGION=us-west-2
   export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   export ECR_REPOSITORY=angel-backend
   export IMAGE_TAG=$(git rev-parse --short HEAD)
   ```

3. Build and push the Docker image:
   ```bash
   ./scripts/build-and-push.sh
   ```

   This script will:
   - Log in to ECR
   - Create ECR repository if it doesn't exist
   - Build the Docker image
   - Tag and push to ECR

4. Note the image URL for the next step:
   ```
   <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/angel-backend:<IMAGE_TAG>
   ```

## Step 3: Configure Terraform Variables

1. Navigate to the terraform directory:
   ```bash
   cd terraform
   ```

2. Copy the example variables file:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

3. Edit `terraform.tfvars` with your specific values:
   ```hcl
   # AWS Configuration
   aws_region  = "us-west-2"
   environment = "dev"

   # Database Configuration
   db_name     = "angel_db"
   db_username = "angel_user"
   db_password = "YOUR_SECURE_DB_PASSWORD"

   # Application Configuration
   container_image = "<AWS_ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com/angel-backend"
   container_tag   = "<IMAGE_TAG>"

   # Secrets
   jwt_secret       = "YOUR_JWT_SECRET"
   openai_api_key   = "sk-..."
   gemini_api_key   = "AIza..."
   mail_user        = "your-email@gmail.com"
   mail_pass        = "your-app-password"
   weaviate_api_key = "your-weaviate-api-key"
   ```

   **Generate secure secrets**:
   ```bash
   # JWT Secret (256-bit)
   openssl rand -hex 32

   # Weaviate API Key (256-bit)
   openssl rand -hex 32
   ```

## Step 4: Deploy Infrastructure

### Option A: Automated Deployment (Recommended)

Run the automated deployment script:
```bash
cd ..  # Back to backend directory
./scripts/deploy.sh
```

This script will:
1. Deploy infrastructure with Terraform
2. Configure kubectl for EKS
3. Deploy Weaviate
4. Verify secrets synchronization
5. Run database migrations
6. Check application status
7. Display the application URL

### Option B: Manual Deployment

1. **Initialize Terraform**:
   ```bash
   cd terraform
   terraform init
   ```

2. **Review the plan**:
   ```bash
   terraform plan
   ```

3. **Apply the configuration**:
   ```bash
   terraform apply
   ```
   Type `yes` when prompted.

4. **Configure kubectl**:
   ```bash
   aws eks update-kubeconfig --region us-west-2 --name $(terraform output -raw eks_cluster_name)
   ```

5. **Deploy Weaviate**:
   ```bash
   cd ..
   kubectl apply -f k8s/weaviate-deployment.yaml
   ```

6. **Verify secrets**:
   ```bash
   kubectl get externalsecrets -n angel-backend
   kubectl get secrets -n angel-backend
   ```

7. **Run database migrations**:
   ```bash
   CONTAINER_IMAGE=$(cd terraform && terraform output -raw container_image)
   CONTAINER_TAG=$(cd terraform && terraform output -raw container_tag)
   kubectl create job migration --image="${CONTAINER_IMAGE}:${CONTAINER_TAG}" -n angel-backend -- npm run migration:run
   ```

8. **Check application status**:
   ```bash
   kubectl get pods -n angel-backend
   kubectl get ingress -n angel-backend
   ```

## Step 5: Verify Deployment

1. **Check all pods are running**:
   ```bash
   kubectl get pods -n angel-backend
   ```

   Expected output:
   ```
   NAME                             READY   STATUS    RESTARTS   AGE
   angel-backend-xxxxxxxxxx-xxxxx   1/1     Running   0          2m
   angel-backend-xxxxxxxxxx-xxxxx   1/1     Running   0          2m
   weaviate-xxxxxxxxxx-xxxxx        1/1     Running   0          3m
   ```

2. **Check application logs**:
   ```bash
   kubectl logs -f -n angel-backend -l app=angel-backend
   ```

3. **Check Weaviate logs**:
   ```bash
   kubectl logs -f -n angel-backend -l app=weaviate
   ```

4. **Get the application URL**:
   ```bash
   kubectl get ingress -n angel-backend
   ```

   The ALB may take 3-5 minutes to provision and become available.

5. **Test the health endpoint**:
   ```bash
   INGRESS_URL=$(kubectl get ingress -n angel-backend -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}')
   curl http://$INGRESS_URL/health
   ```

## Configuration Details

### Environment Variables

The application uses the following environment variables (automatically configured):

**Database**:
- `DB_HOST`: RDS endpoint
- `DB_PORT`: 5432
- `DB_NAME`: Database name
- `DB_USERNAME`: From Secrets Manager
- `DB_PASSWORD`: From Secrets Manager

**AI/RAG**:
- `OPENAI_API_KEY`: From Secrets Manager
- `GEMINI_API_KEY`: From Secrets Manager
- `ENABLE_RAG`: true
- `RAG_LIMIT`: 5
- `RAG_SIMILARITY_THRESHOLD`: 0.7

**Weaviate**:
- `WEAVIATE_SCHEME`: http
- `WEAVIATE_HOST`: weaviate.angel-backend.svc.cluster.local:8080
- `WEAVIATE_API_KEY_ALLOWED_KEYS`: From Secrets Manager

**Authentication**:
- `JWT_SECRET`: From Secrets Manager

**Email**:
- `MAIL_USER`: From Secrets Manager
- `MAIL_PASS`: From Secrets Manager

### Resource Limits

**Backend Application**:
- Requests: 500m CPU, 512Mi memory
- Limits: 1000m CPU, 1Gi memory
- Replicas: 2 (autoscales based on CPU/memory)

**Weaviate**:
- Requests: 500m CPU, 2Gi memory
- Limits: 2000m CPU, 4Gi memory
- Storage: 50Gi (gp3)

**RDS PostgreSQL**:
- Instance: db.t3.medium
- Storage: 100Gi

## Scaling

### Horizontal Pod Autoscaling

The backend automatically scales between 1-10 replicas based on:
- CPU utilization > 70%
- Memory utilization > 80%

Check HPA status:
```bash
kubectl get hpa -n angel-backend
```

### Manual Scaling

Scale backend replicas:
```bash
kubectl scale deployment angel-backend -n angel-backend --replicas=3
```

## Monitoring and Troubleshooting

### View Logs

**Application logs**:
```bash
kubectl logs -f -n angel-backend -l app=angel-backend
```

**Weaviate logs**:
```bash
kubectl logs -f -n angel-backend -l app=weaviate
```

**Specific pod**:
```bash
kubectl logs -f -n angel-backend <pod-name>
```

### Debug Pods

**Execute commands in a pod**:
```bash
kubectl exec -it -n angel-backend <pod-name> -- /bin/sh
```

**Check pod events**:
```bash
kubectl describe pod -n angel-backend <pod-name>
```

### Common Issues

1. **Pods not starting**: Check secrets are synced
   ```bash
   kubectl get externalsecrets -n angel-backend
   kubectl describe externalsecret -n angel-backend <secret-name>
   ```

2. **Database connection failed**: Verify RDS security group allows EKS nodes
   ```bash
   aws ec2 describe-security-groups --group-ids <rds-sg-id>
   ```

3. **Weaviate not accessible**: Check service and pod status
   ```bash
   kubectl get svc,pod -n angel-backend -l app=weaviate
   ```

4. **Load balancer not provisioned**: Check AWS Load Balancer Controller
   ```bash
   kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
   ```

## Updating the Application

1. **Build and push new image**:
   ```bash
   export IMAGE_TAG=$(git rev-parse --short HEAD)
   ./scripts/build-and-push.sh
   ```

2. **Update Terraform variables**:
   ```bash
   cd terraform
   # Edit terraform.tfvars with new container_tag
   ```

3. **Apply changes**:
   ```bash
   terraform apply
   ```

4. **Verify rollout**:
   ```bash
   kubectl rollout status deployment/angel-backend -n angel-backend
   ```

## Teardown

To destroy all resources:

```bash
cd terraform
terraform destroy
```

**Warning**: This will delete:
- EKS cluster and all workloads
- RDS database (backup recommended)
- VPC and networking
- All secrets in Secrets Manager
- Load balancers

## Cost Optimization

- Use Spot Instances for EKS nodes (update node group configuration)
- Enable RDS automated backups with retention policy
- Use smaller instance types for dev/staging environments
- Set up AWS Budgets for cost alerting

## Security Best Practices

1. **Rotate secrets regularly** via AWS Secrets Manager
2. **Enable RDS encryption** at rest
3. **Use private subnets** for RDS and EKS nodes
4. **Restrict security groups** to minimum required access
5. **Enable AWS CloudTrail** for audit logging
6. **Use IAM roles** instead of access keys where possible

## Support

For issues or questions:
- Check the [troubleshooting guide](#monitoring-and-troubleshooting)
- Review Kubernetes events: `kubectl get events -n angel-backend`
- Check application logs
- Review AWS CloudWatch logs for infrastructure issues
