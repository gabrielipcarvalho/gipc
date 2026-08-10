"use client";

import type { ComponentType } from "react";
import { ChaosPanel } from "./ChaosPanel";
import { LoadPanel } from "./LoadPanel";
import { EventsPanel } from "./EventsPanel";
import { RateLimitPanel } from "./RateLimitPanel";
import { ApiPlaygroundPanel } from "./ApiPlaygroundPanel";
import { DbExplorerPanel } from "./DbExplorerPanel";
import { ShellPanel } from "./ShellPanel";
import { WafPanel } from "./WafPanel";
import { GpuFieldPanel } from "./GpuFieldPanel";

/* Sprint N — every demo opens with a one-line human explainer: what it proves, why it's safe
   to hand to strangers. One array = one place to edit. The claims mirror each panel's REAL
   guarantees (namespaced blast radius, fixed targets, allowlists, monitor-mode, no-exec
   grammar) — when a panel's guarantee changes, its row here changes in the same commit. */
type Demo = { id: string; Panel: ComponentType; proves: string; safe: string; wide?: boolean };

const DEMOS: Demo[] = [
  {
    id: "chaos",
    Panel: ChaosPanel,
    proves: "Kubernetes self-healing — you delete a real pod and watch the cluster restore it",
    safe: "the blast radius is three disposable echo pods in an isolated demo namespace",
  },
  {
    id: "load",
    Panel: LoadPanel,
    proves: "behaviour under real load — live latency histogram from real requests",
    safe: "it only ever fires at an isolated demo target, with hard caps on rate and duration",
  },
  {
    id: "events",
    Panel: EventsPanel,
    proves: "the cluster's own event stream, live as it happens",
    safe: "strictly read-only",
  },
  {
    id: "ratelimit",
    Panel: RateLimitPanel,
    proves: "the platform's per-IP rate limits, by letting you trip them",
    safe: "you only ever throttle yourself",
  },
  {
    id: "db",
    Panel: DbExplorerPanel,
    proves: "real query planning — postgres EXPLAIN (ANALYZE) output you steer",
    safe: "a disposable demo database with synthetic data and allowlisted queries only",
    wide: true,
  },
  {
    id: "api",
    Panel: ApiPlaygroundPanel,
    proves: "the platform's public read APIs, explorable with a scoped demo token",
    safe: "read-only endpoints, demo-token scoped, rate-limited",
    wide: true,
  },
  {
    id: "shell",
    Panel: ShellPanel,
    proves: "an operations shell over real platform data",
    safe: "a fixed command grammar — there is no exec path to escape through, by construction",
    wide: true,
  },
  {
    id: "waf",
    Panel: WafPanel,
    proves: "an application-layer WAF engine watching this very site's traffic",
    safe: "monitor-mode only, and it stores no IP addresses by construction",
    wide: true,
  },
  {
    id: "gpu",
    Panel: GpuFieldPanel,
    proves: "hand-written WebGL — no libraries, shaders from scratch",
    safe: "it's pixels",
    wide: true,
  },
];

// The Lab panel deck — chaos + load + events + rate-limit + DB explorer + API playground + safe shell + WAF + GPU field.
export function LabDeck() {
  return (
    <div className="lab">
      {DEMOS.map(({ id, Panel, proves, safe, wide }) => (
        <div key={id} className={wide ? "lab-wide lab-cell" : "lab-cell"}>
          <Panel />
          {/* the verdict reads AFTER the demo — you meet the thing before its proof */}
          <p className="lab-explain">
            <b>proves:</b> {proves} <span className="lab-explain-sep">·</span> <b>safe because:</b>{" "}
            {safe}
          </p>
        </div>
      ))}
    </div>
  );
}
