# VPS / Hosting Research — gipc.dev

> Researched 2026-06-16 via parallel live-pricing sweep of ~25 plans across 3 provider clusters.
> FX: €1≈$1.16, A$1≈US$0.66. AU prices ex-GST (add 10% if billed personally in AU).
> Some figures flagged "verify at signup" (JS-rendered pages / policy ambiguity).

## What the box must run (sizing recap)
Single-node k3s + Go service + Python AI service + Postgres/pgvector + Redis +
Prometheus/Grafana/Loki + lightweight mail (Stalwart) + ephemeral sandbox + optional Ollama (≤3B).
**Floor ~8 GB RAM; comfortable 16 GB; ~4 vCPU; 80–160 GB NVMe.** Low traffic. Cloudflare fronts
static, so origin latency mainly affects *live/dynamic* demos + SSH feel.

## Three cross-cutting findings
1. **🔑 Nested virtualization (real Firecracker microVMs) is the big filter.** Almost no cloud VPS
   exposes `/dev/kvm`: NOT Hetzner Cloud, Netcup, Contabo VPS, Vultr Cloud Compute, Linode,
   Lightsail, or Oracle A1 ARM. It needs **bare metal** (Hetzner AX, OVH Eco, Vultr BM), **Contabo
   VDS**, **AWS EC2 m8i** (new Feb 2026), or — uniquely among normal VPS — **Binary Lane** (opt-in
   nested KVM). **If our sandbox uses gVisor instead of Firecracker, nested virt isn't needed** and
   every option opens up. gVisor gives strong isolation and is a perfectly good fit for a sandbox-shell demo.
2. **📧 Mail: inbound 25 is fine everywhere; outbound 25 is blocked-by-default everywhere — which is
   exactly what our relay-outbound design wants.** PTR/rDNS is self-service on the good hosts
   (Binary Lane, Vultr, Linode, OVH, Netcup, Oracle); DigitalOcean derives PTR from the droplet name
   (no manual); AWS is the most friction. Binary Lane is the most genuinely mail-friendly.
3. **💸 Cloud egress can dwarf the instance.** AWS Sydney charges ~$0.114/GB out (~$105/extra TB);
   VPS hosts bundle 4–8 TB at ~$0.005–0.01/GB. Avoid metered hyperscaler egress for a public demo.

## Finalists (best across all clusters)

| Pick | Specs | $/mo | Region | Mail | Firecracker? | Why it's here |
|---|---|---|---|---|---|---|
| ⭐ **Binary Lane Standard 16GB** | 6 vCPU / 16 GB / 180 GB NVMe / 5 TB | **~US$52** (A$78+GST) | **AU** (Syd/Melb/Bris/Perth) | ✓✓ self-serve PTR + self-unblock 25 | **✓ opt-in KVM** | Only box that ticks *every* hard requirement at once |
| **Netcup RS 2000 G12** | 8 ded. EPYC / 16 GB / 512 GB NVMe | **~US$21** (€18 net) | EU (~280 ms) | ✓ self-toggle | ✗ → gVisor | Best raw hardware value, period |
| **OVH VPS-3** | 6 vCPU / 12 GB / 100 GB NVMe / 3 TB cap | **~US$12** (A$17) | **AU** (Sydney) | ✓ open in25 + PTR | ? unverified → gVisor | Cheapest in-country |
| **Hetzner CCX23** | 4 ded. AMD / 16 GB / 160 GB NVMe / 20 TB | **~US$36** (€31) | EU (~280 ms) | ✓ (unblock @1mo) | ✗ → gVisor | Rock-solid, huge bandwidth |
| **Vultr HP / Linode 16GB** | 4–6 vCPU / 16 GB / ~350 GB NVMe / 8 TB | **~US$96** | **AU** (Sydney) | ✓ PTR + ticket-unblock | ✗ → gVisor | Premium global brand, AU region |
| **Oracle A1 Always Free** | 2 OCPU ARM / 12 GB / 200 GB / 10 TB | **$0** | **AU** (Sydney) | relay only (25 blocked) | ✗ → gVisor | Free secondary/experiment node |
| **Hetzner AX42 (bare metal)** | Ryzen 8c/16t / 64 GB / 2×512 NVMe | **~US$68** +~$234 setup | EU | ✓ self-unblock | **✓** | Max power + true Firecracker, if EU latency OK |

## The two decisions that drive the pick
- **A) Does AU latency matter for the live bits?** Static is global via Cloudflare regardless. AU
  host = snappy SSH + live demos for AU viewers/you; EU host (Hetzner/Netcup) = ~280 ms on dynamic
  calls but *much* more hardware per dollar.
- **B) Real Firecracker microVMs, or is gVisor fine?** Firecracker → Binary Lane or bare metal.
  gVisor (strong isolation, no nested virt) → unlocks the cheap EU value boxes and OVH/Oracle.

## Recommendation — best of all worlds
**Binary Lane Standard 16 GB (Sydney/Melbourne), ~US$52/mo.** It is the single option with **zero
compromises**: comfortably runs the whole stack, in-country AU latency, the most mail-friendly host
tested, *and* the only normal VPS that exposes nested KVM so the **real Firecracker sandbox works** —
plus 5 TB traffic, no lock-in, and good AU support. For a portfolio where the box itself is the
showcase, that "everything just works locally and for real" is worth the modest premium.

**Cheaper, with one trade-off each:**
- **Netcup RS 2000 (~US$21)** — half the price, *more* hardware (8 EPYC cores, 512 GB); give up AU
  latency (EU, behind Cloudflare) + Firecracker (use gVisor). Outstanding value pick.
- **OVH VPS-3 Sydney (~US$12)** — cheapest in-country; give up Firecracker (gVisor) + accept OVH's
  mixed support rep + 3 TB cap.
- **Oracle A1 (free)** — $0 forever; trimmed 12 GB ARM, SMTP relay-only, gVisor only, Sydney capacity
  can be hard to grab. Great as a **free second node**, not the primary.

**Constant regardless of host:** Cloudflare in front (DNS + CDN + Turnstile + WAF), and a
lightweight mail stack (Stalwart) with outbound relay.

## ✅ FINAL DECISION (2026-06-17): self-host on a dedicated home laptop
Rather than any VPS, the compute home is a **dedicated HP EliteBook 640 G11** (Core Ultra 5 125H,
14c/18t, 16GB, 512GB NVMe) on Garuda Linux — ethernet, 24/7, headless. AU/Superloop, ~47 Mbps up,
~5 ms latency. Exposed via **Cloudflare Tunnel** (no inbound ports, CGNAT-proof, IP hidden, free
TLS/DDoS); Cloudflare fronts DNS/CDN/Turnstile/WAF + cached fallback. Bare metal → **real Firecracker
microVMs**. **Mail lives off-box on an always-up host** (tiny VPS Stalwart / CF Email Routing).
Total ~$0–5/mo. The VPS options below are retained as the fallback if home-hosting proves
insufficient (Netcup RS 2000 ≈ $21 = best value; Binary Lane ≈ $52 = AU + Firecracker).

---

## GCP free credits — evaluated (not recommended as the permanent home)
- New GCP accounts: **$300 credit / 90 days** (no longer 12 months). "Always Free" e2-micro is
  US-only, ~1 GB RAM — not usable here, not in Sydney.
- Our spec in `australia-southeast1` (~4 vCPU/16 GB/160 GB): **~$140–175/mo on-demand**
  (e2-standard-4 ~$110–130 + disk ~$20 + static IP ~$3 + egress ~$5–20; nested virt → N2, +~$25–40).
  → **$300 ≈ ~2 months**, and GCP is then the **most expensive** long-term option here.
- Catches: outbound **port 25 permanently blocked** (OK — we relay); metered egress; and
  **migrating a live mail server in ~2 months risks IP/sender reputation** — the exact chore to avoid.
- **Verdict:** don't anchor a permanent portfolio + mail to expiring credits. For "free + persistent,"
  **Oracle Always Free** (Sydney, no deadline) beats a 90-day credit. Reserve cloud credits
  (GCP/AWS/Azure) for **bursty/throwaway experiments** (GPU model runs, load tests) where there's no
  migration penalty.
