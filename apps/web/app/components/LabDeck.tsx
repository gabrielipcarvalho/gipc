"use client";

import { ChaosPanel } from "./ChaosPanel";
import { LoadPanel } from "./LoadPanel";

// The Lab panel deck. P5: chaos + load. P6 adds events + rate-limit + API playground.
export function LabDeck() {
  return (
    <div className="lab">
      <ChaosPanel />
      <LoadPanel />
    </div>
  );
}
