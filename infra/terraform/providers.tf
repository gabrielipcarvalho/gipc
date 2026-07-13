terraform {
  required_version = ">= 1.5"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

# Points at garuda's k3s kubeconfig. Used for `import` + `plan` (read-only reconcile) ONLY.
# This cluster deploys via GitOps (ArgoCD watching main) — Terraform NEVER `apply`s it.
provider "kubernetes" {
  config_path = var.kubeconfig_path
}
