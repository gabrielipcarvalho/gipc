"use client";

import { useMemo, useState } from "react";

/* Book-a-call request form. Composes a prefilled mailto: (client-only, no backend, no external host →
   CSP-safe). The compose control is an <a href={mailtoUrl}> — NOT a <form action="mailto:…"> (the CSP
   form-action 'self' would block that) — computed from the field state. It's a REQUEST; Gabriel confirms. */

const EMAIL = "arcan.e@gipc.dev";
const NOTE_MAX = 800;
const PURPOSES = ["intro chat", "role / opportunity", "collaboration", "other"] as const;
const DURATIONS = ["15 min", "30 min", "45 min"] as const;

export function MeetForm() {
  const [purpose, setPurpose] = useState<string>(PURPOSES[0]);
  const [windows, setWindows] = useState("");
  const [duration, setDuration] = useState<string>(DURATIONS[1]);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");

  const mailtoUrl = useMemo(() => {
    const subject = `Call request — ${purpose}`;
    const body = [
      name ? `From: ${name}` : "",
      `Purpose: ${purpose}`,
      `Duration: ${duration}`,
      `Preferred windows (AEST): ${windows || "(flexible)"}`,
      note ? `\nNote:\n${note}` : "",
      `\n— sent from gipc.dev/meet`,
    ]
      .filter(Boolean)
      .join("\n")
      .replace(/\r?\n/g, "\r\n"); // normalise all line breaks to CRLF (RFC 6068) → %0D%0A
    return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [purpose, windows, duration, note, name]);

  return (
    <div className="meet-form">
      <label className="meet-field">
        <span>your name (optional)</span>
        <input
          className="meet-input"
          type="text"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </label>

      <label className="meet-field">
        <span>purpose</span>
        <select className="meet-select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="meet-field">
        <span>duration</span>
        <select className="meet-select" value={duration} onChange={(e) => setDuration(e.target.value)}>
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <label className="meet-field">
        <span>preferred windows (AEST)</span>
        <input
          className="meet-input"
          type="text"
          value={windows}
          maxLength={200}
          onChange={(e) => setWindows(e.target.value)}
          placeholder="e.g. Tue/Wed afternoon, or async is fine"
        />
      </label>

      <label className="meet-field">
        <span>note (optional)</span>
        <textarea
          className="meet-textarea"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="anything I should know before we talk?"
          aria-describedby="meet-note-count"
        />
      </label>
      {/* counter is a sibling of the label so it doesn't pollute the textarea's accessible name */}
      <span id="meet-note-count" className="meet-count" aria-live="off">
        {note.length}/{NOTE_MAX}
      </span>

      <a className="meet-send" href={mailtoUrl}>
        compose email →
      </a>
      <p className="meet-note">
        This opens your email client with a prefilled request — it doesn&apos;t book instantly. I&apos;ll
        reply to confirm a time.
      </p>
    </div>
  );
}
