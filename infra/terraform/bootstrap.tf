# Bootstrap notes — the imperative, host-level provisioning that ISN'T Terraform-native and is codified
# by Ansible instead (infra/ansible/playbook.yml). Recorded here so the Terraform tree documents the FULL
# provisioning story, not just the namespaces above. NONE of this is applied by Terraform.
#
#   1. k3s server        — curl -sfL https://get.k3s.io | sh -  (single node; kubectl at /usr/local/bin)
#   2. cloudflared       — tunnel `gipc`, config at /etc/cloudflared/config.yml, systemd unit
#                          (infra/cloudflared/ mirrors the live host files)
#   3. base packages     — git, curl, ca-certificates (see infra/ansible/playbook.yml `base` role)
#   4. ArgoCD            — installed into the argocd namespace; watches main and syncs infra/k8s
#
# To reconcile Terraform state with the already-built cluster (then confirm a clean plan):
#   scp garuda:/etc/rancher/k3s/k3s.yaml ~/.kube/gipc-garuda.yaml   # then set the server IP
#   terraform init -backend=false
#   terraform import kubernetes_namespace.gipc gipc
#   terraform import kubernetes_namespace.observability observability
#   terraform plan            # → "No changes. Your infrastructure matches the configuration."
#
# terraform apply is intentionally NEVER run — this cluster is GitOps-deployed, not Terraform-deployed.
