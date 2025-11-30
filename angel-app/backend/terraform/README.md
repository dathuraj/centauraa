# Angel Backend - AWS EKS Terraform Infrastructure

This Terraform configuration deploys the Angel Backend application to AWS EKS with RDS PostgreSQL (with pgvector support) in a secure VPC architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                          AWS VPC                             │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │  Public Subnets      │    │  Private Subnets         │  │
│  │  (us-west-2a/2b)     │    │  (us-west-2a/2b)         │  │
│  │                      │    │                          │  │
│  │  ┌───────────────┐   │    │  ┌────────────────┐     │  │
│  │  │ EKS Nodes     │   │    │  │ RDS PostgreSQL │     │  │
│  │  │ (Backend Pods)│───┼────┼──│ (Private)      │     │  │
│  │  │               │   │    │  │ + pgvector     │     │  │
│  │  └───────────────┘   │    │  └────────────────┘     │  │
│  │         │            │    │                          │  │
│  │         │            │    │                          │  │
│  │  ┌──────▼──────┐    │    │                          │  │
│  │  │ ALB/NLB     │    │    │                          │  │
│  │  └─────────────┘    │    │                          │  │
│  └──────────────────────┘    └──────────────────────────┘  │
│           │                                                 │
│  ┌────────▼─────────┐         ┌──────────────────────┐    │
│  │ Internet Gateway │         │  NAT Gateway         │    │
│  └──────────────────┘         └──────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
           │                                  │
           ▼                                  ▼
       Internet                        AWS Services
    (API Traffic)                    (Secrets Manager)
```

## Features

- ✅ **VPC with Public & Private Subnets** across 2 AZs
- ✅ **EKS Cluster** with managed node group in public subnets
- ✅ **RDS PostgreSQL 18.1** with pgvector extension in private subnets
- ✅ **AWS Secrets Manager** for all sensitive data
- ✅ **Application Load Balancer** for external traffic
- ✅ **NAT Gateways** for private subnet internet access
- ✅ **CloudWatch** logs and monitoring
- ✅ **Performance Insights** for RDS
- ✅ **Auto-scaling** for EKS nodes and application pods
- ✅ **Multi-AZ** RDS for production

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.0
3. **kubectl** for Kubernetes management
4. **Docker image** of your backend pushed to a registry (ECR, Docker Hub, etc.)

## Directory Structure

```
terraform/
├── main.tf                 # Root configuration
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.tfvars        # Variable values (DO NOT commit secrets!)
├── modules/
│   ├── vpc/               # VPC, subnets, NAT gateways
│   ├── rds/               # RDS PostgreSQL with pgvector
│   ├── eks/               # EKS cluster and node groups
│   ├── secrets/           # AWS Secrets Manager
│   └── kubernetes/        # K8s deployments, services, ingress
└── README.md              # This file
```

## Quick Start

### 1. Store Secrets in AWS Secrets Manager

First, create secrets in AWS Secrets Manager:

```bash
# Database credentials
aws secretsmanager create-secret \
    --name angel-backend/dev/database \
    --secret-string '{
      "username": "angel_user",
      "password": "your-secure-password",
      "host": "",
      "port": "5432",
      "dbname": "angel_db"
    }'

# Application secrets
aws secretsmanager create-secret \
    --name angel-backend/dev/app-secrets \
    --secret-string '{
      "JWT_SECRET": "your-jwt-secret",
      "OPENAI_API_KEY": "sk-...",
      "GEMINI_API_KEY": "AIza...",
      "MAIL_USER": "your-email@gmail.com",
      "MAIL_PASS": "your-app-password"
    }'
```

### 2. Configure Terraform Variables

Create `terraform.tfvars`:

```hcl
# AWS Configuration
aws_region  = "us-east-1"
environment = "dev"

# VPC Configuration
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b"]
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24"]

# RDS Configuration
db_instance_class    = "db.t3.medium"
db_allocated_storage = 100

# EKS Configuration
eks_node_instance_types = ["t3.medium"]
eks_node_desired_size   = 2
eks_node_min_size       = 1
eks_node_max_size       = 4

# Application Configuration
container_image = "your-registry/angel-backend"
container_tag   = "latest"
app_replicas    = 2

# Secrets ARNs (from AWS Secrets Manager)
database_secret_arn = "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:angel-backend/dev/database-XXXXX"
app_secrets_arn     = "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:angel-backend/dev/app-secrets-XXXXX"
```

### 3. Initialize and Deploy

```bash
cd terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Deploy infrastructure
terraform apply

# Get kubeconfig for the EKS cluster
aws eks update-kubeconfig \
    --region us-east-1 \
    --name angel-backend-dev-eks
```

### 4. Verify Deployment

```bash
# Check nodes
kubectl get nodes

# Check pods
kubectl get pods -n angel-backend

# Check service
kubectl get svc -n angel-backend

# Check logs
kubectl logs -n angel-backend -l app=angel-backend --tail=100
```

### 5. Install pgvector Extension

After RDS is created, connect and enable pgvector:

```bash
# Get RDS endpoint from Terraform output
PGHOST=$(terraform output -raw db_address)

# Connect to database
psql -h $PGHOST -U angel_user -d angel_db

# Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

# Run your migrations
npm run migration:run
```

## Secrets Management

### Using AWS Secrets Manager

The application automatically loads secrets from AWS Secrets Manager using the External Secrets Operator.

**Secrets are stored in two Secret Manager entries:**

1. **Database Credentials**: `angel-backend/{environment}/database`
   - username
   - password
   - host (auto-populated after RDS creation)
   - port
   - dbname

2. **Application Secrets**: `angel-backend/{environment}/app-secrets`
   - JWT_SECRET
   - OPENAI_API_KEY
   - GEMINI_API_KEY
   - MAIL_USER
   - MAIL_PASS
   - GOOGLE_APPLICATION_CREDENTIALS (base64 encoded JSON)

### Updating Secrets

```bash
# Update database password
aws secretsmanager update-secret \
    --secret-id angel-backend/dev/database \
    --secret-string '{
      "username": "angel_user",
      "password": "new-secure-password",
      "host": "angel-backend-dev-db.xxxxx.us-east-1.rds.amazonaws.com",
      "port": "5432",
      "dbname": "angel_db"
    }'

# Restart pods to pick up new secrets
kubectl rollout restart deployment/angel-backend -n angel-backend
```

## Outputs

After deployment, Terraform outputs:

```hcl
vpc_id               # VPC ID
db_endpoint          # RDS endpoint (host:port)
eks_cluster_name     # EKS cluster name
eks_cluster_endpoint # EKS API endpoint
load_balancer_dns    # Application URL
```

## Cost Estimation

**Development Environment (~$200-300/month):**
- EKS Control Plane: ~$73/month
- EKS Nodes (2x t3.medium): ~$60/month
- RDS (db.t3.medium): ~$85/month
- NAT Gateway: ~$32/month
- Data Transfer: ~$10-20/month
- Load Balancer: ~$16/month

**Production Environment (~$500-800/month):**
- EKS Control Plane: ~$73/month
- EKS Nodes (3-4x t3.large): ~$200-300/month
- RDS (db.r6g.large, Multi-AZ): ~$250-350/month
- NAT Gateway: ~$64/month (2 AZs)
- Data Transfer: ~$50-100/month
- Load Balancer: ~$25/month

## Scaling

### Horizontal Pod Autoscaling

The application includes HPA configuration:

```yaml
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
targetMemoryUtilizationPercentage: 80
```

### Node Autoscaling

EKS Cluster Autoscaler is configured to scale nodes based on pod demands.

## Monitoring

### CloudWatch Dashboards

Access CloudWatch dashboards:
- EKS cluster metrics
- RDS performance insights
- Application logs

### Application Logs

```bash
# View application logs
kubectl logs -f -n angel-backend -l app=angel-backend

# View specific pod logs
kubectl logs -f -n angel-backend <pod-name>
```

## Disaster Recovery

### Database Backups

- **Automated Backups**: 7-day retention (configurable)
- **Manual Snapshots**: Create before major changes
- **Point-in-Time Recovery**: Enabled

```bash
# Create manual snapshot
aws rds create-db-snapshot \
    --db-instance-identifier angel-backend-dev-db \
    --db-snapshot-identifier angel-backend-manual-$(date +%Y%m%d)
```

### Application State

Application is stateless - all data is in RDS.

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will delete:
- EKS cluster and all applications
- RDS database (unless deletion protection is enabled)
- VPC and all networking
- CloudWatch logs (based on retention)

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n angel-backend

# Check events
kubectl get events -n angel-backend --sort-by='.lastTimestamp'
```

### Database connection issues

```bash
# Verify security group rules
aws ec2 describe-security-groups --group-ids <rds-sg-id>

# Test connection from pod
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
    psql -h <rds-endpoint> -U angel_user -d angel_db
```

### Secrets not loading

```bash
# Check External Secrets Operator
kubectl get externalsecrets -n angel-backend

# Check secret sync status
kubectl describe externalsecret angel-backend-secrets -n angel-backend
```

## Security Best Practices

1. ✅ **Private Subnets**: Database is NOT publicly accessible
2. ✅ **Security Groups**: Least-privilege access rules
3. ✅ **Secrets Manager**: No secrets in code or environment variables
4. ✅ **Encryption**: RDS storage encryption enabled
5. ✅ **TLS**: All traffic encrypted in transit
6. ✅ **IAM Roles**: IRSA for pod-level permissions
7. ✅ **Network Policies**: Pod-to-pod communication restricted

## Next Steps

1. Set up CI/CD pipeline (GitHub Actions, GitLab CI)
2. Configure Route53 for custom domain
3. Set up ACM certificates for HTTPS
4. Configure WAF for application protection
5. Set up CloudWatch alarms
6. Enable AWS Config for compliance
7. Set up backup automation
8. Configure disaster recovery plan

## Support

For issues or questions:
- Check Terraform logs: `terraform apply -debug`
- Check K8s events: `kubectl get events -A`
- Check application logs: `kubectl logs -n angel-backend -l app=angel-backend`

## License

Private - Angel Backend
