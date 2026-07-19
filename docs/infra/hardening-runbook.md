# Infra hardening — ready-to-apply manifests + canary runbook

Two documented, **not-auto-applied** hardening artifacts that close the two audit gaps (the gipc namespace
has no NetworkPolicy; the web pod runs root/unhardened with the default ServiceAccount token mounted):

| Artifact | File | Applicable on the live cluster today? |
|----------|------|----------------------------------------|
| gipc default-deny NetworkPolicy | `infra/k8s/gipc/gipc-netpol.example.yaml` | **No** — kube-router can't enforce same-ns (see below). A correct model for Calico/Cilium. |
| Hardened web Deployment | `infra/k8s/web/web-hardened.deployment.example.yaml` | **Yes**, via GitOps + a canary (see below). |

Both are `.example`, are in **no** `kustomization.yaml`, and are **never** force-applied. Validation is
client-side only. Nothing in this sprint mutates the cluster.

## ⚠ Blocker #1 — kube-router cannot enforce same-namespace policy on this k3s

A gipc NetworkPolicy was **applied and removed on 2026-07-16**: kube-router's same-namespace ingress
enforcement rejects **all** same-ns pod-to-pod traffic regardless of `from:` rules (documented in
`infra/k8s/ai/ollama.yaml`; corroborated across Sprint G/H). Only **cross-namespace** policies (e.g.
`demo`, `data`) work. Consequently a default-deny in `gipc` breaks the entire same-ns mesh — rows 3, 4, 5,
6, 7, 14 in the flow map — i.e. caddy→web/core/ai, web→core, core→web, ai→ollama. **Do not apply the netpol
on the current cluster.** It is a reference model, ready for a CNI that enforces same-ns intra-namespace
policy (Calico or Cilium). Migrating the CNI is a separate, larger change.

## ⚠ Blocker #2 — ArgoCD self-heal on the web Deployment

`gipc-web` is an ArgoCD application with `selfHeal: true` and `prune: true` on `path: infra/k8s/web`. A raw
`kubectl apply` of `web-hardened.deployment.example.yaml` (same name/namespace) is **reverted at the next
reconcile**. To roll the hardening out for real, either:

1. **GitOps (preferred):** merge the `securityContext` / `volumes` / `automountServiceAccountToken` changes
   into `infra/k8s/web/deployment.yaml`, commit, and let ArgoCD sync — then watch the pod.
2. **Manual canary:** `argocd app set gipc-web --sync-policy none` first, `kubectl apply` the hardened
   deployment, verify, then either commit to git (and re-enable auto-sync) or roll back.

The **netpol** has no such issue: `infra/k8s/gipc/` is watched by no ArgoCD app (the three apps target
`web`, `core`, and the observability paths), so it is neither pruned nor self-healed.

## Inter-service flow map (source of truth)

Every flow the gipc netpol must allow, grounded in the manifests. The four **ipBlock / infra-plane** flows
(rows 1, 2, 12, 15/16) do not appear as service-to-service lines in any manifest — they are the classic
default-deny footguns.

| # | Source → Dest | Port (pod) | Selector kind | Evidence |
|---|---------------|-----------|---------------|----------|
| 1 | cloudflared (host root) → caddy | 80 (NodePort 30082, SNAT→node) | ipBlock (node) | `infra/cloudflared/config.yml:7,9` (`localhost:30082`) → `caddy.yaml` svc nodePort 30082 |
| 2 | kubelet (node) → all pods | probe ports (web 3000, core 8080, ai 8000, caddy 80, ollama 11434) | ipBlock (node) | each pod's readiness/liveness probe |
| 3 | caddy → web | **3000** (Svc 80 → targetPort 3000) | same-ns⚠ | `caddy.yaml` (`web:80`) → `web/service.yaml:11-13` |
| 4 | caddy → core | 8080 | same-ns⚠ | `caddy.yaml` → `core.yaml` |
| 5 | caddy → ai | 8000 | same-ns⚠ | `caddy.yaml` → `ai.yaml` |
| 6 | web (SSR) → core | 8080 | same-ns⚠ | `app/status/page.tsx`, `app/system/page.tsx` (`CORE ?? http://core:8080`, `force-dynamic`) |
| 7 | core → web (uptime probe) | **3000** (core `WEB_URL=http://web:80` → Svc 80 → pod 3000) | same-ns⚠ | `core.yaml` env `WEB_URL` |
| 8 | core → prometheus.observability | 9090 | cross-ns | `core.yaml` env `PROMETHEUS_URL` |
| 9 | core → loki.observability | 3100 | cross-ns | `core.yaml` env `LOKI_URL` |
| 10 | core → chaos-target.demo | 80 | cross-ns | `core.yaml` env `LOAD_TARGET_URL` |
| 11 | core → demo-db.demo | 5432 | cross-ns | `core.yaml` env `DEMO_DB_URL` |
| 12 | core → k8s API | 443 (API ClusterIP → host:6443) | ipBlock (API IP) | `core-topology-rbac.yaml`, `core-lab-rbac.yaml`, SA `core-lab` |
| 13 | ai → postgres.data | 5432 | cross-ns | `ai.yaml` env `DATABASE_URL` |
| 14 | ai → ollama | 11434 | same-ns⚠ | `services/ai/app/infer.py` (httpx → ollama) |
| 15 | ai → Anthropic API (external) | 443 | ipBlock (external) | `services/ai/app/llm.py` (`AsyncAnthropic`) |
| 16 | ai → challenges.cloudflare.com — Turnstile siteverify (external) | 443 | ipBlock (external) | `services/ai/app/turnstile.py` (httpx POST) |
| 17 | prometheus.observability → caddy | 2019 (app metrics) | cross-ns | `caddy.yaml` (`:2019` + `prometheus.io/scrape` annotation) |
| 18 | all gipc pods → kube-system DNS | 53 UDP+TCP | ns kube-system | every Service DNS name above |

**Not flows** (do not add — they would be dead/misleading rules):

- **web → ai is client-side only** — the browser calls `/api/ai/*` through caddy; grep confirms zero
  server-side `ai:8000` / `AI_URL` references in `apps/web`. So web egress is core:8080 + DNS only.
- **caddy → external: none** (`auto_https off`, no ACME).
- **GHCR image pulls** happen at the node (kubelet/containerd), not from a pod — netpol-irrelevant.

**Rows 15 & 16 must both be covered** by the single ai external `:443` egress. If it were scoped to only
Anthropic's IPs, the Turnstile `siteverify` call would be blocked and every Turnstile-gated AI endpoint
(oracle / jd / variant / theme / infer) would fail closed.

## CIDR confirmation (do this before any apply)

The placeholders in the netpol are k3s defaults — confirm against the live cluster:

```
ssh garuda kubectl get nodes -o wide            # NODE_IP (kubelet + cloudflared NodePort SNAT source)
ssh garuda kubectl cluster-info dump | grep -i -m5 cidr   # pod-CIDR (default 10.42.0.0/16)
ssh garuda kubectl -n default get svc kubernetes -o jsonpath='{.spec.clusterIP}'   # API_IP (default 10.43.0.1)
```

Also verify the tunnel's real NodePort target: `infra/k8s/web/service.yaml:13` carries a stale comment ("tunnel
repointed to 30081"); the authoritative `infra/cloudflared/config.yml:7,9` sends `gipc.dev` to
`localhost:30082` (caddy). Tighten the netpol's `0.0.0.0/0` ingress placeholders to `<NODE_IP>/32` once
confirmed.

## Client-side validation (no cluster mutation)

```
# schema validation only — never touches the cluster (client-side):
ssh garuda kubectl apply --dry-run=client -f infra/k8s/gipc/gipc-netpol.example.yaml
ssh garuda kubectl apply --dry-run=client -f infra/k8s/web/web-hardened.deployment.example.yaml
# or locally, parse-only:
python3 -c "import yaml,sys; list(yaml.safe_load_all(open(sys.argv[1]))); print('ok')" <file>
```

`--dry-run=client` validates schema, **not** flow-completeness or CIDR correctness — those come from the
flow map + the CIDR-confirmation step above.

## Canary rollout — hardened web Deployment (on a CNI-capable path or via ArgoCD-none)

1. Confirm the image already runs non-root (it does — `apps/web/Dockerfile` ends `USER nextjs`, uid 1001).
2. Merge the hardening into `infra/k8s/web/deployment.yaml` (GitOps) **or** `argocd app set gipc-web
   --sync-policy none` then `kubectl apply` the hardened file.
3. Watch the rollout: `ssh garuda kubectl -n gipc rollout status deploy/web`.
4. Verify the pod: `kubectl -n gipc get pod -l app=web -o jsonpath='{.items[0].spec.securityContext}'` and
   confirm `/` returns 200 (readiness passing) — a failed write to a non-tmpfs path shows as CrashLoop.
5. **Rollback:** re-enable auto-sync (`argocd app set gipc-web --sync-policy automated`) or
   `kubectl -n gipc rollout undo deploy/web`. The RollingUpdate `maxUnavailable: 0` means a bad hardened pod
   never removes the last healthy endpoint.

## Netpol rollout (future CNI only — NOT the current k3s+kube-router)

Only after migrating to a same-ns-enforcing CNI: confirm CIDRs → `kubectl apply` the `allow-dns-egress` +
`allow-kubelet-probes` policies **first** (so probes/DNS survive the default-deny), verify pods stay Ready,
then apply `default-deny` + the per-app policies, watching each app's endpoints. Roll back by deleting the
`default-deny` policy (which instantly reopens all traffic) if any flow breaks.
