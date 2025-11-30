output "namespace" {
  description = "Kubernetes namespace name"
  value       = kubernetes_namespace.angel_backend.metadata[0].name
}

output "service_name" {
  description = "Kubernetes service name"
  value       = kubernetes_service.angel_backend.metadata[0].name
}

output "deployment_name" {
  description = "Kubernetes deployment name"
  value       = kubernetes_deployment.angel_backend.metadata[0].name
}
