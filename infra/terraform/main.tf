# The application namespaces — the part of garuda's provisioning Terraform models cleanly. Labels match
# the LIVE cluster (gipc has only the k8s-managed name label; observability carries part-of), so after
# `terraform import` a `plan` shows NO changes — the honest no-drift story.
#
# PLAN / IMPORT ONLY. The box is already provisioned and deploys via GitOps (ArgoCD → main). NEVER run
# `terraform apply` here — the workloads (Deployments/Services/ConfigMaps) live in infra/k8s + ArgoCD,
# not in Terraform. This file codifies the namespace boundary + the intent, nothing more.

resource "kubernetes_namespace" "gipc" {
  metadata {
    name = "gipc"
    # no custom labels — matches the live namespace (import → plan clean)
  }
}

resource "kubernetes_namespace" "observability" {
  metadata {
    name = "observability"
    labels = {
      "app.kubernetes.io/part-of" = "gipc-observability"
    }
  }
}
