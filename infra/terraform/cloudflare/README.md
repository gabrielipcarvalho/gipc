# Terraform — the tunnel + DNS, codified and UNDER MANAGEMENT

The codified mirror of the Cloudflare provisioning that serves gipc.dev: the `gipc` tunnel
and every DNS record in the zone (the proxied CNAMEs that route through the tunnel, plus the
full Migadu mail set — MX, DKIM, SPF, DMARC, SRV, autoconfig/autodiscover). As of Sprint J
this root is **imported and applied**: `terraform plan` is clean (`No changes`), so the code
now describes live reality and future changes go through it.

Why a standalone root module: the sibling tree (`../`) models the k8s namespaces against a
kubeconfig; this one models Cloudflare against an API token. Separate states keep both
plan-clean stories independently verifiable — neither demands the other's credentials.

## Binary

**Terraform v1.15.8** (hashicorp/tap). This root was originally exercised with OpenTofu; it
was re-initialised fresh with Terraform in Sprint J and that is now the single binary for it —
do not mix `tofu` and `terraform` against the same state.

## State & versions

`~> 4.52` in `providers.tf` is the pin; v4 major deliberately — `zero_trust_*` names need
>= 4.40 and this schema does not validate under v5.

**State is credential-bearing.** After import the `cloudflare_zero_trust_tunnel_cloudflared`
resource carries a computed, sensitive `tunnel_token` in state (functionally equivalent to the
connector credential on the box). So `terraform.tfstate` is treated as a secret: it is local,
git-ignored (`.gitignore` covers `*.tfstate*`), and `chmod 600` (owner-only). The real tunnel
`secret` is never fed to Terraform (a dummy satisfies the schema; `ignore_changes` suppresses
it) and never lands in state.

## Remote state on R2 (ready to activate — not yet live)

State is currently **local**. The intended home is a private Cloudflare R2 bucket, kept
single-vendor with the rest of the infra. `backend.tf.example` holds the ready backend config;
it is verified arg-schema-valid under Terraform v1.15.8 and CF-doc-matched, but **not** yet
functionally round-tripped (no bucket exists).

**Why it isn't live:** the current CF API token lacks the **Workers R2 Storage** permission
(a separate scope), so it can neither create a bucket nor mint the R2 S3 credentials a backend
needs. This is a documented wall, not a silent gap.

**To activate** (two account-side prerequisites, not one step):

0. If R2 has never been used on this account, **enable R2 in the dashboard first** (accept the
   R2 terms) — it is a separate product opt-in.
1. Add **Account → Workers R2 Storage → Edit** to the token (or use a dedicated R2 token),
   create a **private** bucket `gipc-tfstate`, and mint an R2 API token (S3 access key id +
   secret) **scoped to that bucket** (least privilege) → `~/.config/claude-secrets/`, never
   the repo.
2. Follow the runbook in `backend.tf.example` (`cp` it to `backend.tf`, set `<ACCOUNT_ID>`,
   `source` the R2 creds, `terraform init -migrate-state`, verify `plan` is `No changes` —
   if it shows changes, STOP, don't delete state — then delete both local `terraform.tfstate`
   and `terraform.tfstate.backup`, and finally **un-ignore + commit `backend.tf`** so R2 is
   the committed source of truth for fresh clones/CI).

`chmod 600` on local state is a point-in-time hardening — Terraform rewrites state on the next
`apply` and may reset it to the umask default; migrating to R2 (which removes local state
entirely) is the durable fix.

## Verify (no token needed; init downloads the provider)

    terraform -chdir=infra/terraform/cloudflare init -backend=false
    terraform -chdir=infra/terraform/cloudflare validate

## Import (real ids live on the box / CF dashboard — never here)

`import.sh` imports the whole zone + tunnel idempotently, resolving record ids by **content
match against the live API** (never a hand-written id table — for the two same-name `gipc.dev`
TXT records, content is the only disambiguator). It needs, transiently in the environment:
`CLOUDFLARE_API_TOKEN`, `TF_VAR_account_id`, `TF_VAR_zone_id`, `TF_VAR_tunnel_id`,
`TF_VAR_tunnel_secret` (a throwaway `openssl rand -base64 32` — the real secret is never used).

    source ~/.config/claude-secrets/cloudflare.env
    export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
    export TF_VAR_account_id=… TF_VAR_zone_id=… TF_VAR_tunnel_id=…
    export TF_VAR_tunnel_secret="$(openssl rand -base64 32)"
    bash import.sh

## Notes from the import (why the code looks the way it does)

- **Record names are the provider's SHORT form** (`www`, `_dmarc`, `key1._domainkey`) — the v4
  provider stores the short name in state, not the FQDN. Authoring FQDNs forces a replace.
- **The tunnel imports with `config_src` = null** and no `secret`, both ForceNew — so
  `ignore_changes = [secret, config_src]` is required, else the first plan wants to replace the
  live tunnel. The local ingress config (`config_src = "local"`) lives in
  `/etc/cloudflared/config.yml`, mirrored at `infra/cloudflared/` and codified in
  `infra/ansible/` — never a `tunnel_config` resource.
- **One reconciling apply was required after import.** The v4 provider leaves a record's
  `content` unset in state on import, so the first plan shows in-place updates that re-assert
  byte-identical DNS data. That apply changed **zero DNS-material bytes** — a full 16-record
  API compare before vs after was identical on every material field (type/name/content/ttl/
  priority/proxied/data), every record kept its id, and only the server-side `modified_on`
  timestamp advanced on the re-asserted records (as expected for an idempotent in-place PUT).
  It contained **no create/destroy/replace** — the mail records were never at risk — and left
  `plan` clean. Subsequent plans are `No changes`.
