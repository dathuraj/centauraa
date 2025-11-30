terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}

# IAM Role for External Secrets Service Account (IRSA)
resource "aws_iam_role" "external_secrets" {
  name = "${var.project_name}-${var.environment}-external-secrets-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:${var.namespace}:external-secrets-sa"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-external-secrets-role"
  }
}

# IAM Policy for Secrets Manager Access
resource "aws_iam_policy" "external_secrets" {
  name        = "${var.project_name}-${var.environment}-external-secrets-policy"
  description = "Policy for External Secrets Operator to access Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.secrets_arns
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "external_secrets" {
  policy_arn = aws_iam_policy.external_secrets.arn
  role       = aws_iam_role.external_secrets.name
}

# Service Account for External Secrets Operator
resource "kubernetes_service_account" "external_secrets" {
  metadata {
    name      = "external-secrets-sa"
    namespace = var.namespace
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.external_secrets.arn
    }
  }
}

# SecretStore - Links to AWS Secrets Manager
resource "kubernetes_manifest" "secret_store" {
  manifest = {
    apiVersion = "external-secrets.io/v1beta1"
    kind       = "SecretStore"
    metadata = {
      name      = "aws-secrets-manager"
      namespace = var.namespace
    }
    spec = {
      provider = {
        aws = {
          service = "SecretsManager"
          region  = var.aws_region
          auth = {
            jwt = {
              serviceAccountRef = {
                name = kubernetes_service_account.external_secrets.metadata[0].name
              }
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_service_account.external_secrets]
}

# ExternalSecret for Database Credentials
resource "kubernetes_manifest" "database_secret" {
  manifest = {
    apiVersion = "external-secrets.io/v1beta1"
    kind       = "ExternalSecret"
    metadata = {
      name      = "angel-backend-db-secret"
      namespace = var.namespace
    }
    spec = {
      refreshInterval = "1h"
      secretStoreRef = {
        name = "aws-secrets-manager"
        kind = "SecretStore"
      }
      target = {
        name           = "angel-backend-db-credentials"
        creationPolicy = "Owner"
      }
      data = [
        {
          secretKey = "DB_USERNAME"
          remoteRef = {
            key      = var.database_secret_name
            property = "username"
          }
        },
        {
          secretKey = "DB_PASSWORD"
          remoteRef = {
            key      = var.database_secret_name
            property = "password"
          }
        }
      ]
    }
  }

  depends_on = [kubernetes_manifest.secret_store]
}

# ExternalSecret for Application Secrets
resource "kubernetes_manifest" "app_secret" {
  manifest = {
    apiVersion = "external-secrets.io/v1beta1"
    kind       = "ExternalSecret"
    metadata = {
      name      = "angel-backend-app-secret"
      namespace = var.namespace
    }
    spec = {
      refreshInterval = "1h"
      secretStoreRef = {
        name = "aws-secrets-manager"
        kind = "SecretStore"
      }
      target = {
        name           = "angel-backend-secrets"
        creationPolicy = "Owner"
      }
      data = [
        {
          secretKey = "JWT_SECRET"
          remoteRef = {
            key      = var.app_secret_name
            property = "JWT_SECRET"
          }
        },
        {
          secretKey = "OPENAI_API_KEY"
          remoteRef = {
            key      = var.app_secret_name
            property = "OPENAI_API_KEY"
          }
        },
        {
          secretKey = "GEMINI_API_KEY"
          remoteRef = {
            key      = var.app_secret_name
            property = "GEMINI_API_KEY"
          }
        },
        {
          secretKey = "MAIL_USER"
          remoteRef = {
            key      = var.app_secret_name
            property = "MAIL_USER"
          }
        },
        {
          secretKey = "MAIL_PASS"
          remoteRef = {
            key      = var.app_secret_name
            property = "MAIL_PASS"
          }
        }
      ]
    }
  }

  depends_on = [kubernetes_manifest.secret_store]
}

# AWS Secrets Manager Secret for Database
resource "aws_secretsmanager_secret" "database" {
  name        = "${var.project_name}/${var.environment}/database"
  description = "Database credentials for Angel Backend"

  tags = {
    Name        = "${var.project_name}-${var.environment}-database-secret"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = var.db_host
    port     = var.db_port
    dbname   = var.db_name
  })
}

# AWS Secrets Manager Secret for Application
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.project_name}/${var.environment}/app-secrets"
  description = "Application secrets for Angel Backend"

  tags = {
    Name        = "${var.project_name}-${var.environment}-app-secret"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_SECRET     = var.jwt_secret
    OPENAI_API_KEY = var.openai_api_key
    GEMINI_API_KEY = var.gemini_api_key
    MAIL_USER      = var.mail_user
    MAIL_PASS      = var.mail_pass
  })
}
