# infra/oci — the gipc.dev host VM (Oracle Cloud, ap-sydney-1)

One Ampere A1 VM sized to the **Always Free allowance floor** (2 OCPU / 12 GB / 150 GB boot) on a
**PAYG tenancy** — $0/mo while inside the allowance. Variable validations hard-cap the shape so a
config drift can't silently leave the free tier. Companion runbook:
`docs/infra/oracle-migration-runbook.md`.

## Prereqs
- Oracle account: home region ap-sydney-1, upgraded to PAYG, $1 budget alert, MFA (runbook §2).
- `~/.oci/config` DEFAULT profile (tenancy/user OCID, API key, fingerprint, region) — the provider
  reads the SDK config; no credentials live in this module or its state.

## Apply
```
cd infra/oci
tofu init && tofu plan -out=oci.plan   # expect: VCN + subnet + IGW + route + NSG + 1 instance
tofu apply oci.plan
```
State: local for now (same posture as `../terraform/cloudflare` — R2 backend is ready-to-activate
there; when it activates, add the same backend block here with key `oci/terraform.tfstate`).

## Post-apply
Output `public_ip` feeds `infra/ansible/inventory.ini` (host `oracle`) → runbook Phase B.
No inbound ports open except SSH from `home_ip_cidr`; the site itself arrives via Cloudflare
Tunnel (outbound-only) in runbook Phase F.
