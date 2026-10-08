import {
  createCasa,
  ENEMY_LABEL,
  LIVES,
  MAX_TICKS,
  stepCasa,
  SUB,
  TICKS_PER_SECOND,
  type CasaInputLog,
  type CasaState,
  type Dir,
} from "@maya/api/game/casa";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { useCallback, useEffect, useRef, useState } from "react";
import { GamePad, useShowPad, type PadDir } from "../../components/shared/GamePad";
import { localBoard, ScoreSave, type BoardRow } from "../../components/shared/ScoreSave";
import { readPalette, type Palette } from "../../lib/game/draw";
import { CELL, CH, CW, drawCasa, drawHouse, type Trail } from "../../lib/game/draw-casa";

export interface FinishedCasa {
  seed: number;
  inputs: CasaInputLog;
  score: number;
  level: number;
  eaten: number;
}

type Phase = "intro" | "playing" | "paused" | "over";
const STEP_MS = 1000 / TICKS_PER_SECOND;

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 1,
  w: 1,
  W: 1,
  ArrowRight: 2,
  d: 2,
  D: 2,
  ArrowDown: 3,
  s: 3,
  S: 3,
  ArrowLeft: 4,
  a: 4,
  A: 4,
};

/**
 * "Maya en casa". Celular: desliza el dedo o usa la cruceta. Computador: flechas o WASD.
 */
export default function CasaGame({
  startGame = async () => (Math.random() * 2 ** 31) | 0,
  onFinish,
  attemptsLeft,
  playLabel = "Jugar",
  onSaveName = localBoard("casa"),
  boardTitle = "Tabla de prueba",
}: {
  startGame?: () => Promise<number>;
  onFinish?: (game: FinishedCasa) => Promise<{ message?: string } | void>;
  attemptsLeft?: number;
  playLabel?: string;
  /** Guarda el nombre del jugador y devuelve la tabla. */
  onSaveName?: (name: string, score: number) => Promise<BoardRow[]>;
  boardTitle?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, level: 1, left: 180, power: false });
  const [result, setResult] = useState<FinishedCasa | null>(null);
  const [serverMsg, setServerMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showPad = useShowPad();

  const g = useRef<{
    state: CasaState;
    seed: number;
    inputs: CasaInputLog;
    pending: Dir;
    trail: Trail[];
    floaters: { x: number; y: number; text: string; life: number }[];
    lastPaw: { x: number; y: number };
    side: number;
    acc: number;
    last: number;
    raf: number;
    pal: Palette;
    house: HTMLCanvasElement | null;
    swipe: { x: number; y: number } | null;
  } | null>(null);

  useEffect(() => {
    const pal = readPalette(wrapRef.current ?? document.documentElement);
    g.current = {
      state: createCasa(1),
      seed: 1,
      inputs: [],
      pending: 0,
      trail: [],
      floaters: [],
      lastPaw: { x: 0, y: 0 },
      side: 1,
      acc: 0,
      last: 0,
      raf: 0,
      pal,
      house: drawHouse(pal),
      swipe: null,
    };
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paint = useCallback(() => {
    const cur = g.current;
    const canvas = canvasRef.current;
    if (!cur || !canvas || !cur.house) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(w / CW, 0, 0, h / CH, 0, 0);
    drawCasa(ctx, cur.house, cur.state, cur.pal, cur.trail, cur.floaters);
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => paint());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [paint]);

  const finish = useCallback(async () => {
    const cur = g.current!;
    cancelAnimationFrame(cur.raf);
    const done: FinishedCasa = {
      seed: cur.seed,
      inputs: cur.inputs,
      score: cur.state.score,
      level: cur.state.level,
      eaten: cur.state.eaten,
    };
    setResult(done);
    setPhase("over");
    if (onFinish) {
      setBusy(true);
      try {
        const res = await onFinish(done);
        if (res?.message) setServerMsg(res.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos guardar el puntaje.");
      } finally {
        setBusy(false);
      }
    }
  }, [onFinish]);

  const frame = useCallback(
    (now: number) => {
      const cur = g.current!;
      cur.acc += Math.min(100, now - cur.last);
      cur.last = now;
      let ended = false;
      while (cur.acc >= STEP_MS && !ended) {
        cur.acc -= STEP_MS;
        const want = cur.pending;
        if (want) {
          cur.inputs.push([cur.state.tick, want]);
          cur.pending = 0;
        }
        const events = stepCasa(cur.state, want);
        for (const ev of events) {
          if (ev.t === "espanta") {
            cur.floaters.push({ x: (ev.x / SUB) * CELL + CELL / 2, y: (ev.y / SUB) * CELL, text: `+${ev.points}`, life: 45 });
          } else if (ev.t === "atrapada") {
            cur.floaters.push({ x: CW / 2, y: CH / 2, text: `¡Te alcanzó ${ENEMY_LABEL[ev.kind].toLowerCase()}!`, life: 70 });
            cur.trail = [];
            navigator.vibrate?.(120);
          } else if (ev.t === "nivel") {
            cur.floaters.push({ x: CW / 2, y: CH / 2, text: `¡Casa limpia! Nivel ${ev.level}`, life: 70 });
          } else if (ev.t === "hueso") {
            navigator.vibrate?.(30);
          } else if (ev.t === "end") {
            ended = true;
          }
        }
        // Huellas: una cada media casilla recorrida.
        const mx = (cur.state.maya.x / SUB) * CELL + CELL / 2;
        const my = (cur.state.maya.y / SUB) * CELL + CELL / 2;
        if (Math.hypot(mx - cur.lastPaw.x, my - cur.lastPaw.y) >= CELL * 0.7) {
          const angle = Math.atan2(my - cur.lastPaw.y, mx - cur.lastPaw.x);
          if (Math.hypot(mx - cur.lastPaw.x, my - cur.lastPaw.y) < CELL * 3) {
            cur.trail.push({ x: cur.lastPaw.x, y: cur.lastPaw.y, angle, life: 40, side: cur.side });
            cur.side *= -1;
          }
          cur.lastPaw = { x: mx, y: my };
        }
        for (const t of cur.trail) t.life -= 1;
        cur.trail = cur.trail.filter((t) => t.life > 0).slice(-14);
        for (const f of cur.floaters) (f.y -= 0.6), (f.life -= 1);
        cur.floaters = cur.floaters.filter((f) => f.life > 0);
      }
      paint();
      const s = cur.state;
      setHud((h) => {
        const left = Math.ceil((MAX_TICKS - s.tick) / TICKS_PER_SECOND);
        const power = s.tick < s.powerUntil;
        return h.score === s.score && h.lives === s.lives && h.level === s.level && h.left === left && h.power === power
          ? h
          : { score: s.score, lives: s.lives, level: s.level, left, power };
      });
      if (ended) void finish();
      else cur.raf = requestAnimationFrame(frame);
    },
    [finish, paint],
  );

  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const seed = await startGame();
      const cur = g.current!;
      cur.pal = readPalette(wrapRef.current ?? document.documentElement);
      cur.house = drawHouse(cur.pal);
      cur.state = createCasa(seed);
      cur.seed = seed;
      cur.inputs = [];
      cur.pending = 0;
      cur.trail = [];
      cur.floaters = [];
      cur.lastPaw = { x: (cur.state.maya.x / SUB) * CELL + CELL / 2, y: (cur.state.maya.y / SUB) * CELL + CELL / 2 };
      cur.acc = 0;
      cur.last = performance.now();
      setResult(null);
      setServerMsg("");
      setHud({ score: 0, lives: LIVES, level: 1, left: 180, power: false });
      setPhase("playing");
      canvasRef.current?.focus();
      cur.raf = requestAnimationFrame(frame);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar la partida.");
    } finally {
      setBusy(false);
    }
  };

  const pause = useCallback(() => {
    const cur = g.current;
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    setPhase((p) => (p === "playing" ? "paused" : p));
  }, []);

  const resume = () => {
    const cur = g.current!;
    cur.last = performance.now();
    setPhase("playing");
    canvasRef.current?.focus();
    cur.raf = requestAnimationFrame(frame);
  };

  useEffect(() => {
    const onVis = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", pause);
    };
  }, [pause]);

  /* ------------------------------ Controles ----------------------------- */
  const press = (d: Dir) => {
    if (g.current && phase === "playing") g.current.pending = d;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const d = KEY_DIR[e.key];
    if (d) {
      e.preventDefault();
      press(d);
    } else if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (phase === "playing") pause();
      else if (phase === "paused") resume();
    }
  };
  const onDown = (e: React.PointerEvent) => {
    if (g.current) g.current.swipe = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    const cur = g.current;
    if (!cur?.swipe) return;
    const dx = e.clientX - cur.swipe.x;
    const dy = e.clientY - cur.swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : dy > 0 ? 3 : 1);
    cur.swipe = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    if (g.current) g.current.swipe = null;
  };

  const PAD_DIR: Record<PadDir, Dir> = { up: 1, right: 2, down: 3, left: 4 };

  const mins = Math.floor(hud.left / 60);
  const secs = String(hud.left % 60).padStart(2, "0");

  return (
    <div ref={wrapRef} className="mx-auto w-full max-w-[min(100%,calc(100dvh-230px))]">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-sm text-ink-soft">Puntos · nivel {hud.level}</p>
          <p className="tnum text-3xl font-bold leading-none text-teal-900">
            {hud.score}
            {hud.power && phase === "playing" && (
              <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 align-middle text-sm text-[var(--on-accent)]">¡Guau!</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1" aria-label={`${hud.lives} de ${LIVES} vidas`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <PawPrint key={i} weight="fill" size={24} className={i < hud.lives ? "text-teal-700" : "text-line"} aria-hidden="true" />
          ))}
        </div>
        <p className="tnum w-12 text-right font-semibold text-ink-soft" aria-label="Tiempo restante">
          {mins}:{secs}
        </p>
        {phase === "playing" || phase === "paused" ? (
          <button
            type="button"
            onClick={phase === "playing" ? pause : resume}
            className="grid size-11 place-items-center rounded-full bg-teal-100 text-teal-900 hover:bg-teal-200"
            aria-label={phase === "playing" ? "Pausar" : "Seguir jugando"}
          >
            {phase === "playing" ? <Pause size={22} weight="fill" aria-hidden="true" /> : <Play size={22} weight="fill" aria-hidden="true" />}
          </button>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-toy)] shadow-[inset_0_-5px_0_var(--field-lip),0_16px_32px_-18px_rgb(4_42_43/0.6)]">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Laberinto de la casa. Usa las flechas o W A S D, desliza el dedo o usa los botones para mover a Maya."
          className="block h-full w-full touch-none select-none outline-none focus-visible:ring-4 focus-visible:ring-sun-400"
          onKeyDown={onKey}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        {phase !== "playing" && (
          <div className="on-field absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-teal-950/75 px-6 py-4 text-center text-white backdrop-blur-[2px]">
            {phase === "intro" && (
              <>
                <h2 className="text-3xl font-bold [font-variation-settings:'wght'_740]">Maya en casa</h2>
                <p className="mt-3 max-w-[32ch] text-white/90">
                  Come todas las croquetas de la casa. Huye de la aspiradora, la manguera, el secador y el cartero. Con el hueso dorado Maya ladra y ellos salen corriendo.
                </p>
                <ul className="mt-4 space-y-1 text-sm text-white/85">
                  <li>Celular: desliza el dedo o usa los botones</li>
                  <li>Computador: flechas o W A S D</li>
                </ul>
                {attemptsLeft != null && (
                  <p className="mt-4 font-semibold">
                    Te quedan {attemptsLeft} {attemptsLeft === 1 ? "intento" : "intentos"}
                  </p>
                )}
                <button type="button" className="btn btn-sun mt-6 text-lg" onClick={start} disabled={busy || attemptsLeft === 0}>
                  {busy ? "Preparando…" : playLabel}
                </button>
              </>
            )}
            {phase === "paused" && (
              <>
                <h2 className="text-3xl font-bold">En pausa</h2>
                <p className="mt-2 text-white/85">La aspiradora también descansa.</p>
                <button type="button" className="btn btn-sun mt-6 text-lg" onClick={resume}>
                  Seguir jugando
                </button>
              </>
            )}
            {phase === "over" && result && (
              <>
                <p className="text-white/85">Tu puntaje</p>
                <p className="tnum text-6xl font-bold text-[var(--accent)] [font-variation-settings:'wght'_800]">{result.score}</p>
                <p className="mt-2 text-white/90">
                  Nivel {result.level} · {result.eaten} croquetas
                </p>
                {!onFinish && <ScoreSave key={result.seed} score={result.score} onSave={onSaveName} boardTitle={boardTitle} />}
                {busy && <p className="mt-4 text-white/85">Guardando tu puntaje…</p>}
                {serverMsg && (
                  <p className="mt-4 font-semibold text-[var(--accent)]" role="status">
                    {serverMsg}
                  </p>
                )}
                {(attemptsLeft == null || attemptsLeft > 0) && !busy && (
                  <button type="button" className="btn btn-sun mt-6 text-lg" onClick={start}>
                    {attemptsLeft != null ? `Otro intento (${attemptsLeft})` : "Jugar otra vez"}
                  </button>
                )}
              </>
            )}
            {error && (
              <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {showPad && (phase === "playing" || phase === "paused") && (
        <GamePad
          mode="cruceta"
          paused={phase === "paused"}
          onPause={phase === "playing" ? pause : resume}
          onPress={(d) => press(PAD_DIR[d])}
        />
      )}
    </div>
  );
}
