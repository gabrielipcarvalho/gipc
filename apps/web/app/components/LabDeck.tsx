"use client";

import { ChaosPanel } from "./ChaosPanel";
import { LoadPanel } from "./LoadPanel";
import { EventsPanel } from "./EventsPanel";
import { RateLimitPanel } from "./RateLimitPanel";
import { ApiPlaygroundPanel } from "./ApiPlaygroundPanel";
import { DbExplorerPanel } from "./DbExplorerPanel";

// The Lab panel deck — chaos + load + events + rate-limit + API playground + DB explorer.
export function LabDeck() {
  return (
    <div className="lab">
      <ChaosPanel />
      <LoadPanel />
      <EventsPanel />
      <RateLimitPanel />
      <div className="lab-wide">
        <DbExplorerPanel />
      </div>
      <div className="lab-wide">
        <ApiPlaygroundPanel />
      </div>
    </div>
  );
}
