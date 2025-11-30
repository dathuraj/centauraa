variable "environment" {
  description = "Environment name"
  type        = string
}

variable "container_image" {
  description = "Docker image repository"
  type        = string
}

variable "container_tag" {
  description = "Docker image tag"
  type        = string
}

variable "replicas" {
  description = "Number of pod replicas"
  type        = number
  default     = 2
}

variable "min_replicas" {
  description = "Minimum number of replicas for HPA"
  type        = number
  default     = 2
}

variable "max_replicas" {
  description = "Maximum number of replicas for HPA"
  type        = number
  default     = 10
}

variable "cpu_request" {
  description = "CPU request for pods"
  type        = string
  default     = "250m"
}

variable "cpu_limit" {
  description = "CPU limit for pods"
  type        = string
  default     = "1000m"
}

variable "memory_request" {
  description = "Memory request for pods"
  type        = string
  default     = "512Mi"
}

variable "memory_limit" {
  description = "Memory limit for pods"
  type        = string
  default     = "2Gi"
}

variable "db_host" {
  description = "Database host"
  type        = string
}

variable "db_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "ai_provider" {
  description = "AI provider (openai or gemini)"
  type        = string
  default     = "gemini"
}

variable "openai_model" {
  description = "OpenAI model name"
  type        = string
  default     = "gpt-4o-mini"
}

variable "gemini_model" {
  description = "Gemini model name"
  type        = string
  default     = "gemini-2.5-flash"
}

variable "enable_rag" {
  description = "Enable RAG (Retrieval Augmented Generation)"
  type        = bool
  default     = true
}

variable "rag_limit" {
  description = "Number of similar conversations to retrieve"
  type        = number
  default     = 3
}

variable "rag_similarity_threshold" {
  description = "Similarity threshold for RAG"
  type        = number
  default     = 0.5
}

variable "service_account_role_arn" {
  description = "IAM role ARN for service account (IRSA)"
  type        = string
}
