terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    # Configure this for your remote state
    # bucket = "your-terraform-state-bucket"
    # key    = "angel-backend/terraform.tfstate"
    # region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Angel-Backend"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Data source for EKS cluster authentication
data "aws_eks_cluster" "cluster" {
  name = module.eks.cluster_name

  depends_on = [module.eks]
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name

  depends_on = [module.eks]
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name        = var.project_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

# RDS PostgreSQL Module
module "rds" {
  source = "./modules/rds"

  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  db_name                = var.db_name
  db_username            = var.db_username
  db_password            = var.db_password
  db_instance_class      = var.db_instance_class
  db_allocated_storage   = var.db_allocated_storage
  db_engine_version      = var.db_engine_version
  allowed_security_group_id = module.eks.node_security_group_id
}

# Secrets Manager Module
module "secrets" {
  source = "./modules/secrets"

  project_name          = var.project_name
  environment           = var.environment
  aws_region            = var.aws_region
  namespace             = "angel-backend"
  oidc_provider_arn     = module.eks.oidc_provider_arn
  oidc_provider_url     = module.eks.oidc_provider_url
  database_secret_name  = "${var.project_name}/${var.environment}/database"
  app_secret_name       = "${var.project_name}/${var.environment}/app-secrets"
  db_username           = var.db_username
  db_password           = var.db_password
  db_host               = module.rds.db_address
  db_port               = module.rds.db_port
  db_name               = var.db_name
  jwt_secret            = var.jwt_secret
  openai_api_key        = var.openai_api_key
  gemini_api_key        = var.gemini_api_key
  mail_user             = var.mail_user
  mail_pass             = var.mail_pass

  depends_on = [module.eks]
}

# EKS Cluster Module
module "eks" {
  source = "./modules/eks"

  project_name        = var.project_name
  environment         = var.environment
  cluster_version     = var.eks_cluster_version
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  node_instance_types = var.eks_node_instance_types
  node_desired_size   = var.eks_node_desired_size
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size
  secrets_arns        = [module.secrets.database_secret_arn, module.secrets.app_secret_arn]
}

# Install External Secrets Operator via Helm
resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = "external-secrets-system"
  create_namespace = true
  version    = "0.9.11"

  set {
    name  = "installCRDs"
    value = "true"
  }

  depends_on = [module.eks]
}

# Install AWS Load Balancer Controller via Helm
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.6.2"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  depends_on = [module.eks]
}

# Kubernetes Resources Module
module "kubernetes" {
  source = "./modules/kubernetes"

  environment               = var.environment
  container_image           = var.container_image
  container_tag             = var.container_tag
  replicas                  = var.app_replicas
  db_host                   = module.rds.db_address
  db_port                   = module.rds.db_port
  db_name                   = var.db_name
  service_account_role_arn  = module.secrets.external_secrets_role_arn

  depends_on = [module.eks, module.secrets, helm_release.external_secrets, helm_release.aws_load_balancer_controller]
}
