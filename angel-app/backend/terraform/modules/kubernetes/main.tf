terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}

# Namespace for the application
resource "kubernetes_namespace" "angel_backend" {
  metadata {
    name = "angel-backend"
    labels = {
      name        = "angel-backend"
      environment = var.environment
    }
  }
}

# ConfigMap for non-sensitive configuration
resource "kubernetes_config_map" "app_config" {
  metadata {
    name      = "angel-backend-config"
    namespace = kubernetes_namespace.angel_backend.metadata[0].name
  }

  data = {
    NODE_ENV                  = var.environment
    PORT                      = "3000"
    DB_HOST                   = var.db_host
    DB_PORT                   = tostring(var.db_port)
    DB_NAME                   = var.db_name
    AI_PROVIDER               = var.ai_provider
    OPENAI_MODEL              = var.openai_model
    GEMINI_MODEL              = var.gemini_model
    ENABLE_RAG                = tostring(var.enable_rag)
    RAG_LIMIT                 = tostring(var.rag_limit)
    RAG_SIMILARITY_THRESHOLD  = tostring(var.rag_similarity_threshold)
  }
}

# Deployment
resource "kubernetes_deployment" "angel_backend" {
  metadata {
    name      = "angel-backend"
    namespace = kubernetes_namespace.angel_backend.metadata[0].name
    labels = {
      app         = "angel-backend"
      environment = var.environment
    }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "angel-backend"
      }
    }

    template {
      metadata {
        labels = {
          app         = "angel-backend"
          environment = var.environment
        }
      }

      spec {
        service_account_name = kubernetes_service_account.angel_backend.metadata[0].name

        container {
          name  = "angel-backend"
          image = "${var.container_image}:${var.container_tag}"

          port {
            container_port = 3000
            name           = "http"
          }

          # Environment variables from ConfigMap
          env_from {
            config_map_ref {
              name = kubernetes_config_map.app_config.metadata[0].name
            }
          }

          # Environment variables from Secret (will be created by External Secrets)
          env_from {
            secret_ref {
              name = "angel-backend-secrets"
            }
          }

          # Health checks
          liveness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 30
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 10
            period_seconds        = 5
            timeout_seconds       = 3
            failure_threshold     = 3
          }

          # Resource limits
          resources {
            requests = {
              cpu    = var.cpu_request
              memory = var.memory_request
            }
            limits = {
              cpu    = var.cpu_limit
              memory = var.memory_limit
            }
          }
        }
      }
    }
  }
}

# Service Account
resource "kubernetes_service_account" "angel_backend" {
  metadata {
    name      = "angel-backend"
    namespace = kubernetes_namespace.angel_backend.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = var.service_account_role_arn
    }
  }
}

# Service
resource "kubernetes_service" "angel_backend" {
  metadata {
    name      = "angel-backend"
    namespace = kubernetes_namespace.angel_backend.metadata[0].name
    labels = {
      app = "angel-backend"
    }
  }

  spec {
    selector = {
      app = "angel-backend"
    }

    port {
      port        = 80
      target_port = 3000
      protocol    = "TCP"
      name        = "http"
    }

    type = "ClusterIP"
  }
}

# Horizontal Pod Autoscaler
resource "kubernetes_horizontal_pod_autoscaler_v2" "angel_backend" {
  metadata {
    name      = "angel-backend-hpa"
    namespace = kubernetes_namespace.angel_backend.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.angel_backend.metadata[0].name
    }

    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }

    metric {
      type = "Resource"
      resource {
        name = "memory"
        target {
          type                = "Utilization"
          average_utilization = 80
        }
      }
    }
  }
}

# Ingress (Application Load Balancer)
resource "kubernetes_ingress_v1" "angel_backend" {
  metadata {
    name      = "angel-backend-ingress"
    namespace = kubernetes_namespace.angel_backend.metadata[0].name
    annotations = {
      "kubernetes.io/ingress.class"               = "alb"
      "alb.ingress.kubernetes.io/scheme"          = "internet-facing"
      "alb.ingress.kubernetes.io/target-type"     = "ip"
      "alb.ingress.kubernetes.io/listen-ports"    = jsonencode([{ HTTP = 80 }])
      "alb.ingress.kubernetes.io/healthcheck-path" = "/health"
    }
  }

  spec {
    rule {
      http {
        path {
          path      = "/*"
          path_type = "ImplementationSpecific"

          backend {
            service {
              name = kubernetes_service.angel_backend.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }
}
