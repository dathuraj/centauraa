# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnet_ids
}

# RDS Outputs
output "db_endpoint" {
  description = "RDS instance endpoint (hostname:port)"
  value       = module.rds.db_endpoint
}

output "db_address" {
  description = "RDS instance address (hostname only)"
  value       = module.rds.db_address
}

output "db_port" {
  description = "RDS instance port"
  value       = module.rds.db_port
}

output "db_name" {
  description = "Database name"
  value       = module.rds.db_name
}

# EKS Outputs
output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "eks_node_security_group_id" {
  description = "Security group ID attached to the EKS nodes"
  value       = module.eks.node_security_group_id
}

# Secrets Outputs
output "database_secret_arn" {
  description = "ARN of the database secret in Secrets Manager"
  value       = module.secrets.database_secret_arn
}

output "app_secret_arn" {
  description = "ARN of the application secret in Secrets Manager"
  value       = module.secrets.app_secret_arn
}

# Kubernetes Outputs
output "kubernetes_namespace" {
  description = "Kubernetes namespace for the application"
  value       = module.kubernetes.namespace
}

output "kubernetes_service_name" {
  description = "Kubernetes service name"
  value       = module.kubernetes.service_name
}

# Instructions
output "next_steps" {
  description = "Next steps after infrastructure deployment"
  value = <<-EOT

  ===== DEPLOYMENT SUCCESSFUL =====

  Next Steps:

  1. Configure kubectl to connect to your EKS cluster:
     aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}

  2. Verify cluster nodes are ready:
     kubectl get nodes

  3. Check if External Secrets Operator is running:
     kubectl get pods -n external-secrets-system

  4. Verify secrets are synced:
     kubectl get externalsecrets -n angel-backend
     kubectl get secrets -n angel-backend

  5. Connect to the database and enable pgvector extension:
     psql -h ${module.rds.db_address} -U ${var.db_username} -d ${var.db_name}
     CREATE EXTENSION IF NOT EXISTS vector;

  6. Run database migrations:
     kubectl run migration --image=${var.container_image}:${var.container_tag} -n angel-backend -- npm run migration:run

  7. Check application pods:
     kubectl get pods -n angel-backend
     kubectl logs -f -n angel-backend -l app=angel-backend

  8. Get the Load Balancer URL:
     kubectl get ingress -n angel-backend
     (Wait a few minutes for the ALB to be provisioned)

  Database Endpoint: ${module.rds.db_endpoint}
  EKS Cluster: ${module.eks.cluster_name}
  Region: ${var.aws_region}

  EOT
}
