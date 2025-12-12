# Migration Guide: EKS to ECS Fargate

This document outlines the changes made during the migration from EKS (Kubernetes) to ECS Fargate.

## Summary of Changes

### What Changed

| Component | Before (EKS) | After (ECS Fargate) |
|-----------|-------------|---------------------|
| **Orchestration** | Kubernetes on EKS | ECS Fargate |
| **Configuration Format** | Terraform + K8s YAML | CloudFormation YAML |
| **Control Plane Cost** | $73/month | $0/month ✅ |
| **Compute** | EC2 nodes or Fargate | Fargate only |
| **Service Discovery** | CoreDNS | AWS Cloud Map |
| **Load Balancer** | AWS LB Controller + ALB | Native ALB integration |
| **Secrets** | External Secrets Operator | Native Secrets Manager integration |
| **Auto-scaling** | HPA (Horizontal Pod Autoscaler) | ECS Service Auto Scaling |

### What Stayed the Same

- ✅ VPC configuration (reused)
- ✅ RDS PostgreSQL database
- ✅ Weaviate vector database
- ✅ Application Load Balancer
- ✅ Docker containers (no code changes needed)
- ✅ Environment variables and secrets

## Cost Comparison

### EKS Setup (Previous)
```
EKS Control Plane:         $73.00/month
Backend (0.5 vCPU, 1GB):   $36.00/month
Weaviate (1 vCPU, 2GB):    $36.00/month
RDS (db.t4g.micro):        $15.00/month
ALB:                       $16.20/month
NAT Gateway:               $32.40/month
─────────────────────────────────────
TOTAL:                     $208.60/month
```

### ECS Fargate Setup (Current)
```
ECS Control Plane:         $0.00/month ✅
Backend (0.5 vCPU, 1GB):   $36.00/month
Weaviate (1 vCPU, 2GB):    $36.00/month
RDS (db.t4g.micro):        $15.00/month
ALB:                       $16.20/month
VPC Endpoints:             $14.00/month (replaces NAT)
─────────────────────────────────────
TOTAL:                     $117.20/month ✅

SAVINGS:                   $91.40/month (44% cheaper!)
```

## Architecture Comparison

### Before: EKS Architecture
```
Internet → ALB → EKS Ingress Controller → K8s Services → Pods
                                              ↓
                                         ConfigMaps/Secrets
                                              ↓
                                     External Secrets Operator
                                              ↓
                                       Secrets Manager
```

### After: ECS Fargate Architecture
```
Internet → ALB → ECS Services → Fargate Tasks
                                      ↓
                              Secrets Manager
                              (direct integration)
```

## File Structure

### New Files Created
```
backend/cloudformation/
├── 01-vpc.yaml                    # VPC with VPC endpoints (no NAT Gateway)
├── 02-ecs-cluster.yaml           # ECS cluster, IAM roles, service discovery
├── 03-rds.yaml                   # PostgreSQL database
├── 04-alb.yaml                   # Application Load Balancer
├── 05-weaviate-service.yaml      # Weaviate ECS service with EFS
├── 06-backend-service.yaml       # Backend ECS service with auto-scaling
├── deploy.sh                     # Automated deployment script
├── cleanup.sh                    # Cleanup script
├── parameters.json.example       # Configuration template
├── README.md                     # Deployment guide
└── MIGRATION_GUIDE.md           # This file
```

### Deprecated Files (Can be removed)
```
backend/terraform/
├── modules/eks/                  # ❌ No longer needed
├── modules/kubernetes/           # ❌ No longer needed
└── main.tf                       # ❌ Replace with CloudFormation

backend/k8s/
└── weaviate-deployment.yaml      # ❌ Replaced by CloudFormation
```

## Key Differences

### 1. Service Discovery

**EKS/Kubernetes:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: weaviate
  namespace: angel-backend
spec:
  selector:
    app: weaviate
```
Access via: `weaviate.angel-backend.svc.cluster.local`

**ECS Fargate:**
```yaml
ServiceDiscoveryNamespace:
  Type: AWS::ServiceDiscovery::PrivateDnsNamespace
  Properties:
    Name: angel-backend-dev.local
```
Access via: `weaviate.angel-backend-dev.local`

### 2. Secrets Management

**EKS:**
- Required External Secrets Operator
- K8s secrets synced from Secrets Manager
- IRSA for pod-level IAM

**ECS:**
- Native Secrets Manager integration
- Secrets injected as environment variables
- Task execution role has direct access

### 3. Networking

**EKS:**
- Required NAT Gateway ($32/month)
- Pods get IPs from pod CIDR
- Multiple security groups per pod

**ECS:**
- VPC Endpoints replace NAT ($14/month)
- Tasks get IPs from subnet CIDR
- Task-level security groups

### 4. Auto-scaling

**EKS:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 1
  maxReplicas: 4
```

**ECS:**
```yaml
BackendScalableTarget:
  Type: AWS::ApplicationAutoScaling::ScalableTarget
  Properties:
    MinCapacity: 1
    MaxCapacity: 4
    ResourceId: !Sub 'service/${ClusterName}/${ServiceName}'
```

## Migration Steps

### Phase 1: Preparation (Done ✅)

- [x] Created CloudFormation templates
- [x] Mapped K8s resources to ECS equivalents
- [x] Configured VPC endpoints (cost optimization)
- [x] Set up service discovery
- [x] Created deployment scripts

### Phase 2: Deployment (Your Turn)

1. **Build and push Docker image to ECR**
   ```bash
   cd backend
   ./cloudformation/deploy.sh
   ```

2. **Configure parameters**
   ```bash
   cp cloudformation/parameters.json.example cloudformation/parameters.json
   # Edit parameters.json with your values
   ```

3. **Deploy infrastructure**
   ```bash
   cd cloudformation
   ./deploy.sh
   ```

4. **Verify deployment**
   ```bash
   # Check service health
   aws ecs describe-services --cluster angel-backend-dev-cluster --services angel-backend-dev-backend

   # Test endpoints
   curl http://YOUR-ALB-URL/health
   curl http://YOUR-ALB-URL/v1/.well-known/ready
   ```

5. **Run database migrations**
   ```bash
   # Access running task
   aws ecs execute-command \
     --cluster angel-backend-dev-cluster \
     --task TASK_ID \
     --container backend \
     --interactive \
     --command "/bin/sh"

   # Run migrations
   npm run typeorm migration:run
   ```

### Phase 3: Cleanup Old Resources (After Testing)

Once you've verified everything works on ECS:

1. **Delete EKS resources** (if they exist)
   ```bash
   cd backend/terraform
   terraform destroy
   ```

2. **Remove deprecated files**
   ```bash
   rm -rf backend/terraform/modules/eks
   rm -rf backend/terraform/modules/kubernetes
   rm -rf backend/k8s
   ```

## Environment Variable Mapping

The application environment variables remain the same, but the source changed:

| Variable | EKS Source | ECS Source |
|----------|-----------|------------|
| `DB_HOST` | ConfigMap | Environment variable |
| `DB_PASSWORD` | K8s Secret → External Secret | Secrets Manager → Task definition |
| `OPENAI_API_KEY` | K8s Secret → External Secret | Secrets Manager → Task definition |
| `WEAVIATE_HOST` | Service DNS | Service Discovery DNS |

## Troubleshooting

### Tasks Failing to Start

**Check task logs:**
```bash
aws logs tail /ecs/angel-backend-dev/backend --follow
```

**Common issues:**
- ECR image not found → Build and push image
- Secrets not accessible → Check IAM role permissions
- Health checks failing → Adjust health check path/timeout

### Database Connection Errors

**Check security groups:**
```bash
# RDS should allow ECS task security group on port 5432
aws ec2 describe-security-groups --filters Name=group-name,Values=angel-backend-dev-rds-sg
```

### Weaviate Connection Issues

**Verify service discovery:**
```bash
# From backend task:
nslookup weaviate.angel-backend-dev.local
```

## Rollback Plan

If you need to rollback to EKS:

1. Keep your Terraform configurations
2. Don't delete EKS resources until ECS is proven
3. Use CloudFormation's rollback feature:
   ```bash
   aws cloudformation rollback-stack --stack-name angel-backend-dev-backend
   ```

## Performance Considerations

### Cold Start Times
- **EKS**: ~10-30 seconds (pod scheduling + image pull)
- **ECS**: ~30-60 seconds (task provisioning + image pull)
- Both can be mitigated with proper health check grace periods

### Scaling Speed
- **EKS**: 10-30 seconds (existing nodes)
- **ECS**: 30-60 seconds (Fargate provisioning)
- Use warm pools or higher min capacity for production

## Next Steps

1. ✅ Review CloudFormation templates
2. ⬜ Deploy to dev environment
3. ⬜ Test all functionality
4. ⬜ Monitor costs for 1 week
5. ⬜ Deploy to staging/production
6. ⬜ Remove old EKS resources
7. ⬜ Update CI/CD pipelines to use ECS

## Support Resources

- **AWS ECS Best Practices**: https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/
- **CloudFormation Reference**: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/
- **Cost Optimization**: https://aws.amazon.com/ecs/pricing/

## Questions?

If you have questions about the migration:
1. Check CloudWatch Logs for detailed error messages
2. Review the CloudFormation stack events
3. Compare with the working configuration in the templates
