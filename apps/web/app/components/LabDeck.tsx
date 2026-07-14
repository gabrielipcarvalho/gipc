"use client";

import { ChaosPanel } from "./ChaosPanel";
import { LoadPanel } from "./LoadPanel";
import { EventsPanel } from "./EventsPanel";
import { RateLimitPanel } from "./RateLimitPanel";
import { ApiPlaygroundPanel } from "./ApiPlaygroundPanel";

// The Lab panel deck — chaos + load + events + rate-limit + API playground.
export function LabDeck() {
  return (
    <div className="lab">
      <ChaosPanel />
      <LoadPanel />
      <EventsPanel />
      <RateLimitPanel />
      <div className="lab-wide">
        <ApiPlaygroundPanel />
      </div>
    </div>
  );
}
