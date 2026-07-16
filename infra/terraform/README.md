# Terraform — gipc.dev namespace boundary (plan/import only)

Codifies the Kubernetes **namespaces** on garuda's k3s (`gipc`, `observability`). The Cloudflare half
(the tunnel + the DNS that routes through it) lives in its own root module at
[`cloudflare/`](cloudflare/) — separate state, separate credentials, both import→plan-clean stories
independently verifiable — neither demands the other's credentials. The host-level bootstrap (k3s, cloudflared, packages) is codified by
[Ansible](../ansible/) and documented in `bootstrap.tf`.

## This is PLAN / CHECK / IMPORT ONLY — never `apply`
The box is already provisioned and the workloads deploy via **GitOps** (ArgoCD watching `main` →
`infra/k8s`). Terraform here is *documentation + reconciliation*, not a deployment path.

```bash
# offline validation (no cluster needed — the CI/dev gate)
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate

# reconcile with the live cluster, then prove no drift (read-only; import writes local state, not the cluster)
scp garuda:/etc/rancher/k3s/k3s.yaml ~/.kube/gipc-garuda.yaml   # edit `server:` to garuda's IP
terraform -chdir=infra/terraform import kubernetes_namespace.gipc gipc
terraform -chdir=infra/terraform import kubernetes_namespace.observability observability
terraform -chdir=infra/terraform plan   # → "No changes."
```

`terraform apply` is intentionally never run. State + `*.tfvars` are git-ignored.
