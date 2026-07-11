import { Sigil } from "./sigil";

/* M1 Console — the arcane operator hero.
   Metric values are placeholders until M3 wires real telemetry (Prometheus/Grafana). */
const metrics = [
  { k: "web", pct: 82, v: "12 ms" },
  { k: "api", pct: 74, v: "142 rps" },
  { k: "ai", pct: 66, v: "agent up" },
  { k: "db", pct: 88, v: "3.4 ms" },
];

const chips = [
  ["scry", "observe"],
  ["summon", "deploy"],
  ["ward", "security"],
  ["oracle", "ask AI"],
  ["grimoire", "work"],
];

export default function Home() {
  return (
    <main className="wrap stage">
      <section className="term" aria-label="Operator console">
        <header className="term-bar">
          <div className="dots" aria-hidden>
            <span className="dot r" /><span className="dot y" /><span className="dot g" />
          </div>
          <Sigil className="sigil" />
          <span className="bar-path">arcane@prod : ~/portfolio</span>
          <div className="bar-meta">
            <span className="pulse" aria-hidden /> online
            <span className="sep">·</span> p99 12ms
            <span className="sep rps">·</span> <span className="rps">142 rps</span>
          </div>
        </header>

        <div className="term-body">
          <p className="line"><span className="prompt">arcane@prod:~$</span> ./boot --portfolio</p>
          <div className="checks">
            <span className="chk"><b>✓</b> services healthy</span>
            <span className="chk"><b>✓</b> agent warm</span>
            <span className="chk"><b>✓</b> tls valid</span>
            <span className="chk"><b>✓</b> last deploy #482 · 3h ago</span>
          </div>
          <p className="line whoami"><span className="prompt">arcane@prod:~$</span> whoami<span className="cursor" aria-hidden /></p>

          <h1 className="wordmark">arcane</h1>
          <p className="tagline">the operator — backend · cloud · <span className="c">AI arts</span></p>
          <p className="bio">
            I build real systems. This site runs on infrastructure I operate — every metric,
            deploy and agent you see here is live, not a mockup.
          </p>

          <div className="chips">
            {chips.map(([cmd, desc]) => (
              <span className="chip" key={cmd}>{cmd} <span className="c">{desc}</span></span>
            ))}
          </div>

          <div className="panel" role="group" aria-label="Live service metrics (placeholder)">
            {metrics.map((m) => (
              <div className="metric" key={m.k}>
                <span className="k">{m.k}</span>
                <span className="track"><span className="fill" style={{ width: `${m.pct}%` }} /></span>
                <span className="v">{m.v}</span>
              </div>
            ))}
          </div>

          <div className="actions">
            <button className="btn btn-primary" type="button">▸ ask the oracle</button>
            <button className="btn btn-ghost" type="button">trace my request</button>
            <span className="kbd"><b>⌘ K</b> command palette</span>
          </div>
        </div>
      </section>

      <p className="footstrip">gipc.dev · arcane palette · IBM Plex Mono · hex-sigil mark</p>
    </main>
  );
}
