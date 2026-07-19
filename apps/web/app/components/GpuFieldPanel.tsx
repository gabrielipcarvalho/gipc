"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

/* /lab GPU shader field — a vanilla raw-WebGL fragment shader (no library) compiled and run per-pixel on the
   visitor's GPU. Safe-by-construction for the browser: it makes zero network calls, needs no wasm/worker/eval
   (a driver-compiled GLSL string), and is CSP-clean. Reduced-motion → exactly one static frame, no loop
   (and the loop self-cancels if reduce-motion is toggled on mid-run). Paused by default; robust to WebGL
   context-loss (it genuinely reinitialises on restore); releases the GL context on unmount (no leak).

   Shader colors are hardcoded in-GLSL because a canvas cannot read CSS custom properties (same reason as
   resume/Immersive.tsx:104); they mirror the --violet / --cyan design tokens. */

type Mode = "loading" | "ok" | "nowebgl" | "shaderfail";

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

// precision mediump for portability (mobile/exotic drivers may lack highp) — QA M1.
const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float t;
float wave(vec2 uv, float s){ return sin(uv.x * s + t) * cos(uv.y * s - t * 0.7); }
void main(){
  vec2 uv = (gl_FragCoord.xy / res - 0.5) * vec2(res.x / res.y, 1.0);
  float v = wave(uv, 3.0) + 0.5 * wave(uv * 1.7 + 1.3, 6.0) + 0.25 * wave(uv * 2.9 - 2.1, 11.0);
  v = 0.5 + 0.5 * v / 1.75;
  vec3 violet = vec3(0.486, 0.361, 1.0);   // mirrors the --violet design token (GLSL can't read CSS vars)
  vec3 cyan   = vec3(0.208, 0.878, 0.847); // mirrors the --cyan design token
  vec3 col = mix(violet, cyan, smoothstep(0.25, 0.85, v)) * (0.35 + 0.65 * v);
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function GpuFieldPanel() {
  const [mode, setMode] = useState<Mode>("loading");
  const [running, setRunning] = useState(false);
  const [glInfo, setGlInfo] = useState("");
  const [rm, setRm] = useState(false);
  const [reinitNonce, setReinitNonce] = useState(0); // bumped on context-restore → the effect fully reinits

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const lostRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // uniform teardown: every early-return returns cleanup(), so no path leaks a listener or GL object.
    const teardowns: Array<() => void> = [];
    const cleanup = () => {
      for (const fn of teardowns.splice(0)) fn();
    };

    // reduce-motion change listener (QA M2) — if RM turns on mid-run, stop the loop + disable the control.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onRmChange = () => {
      if (mq.matches) {
        stopRef.current();
        setRm(true);
      } else {
        setRm(false);
      }
    };
    mq.addEventListener("change", onRmChange);
    teardowns.push(() => mq.removeEventListener("change", onRmChange));

    let ctx: WebGLRenderingContext | null = null;
    try {
      ctx = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setMode("nowebgl");
      return cleanup;
    }
    const gl = ctx;

    // context-loss handlers attached early so a restore always reinitialises (QA M1).
    const onLost = (e: Event) => {
      e.preventDefault(); // required so the browser will fire a restore
      lostRef.current = true;
      runningRef.current = false;
      setRunning(false); // don't leave the button reading "pause" with nothing animating
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setMode("nowebgl"); // show the static fallback rather than a frozen canvas
    };
    const onRestored = () => {
      lostRef.current = false;
      setReinitNonce((n) => n + 1); // re-run this effect → fresh context + recompiled shaders/buffers
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    teardowns.push(() => canvas.removeEventListener("webglcontextlost", onLost));
    teardowns.push(() => canvas.removeEventListener("webglcontextrestored", onRestored));
    teardowns.push(() => gl.getExtension("WEBGL_lose_context")?.loseContext()); // release — browsers cap ~16 (QA M2)

    // A reused canvas can hand back an already-lost context (React Strict-Mode dev double-mount, after the
    // first cleanup's loseContext). Show the fallback rather than compiling on a dead context; a real
    // runtime loss instead goes through onLost/onRestored above. Production is single-mount → live context.
    if (gl.isContextLost()) {
      setMode("nowebgl");
      return cleanup;
    }
    lostRef.current = false;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
      setMode("shaderfail");
      return cleanup;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      setMode("shaderfail");
      return cleanup;
    }
    gl.useProgram(program);
    teardowns.push(() => {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const pLoc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(pLoc);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);
    const resLoc = gl.getUniformLocation(program, "res");
    const tLoc = gl.getUniformLocation(program, "t");
    teardowns.push(() => gl.deleteBuffer(buf));

    // honest GL info (client-only, never transmitted). UNMASKED renderer is often hidden by the browser
    // (Firefox RFP / Safari) — degrade honestly rather than imply a GPU. Deliberately diverges from
    // Immersive.tsx:41's anti-fingerprint stance because it is shown to the user and never leaves the page.
    const version = gl.getParameter(gl.VERSION) as string;
    let renderer = "masked by your browser";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      const r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
      if (r) renderer = r;
    }
    setGlInfo(`${version} · renderer: ${renderer}`);

    const resize = (): boolean => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // fill-rate guard on retina/4K
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        return true;
      }
      return false;
    };
    const draw = (timeMs: number) => {
      resize();
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform1f(tLoc, timeMs * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const schedule = () => {
      if (rafRef.current) return; // never double-schedule → never 2× GPU (QA M3)
      rafRef.current = requestAnimationFrame(loop);
    };
    const loop = (now: number) => {
      rafRef.current = 0;
      // single source of truth + every stop condition, incl. a mid-run reduce-motion flip (QA M2).
      if (!runningRef.current || document.hidden || lostRef.current || prefersReducedMotion()) return;
      draw(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    const start = () => {
      if (prefersReducedMotion() || lostRef.current) return; // re-check RM (defense-in-depth, QA L2)
      runningRef.current = true;
      setRunning(true);
      schedule();
    };
    const stop = () => {
      runningRef.current = false;
      setRunning(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    startRef.current = start;
    stopRef.current = stop;

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      } else if (runningRef.current && !lostRef.current && !prefersReducedMotion()) {
        schedule(); // resume only if the user still wants it running
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    teardowns.push(() => document.removeEventListener("visibilitychange", onVisibility));

    const ro = new ResizeObserver(() => {
      const changed = resize();
      if (changed && !runningRef.current) draw(0); // keep the paused/static frame crisp on resize
    });
    ro.observe(canvas);
    teardowns.push(() => ro.disconnect());
    teardowns.push(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      runningRef.current = false;
    });

    setMode("ok");
    setRm(prefersReducedMotion());
    draw(0); // paint one deterministic static frame (t=0) so the canvas is never blank (QA L1). RM stops here.

    return cleanup;
  }, [reinitNonce]);

  const toggle = () => (running ? stopRef.current() : startRef.current());

  return (
    <section className="lab-panel" aria-labelledby="gpuf-h">
      <h2 id="gpuf-h" className="lab-h">
        GPU shader field
      </h2>
      <p className="lab-lead">
        A live arcane field — a <strong>fragment shader</strong> run per-pixel via raw WebGL (no library).
        {mode === "ok" &&
          " It’s compiled and running on your GPU right now — the lab’s toy corner, but the GPU work is real."}{" "}
        Paused by default, and it respects reduced-motion.
      </p>

      <canvas
        ref={canvasRef}
        className="gpuf-canvas"
        aria-hidden="true"
        style={{ display: mode === "nowebgl" || mode === "shaderfail" ? "none" : "block" }}
      />
      {mode === "nowebgl" && <div className="gpuf-fallback" aria-hidden="true" />}

      {(mode === "ok" || mode === "loading") && (
        <button
          type="button"
          className="pg-tab gpuf-run"
          onClick={toggle}
          disabled={mode !== "ok" || rm}
          aria-pressed={running}
        >
          {running ? "❚❚ pause" : "▶ run"}
        </button>
      )}

      <p className="lab-note" aria-live="polite">
        {mode === "nowebgl"
          ? "Your browser or GPU has no usable WebGL — showing a static placeholder."
          : mode === "shaderfail"
            ? "The shader wouldn’t compile on your GPU — nothing to show, honestly."
            : rm
              ? "Paused for reduced-motion (one static frame drawn)."
              : glInfo
                ? `WebGL: ${glInfo}`
                : "compiling a shader on your GPU…"}
      </p>
      <noscript>
        <p className="lab-note">The shader field needs JavaScript + WebGL.</p>
      </noscript>
    </section>
  );
}
