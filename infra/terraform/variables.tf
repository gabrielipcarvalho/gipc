variable "kubeconfig_path" {
  description = "Path to garuda's k3s kubeconfig. Read-only — used for plan/import reconcile, never apply."
  type        = string
  default     = "~/.kube/gipc-garuda.yaml"
}
