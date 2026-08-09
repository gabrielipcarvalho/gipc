"use client";

import { ChaosPanel } from "./ChaosPanel";
import { LoadPanel } from "./LoadPanel";
import { EventsPanel } from "./EventsPanel";
import { RateLimitPanel } from "./RateLimitPanel";
import { ApiPlaygroundPanel } from "./ApiPlaygroundPanel";
import { DbExplorerPanel } from "./DbExplorerPanel";
import { ShellPanel } from "./ShellPanel";
import { WafPanel } from "./WafPanel";
import { GpuFieldPanel } from "./GpuFieldPanel";

/* Sprint N — every demo gets a one-line human explainer: what it proves, why it's safe to hand
   to strangers. The claims mirror each panel's real guarantees (namespaced blast radius, fixed
   targets, allowlists, monitor-mode, no-exec grammar) — keep them in sync with the panels. */
function Explain({ proves, safe }: { proves: string; safe: string }) {
  return (
    <p className="lab-explain">
      <b>proves:</b> {proves} <span className="lab-explain-sep">·</span> <b>safe because:</b> {safe}
    </p>
  );
}

// The Lab panel deck — chaos + load + events + rate-limit + API playground + DB explorer + safe shell + WAF + GPU field.
export function LabDeck() {
  return (
    <div className="lab">
      <div className="lab-cell">
        <Explain
          proves="Kubernetes self-healing — you delete a real pod and watch the cluster restore it"
          safe="the blast radius is three disposable echo pods in an isolated demo namespace"
        />
        <ChaosPanel />
      </div>
      <div className="lab-cell">
        <Explain
          proves="behaviour under real load — live latency histogram from real requests"
          safe="it only ever fires at an isolated demo target, with hard caps on rate and duration"
        />
        <LoadPanel />
      </div>
      <div className="lab-cell">
        <Explain
          proves="the cluster's own event stream, live as it happens"
          safe="strictly read-only"
        />
        <EventsPanel />
      </div>
      <div className="lab-cell">
        <Explain
          proves="the platform's per-IP rate limits, by letting you trip them"
          safe="you only ever throttle yourself"
        />
        <RateLimitPanel />
      </div>
      <div className="lab-wide lab-cell">
        <Explain
          proves="real query planning — postgres EXPLAIN (ANALYZE) output you steer"
          safe="a disposable demo database with synthetic data and allowlisted queries only"
        />
        <DbExplorerPanel />
      </div>
      <div className="lab-wide lab-cell">
        <Explain
          proves="the platform's public read APIs, explorable with a scoped demo token"
          safe="read-only endpoints, demo-token scoped, rate-limited"
        />
        <ApiPlaygroundPanel />
      </div>
      <div className="lab-wide lab-cell">
        <Explain
          proves="an operations shell over real platform data"
          safe="a fixed command grammar — there is no exec path to escape through, by construction"
        />
        <ShellPanel />
      </div>
      <div className="lab-wide lab-cell">
        <Explain
          proves="an application-layer WAF engine watching this very site's traffic"
          safe="monitor-mode only, and it stores no IP addresses by construction"
        />
        <WafPanel />
      </div>
      <div className="lab-wide lab-cell">
        <Explain
          proves="hand-written WebGL — no libraries, shaders from scratch"
          safe="it's pixels"
        />
        <GpuFieldPanel />
      </div>
    </div>
  );
}
