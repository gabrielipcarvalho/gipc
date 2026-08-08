# Oracle Migration Runbook — gipc.dev off garuda → OCI Ampere A1 (Sydney)

> Decision 2026-08-07 (research: 4-track agent sweep, saved in project memory): move the single-node
> k3s cluster from the garuda home desktop to an **Oracle Cloud Ampere A1 VM in ap-sydney-1** on a
> **Pay-As-You-Go tenancy staying inside the Always Free allowance** ($0/mo). Paid fallback if Oracle
> ever degrades: OVH VPS-2 Sydney (4c/8GB, ~A$13/mo) — this runbook doubles as that redeploy.
>
> Everything transfers as-is: same manifests, same GitOps, same tunnel — the site's
> infrastructure-as-content story survives 1:1 (unlike a PaaS split, which was priced and rejected).

## 0. Measured footprint (2026-08-07, garuda)

| What | Usage |
|---|---|
| All pods, every namespace | ~1.8 GiB RAM, 59m CPU |
| gipc ns (web/ai/core/caddy/ollama idle) | ~590 Mi |
| observability (prom/grafana/loki/promtail) | ~670 Mi |
| ollama model load (transient, /lab infer) | +2–3 GiB |
| PVCs | 21 Gi provisioned (pg 2 + ollama 8 + obs 11) |

Target shape **2 OCPU / 12 GB / 150 GB boot** fits everything with >2× headroom.

## 1. Free-tier guardrails (the contract with ourselves)

- Always Free floor (post-June-2026 halving): **1,500 OCPU-hrs + 9,000 GB-hrs/mo = one 2-OCPU/12GB
  A1 running 24/7**. Block storage free to **200 GB total** (boot volume counts). Egress 10 TB/mo free.
- **Never provision**: OCI Load Balancer (CF Tunnel replaces it), additional VMs, paid DB services,
  reserved IPs beyond the one ephemeral, anything outside ap-sydney-1.
- Tenancy must be **PAYG** (kills capacity errors, idle reclaim, most ban risk) with a **$1 budget
  alert** + MFA. Invoice must read $0.00 — check monthly.
- Avoid casual stop/start of the instance: a restart is a fresh capacity placement. PAYG mitigates
  but don't tempt it.
- Oracle can shrink the tier again (they halved it silently 2026-06-15). The escape hatch below is
  the real insurance; keep it warm.

## 2. Prerequisites

- [ ] Oracle account: real card, home region **ap-sydney-1** (permanent), upgraded to PAYG, $1
      budget alert, MFA. *(USER — task #1)*
- [ ] API signing key for Terraform (Profile → API Keys → generate; note tenancy/user OCID, fingerprint).
- [ ] arm64 images green: web/ai/core multi-arch on GHCR *(task #2 — `ops/arm64-images` merged)*.
- [ ] `infra/oci/` Terraform module ready *(task #4)*.
- [ ] Fresh PG dump exists in R2 *(task #5 — do BEFORE touching anything)*.

## 3. Phase A — provision (Terraform, `infra/oci/`)

VCN + public subnet + NSG (**ingress: SSH 22 from home IP only** — the site needs no inbound, tunnel
is outbound; **egress: all**) + instance:

- `VM.Standard.A1.Flex`, **2 OCPU / 12 GB**, Ubuntu 24.04 Minimal **aarch64**, **150 GB** boot volume.
- Ephemeral public IP (bootstrap SSH only; can drop to none post-cutover if we move SSH behind the tunnel).
- Plan/apply from repo root; state alongside the existing Cloudflare R2 remote-state pattern.

## 4. Phase B — host bootstrap (extend `infra/ansible/`)

Add an `oracle` host to `inventory.ini`; extend the playbook (it already codifies k3s + cloudflared
for garuda — this time it RUNS for real, no `--check`):

1. Base packages + unattended-upgrades.
2. **k3s server** — pin the channel; install with `INSTALL_K3S_EXEC="--flannel-backend=none
   --disable-network-policy"` and install **Cilium** (helm, arm64) as CNI.
   *Why Cilium: kube-router can't enforce same-ns NetworkPolicy (documented gap carried since
   Sprint G) — fresh node = the one cheap moment to fix it. Fallback if Cilium misbehaves: rerun
   k3s install stock (flannel), apply nothing, revisit later. Decide within 1 hour, don't yak-shave.*
3. **cloudflared**: install arm64 binary + systemd unit + `/etc/cloudflared/` dir — config copied in
   Phase F. **Do NOT enable/start yet** (that's the cutover switch).

## 5. Phase C — cluster restore (all from the repo — this is the GitOps payoff)

1. Namespaces: gipc, data, demo, observability, argocd.
2. **Secrets** (imperative, never in git — export from garuda `kubectl get secret -o yaml`, scrub
   metadata, apply on oracle):

   | Secret | NS | Notes |
   |---|---|---|
   | postgres credentials | data | source of truth for DATABASE_URL |
   | ai: DATABASE_URL | gipc | derived from data-ns pg secret |
   | ai: ANTHROPIC_API_KEY | gipc | optional — absent = honest degrade |
   | ai: TURNSTILE_SECRET | gipc | |
   | ai: AUDIT_SALT | gipc | |
   | web: DEPLOY_HOOK_KEY | gipc | deploy-feed HMAC (matches GH secret) |
   | pg-backup-auth | gipc | copy of the data-ns `postgres` password (key `password`) — backup job |
   | r2-backup | gipc | R2 S3 creds, token gipc-backups-rw (local copy: `~/.config/claude-secrets/r2-backup.env`) |
   | grafana admin / others | observability | **VERIFY at execution**: `kubectl get secrets -A` diff |

3. Workloads: `kubectl apply -k infra/k8s/<dir>` for caddy, core, ai, web, data, demo, observability
   (kustomizations pin exact SHAs — arm64 layers pull automatically from the multi-arch manifests).
4. **ArgoCD**: install (official manifest), apply `infra/argocd/application.yaml` (gipc-web).
   *VERIFY: `core.yaml`/`observability.yaml` exist in `infra/argocd/` but only gipc-web is live on
   garuda — replicate reality (web-only), don't "fix" it mid-migration.*
5. Confirm the hardened web pod (non-root/read-only/drop-ALL, applied 2026-07-19) comes up clean on arm64.

## 6. Phase D — data

1. `pg_dump -Fc` the data-ns postgres on garuda → restore into oracle's data-ns pg (<1 GB).
2. demo-db: reseeded from its manifest/init — **VERIFY** it needs no dump (it's demo data by design).
3. ollama: `ollama pull` the model list (**VERIFY list**: `kubectl exec ollama -- ollama list` on
   garuda) — or defer; /lab infer degrades honestly until pulled.

## 7. Phase E — dark verify (before any traffic moves)

- On oracle: `curl -s localhost:30082` (caddy NodePort — same ingress path the tunnel will use) for
  `/`, `/lab`, `/system`, `/oracle`, `/api/ai/*` gated 4xx, `/api/hooks/deploy` 401 unsigned.
- `kubectl top nodes/pods` — expect ≤3 GiB steady; restarts 0.
- Latency sanity from home: `ping` + `curl -w` the public IP (Sydney ≈ 5–30 ms).

## 8. Phase F — cutover (zero-DNS, zero-downtime, instantly reversible)

The tunnel (`a7fe831c…`, credentials `/etc/cloudflared/gipc.json`) supports **multiple concurrent
connectors** — cutover = add one, remove one:

1. `scp` garuda `/etc/cloudflared/{config.yml,gipc.json}` → oracle (same path, root-owned 0600).
   Config is host-agnostic (`localhost:30082`) — no edits needed.
2. Start + enable cloudflared on oracle. Verify **two connectors**: `cloudflared tunnel info` (or CF
   dashboard → Tunnels → Connectors shows both machines).
3. Watch oracle's cloudflared logs serve real requests; spot-check gipc.dev routes.
4. **Stop + disable cloudflared on garuda.** All traffic now → oracle. DNS untouched, Terraform
   (cloudflare/) untouched, certs untouched.
5. Live verify: `/`, `/lab`, `/system`, `/oracle` 200s; a JD-analyzer round-trip; deploy-hook feed OK.

## 9. Phase G — post-cutover

- **48 h watch**: OCI budget shows $0; `kubectl top` steady; 0 restarts; CF analytics error rate flat.
- **Deploy-pipeline check**: push a trivial web change → CI builds multi-arch → pin → ArgoCD syncs
  on oracle. core/ai path: `kubectl set image` now targets oracle (update any ssh aliases — deploy
  docs say `ssh garuda kubectl …`; becomes `ssh oracle kubectl …` or kubeconfig context switch).
- **Apply the M-sprint netpol for real** (`infra/k8s/gipc/gipc-netpol.example.yaml` → promote from
  .example): under Cilium it finally *enforces*. Red-team curl-test same-ns isolation.
- **Demote garuda**: cloudflared stays disabled; cluster kept as dev/staging. Free the always-on duty.
- **Content audit**: if /system, /infra, or ADRs name garuda's hardware/topology, update honestly
  (zero-fabrication rule cuts both ways — the pages must describe the *new* reality).
- Update memory + BACKLOG; keep this runbook current with any deviation.

## 10. Rollback (any phase)

- Phases A–E: nothing user-facing changed — delete the VM, done.
- Phase F+: **start cloudflared on garuda again** (one systemd command = instant full revert), then
  stop oracle's. Garuda's cluster stays intact and current-ish for **≥7 days** post-cutover before
  any demotion beyond stopping its connector.
- Oracle-rug-pull day (tier shrunk/reclaimed/banned): this same runbook, Phases A–F, against an OVH
  VPS-2 Sydney (amd64 — images are multi-arch, no CI change needed). Budget ~1 hr + DNS untouched.
