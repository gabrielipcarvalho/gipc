# Terraform — the tunnel + DNS, codified (NOT yet applied)

The codified mirror of the **hand-built** Cloudflare provisioning that serves gipc.dev: the
`gipc` tunnel and the proxied CNAMEs that route through it. Import-ready; **deliberately never
applied** — the tunnel is live and serving production.

Why a standalone root module: the sibling tree (`../`) models the k8s namespaces against a
kubeconfig; this one models Cloudflare against an API token. Separate states keep both
import→plan-clean stories independently verifiable — neither demands the other's credentials.

## Why not applied

`apply` without importing first would create duplicates — and the tunnel's `secret` is
ForceNew, so a naive post-import apply without the `ignore_changes` guard would **destroy and
recreate the live tunnel**. Import first, verify the plan shows **no replace**, then decide.

## State & versions

Local state, no backend; nothing sensitive committed (ids are no-default variables; the token
is `CLOUDFLARE_API_TOKEN` env-only). The lockfile is untracked — `~> 4.52` in `providers.tf`
is the only pin (minors float within v4; the lockfile regenerates locally). v4 major deliberately: `zero_trust_*` names need >= 4.40, and this
schema does not validate under v5. v5 migration = a future, deliberate step.

## Verify (no token needed; init downloads the provider)

    tofu -chdir=infra/terraform/cloudflare init -backend=false
    tofu -chdir=infra/terraform/cloudflare validate

## Import (real ids live on the box / CF dashboard — never here)

Needs `CLOUDFLARE_API_TOKEN` set, and each command will prompt for the four no-default
variables (or pass `-var`/`TF_VAR_*`):

    tofu -chdir=infra/terraform/cloudflare import cloudflare_zero_trust_tunnel_cloudflared.gipc <ACCOUNT_ID>/<TUNNEL_ID>
    tofu -chdir=infra/terraform/cloudflare import cloudflare_record.apex <ZONE_ID>/<record_id>
    tofu -chdir=infra/terraform/cloudflare import cloudflare_record.www  <ZONE_ID>/<record_id>

Then `tofu plan` must show **no replace** on the tunnel — that's `ignore_changes = [secret]`
working. The ingress rules are NOT modelled here (`config_src = "local"`): they live in
`/etc/cloudflared/config.yml`, mirrored at `infra/cloudflared/` and codified in
`infra/ansible/`.
