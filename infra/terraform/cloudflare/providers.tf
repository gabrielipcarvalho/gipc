# Standalone root module — deliberately NOT referenced from ../ (the k8s-namespace root):
# separate states keep the two import→plan-clean stories independently verifiable (kubeconfig-only
# there, token-only here). The zero_trust_* names need provider >= 4.40; this is v4 schema and
# does not validate under v5. The lockfile is untracked — this constraint is the only pin (minors float within v4).
terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
    }
  }
}

# Token comes from CLOUDFLARE_API_TOKEN in the environment — never a variable, never state.
provider "cloudflare" {}
