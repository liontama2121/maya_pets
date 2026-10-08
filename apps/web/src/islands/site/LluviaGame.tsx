import {
  createGame,
  DURATION_TICKS,
  H,
  ITEMS,
  LIVES,
  step,
  TICKS_PER_SECOND,
  TIPS,
  W,
  type GameState,
  type InputLog,
} from "@maya/api/game";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { useCallback, useEffect, useRef, useState } from "react";
import { GamePad, useShowPad } from "../../components/shared/GamePad";
import { localBoard, ScoreSave, type BoardRow } from "../../components/shared/ScoreSave";
import { drawFrame, readPalette, type Floater, type Palette } from "../../lib/game/draw";

export interface FinishedGame {
  seed: number;
  inputs: InputLog;
  score: number;
  caught: number;
  bestCombo: number;
  lastToxic: GameState["lastToxic"];
}

type Phase = "intro" | "playing" | "paused" | "over";

const STEP_MS = 1000 / TICKS_PER_SECOND;
const KEY_SPEED = 12;

/**
 * "Lluvia de premios". En celular se arrastra el dedo; en computador, mouse o flechas.
 * `startGame` entrega la semilla (en la prueba es local; con COIN la da el servidor).
 */
export default function LluviaGame({
  startGame = async () => (Math.random() * 2 ** 31) | 0,
  onFinish,
  attemptsLeft,
  playLabel = "Jugar",
  onSaveName = localBoard("lluvia"),
  boardTitle = "Tabla de prueba",
}: {
  startGame?: () => Promise<number>;
  onFinish?: (game: FinishedGame) => Promise<{ message?: string } | void>;
  attemptsLeft?: number;
  playLabel?: string;
  /** Guarda el nombre del jugador y devuelve la tabla. */
  onSaveName?: (name: string, score: number) => Promise<BoardRow[]>;
  boardTitle?: string;
}) {
  const showPad = useShowPad();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, left: 60, combo: 1 });
  const [result, setResult] = useState<FinishedGame | null>(null);
  const [serverMsg, setServerMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const game = useRef<{
    state: GameState;
    seed: number;
    inputs: InputLog;
    target: number;
    lastLogged: number;
    keys: { left: boolean; right: boolean };
    floaters: Floater[];
    hurt: number;
    acc: number;
    last: number;
    raf: number;
    pal: Palette;
  } | null>(null);

  /* ------------------------------ Dibujo ------------------------------ */
  const paint = useCallback(() => {
    const g = game.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Coordenadas lógicas 360×640 escaladas al tamaño real del canvas.
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawFrame(ctx, g.state, g.pal, g.floaters, g.hurt);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    paint();
  }, [paint]);

  useEffect(() => {
    // Vista previa estática antes de jugar.
    const pal = wrapRef.current ? readPalette(wrapRef.current) : readPalette(document.documentElement);
    game.current = {
      state: createGame(1),
      seed: 1,
      inputs: [],
      target: W / 2,
      lastLogged: -1,
      keys: { left: false, right: false },
      floaters: [],
      hurt: 0,
      acc: 0,
      last: 0,
      raf: 0,
      pal,
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [resize]);

  /* ------------------------------- Bucle ------------------------------ */
  const finish = useCallback(async () => {
    const g = game.current!;
    cancelAnimationFrame(g.raf);
    const done: FinishedGame = {
      seed: g.seed,
      inputs: g.inputs,
      score: g.state.score,
      caught: g.state.caught,
      bestCombo: g.state.bestCombo,
      lastToxic: g.state.lastToxic,
    };
    setResult(done);
    setPhase("over");
    if (onFinish) {
      setBusy(true);
      setServerMsg("");
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
      const g = game.current!;
      const dt = Math.min(100, now - g.last);
      g.last = now;
      g.acc += dt;
      let ended = false;
      while (g.acc >= STEP_MS && !ended) {
        g.acc -= STEP_MS;
        if (g.keys.left) g.target = Math.max(0, g.state.plateX - KEY_SPEED * 3);
        if (g.keys.right) g.target = Math.min(W, g.state.plateX + KEY_SPEED * 3);
        const t = Math.round(g.target);
        if (t !== g.lastLogged) {
          g.inputs.push([g.state.tick, t]);
          g.lastLogged = t;
        }
        const events = step(g.state, t);
        for (const ev of events) {
          if (ev.t === "catch") {
            g.floaters.push({
              x: ev.x,
              y: 520,
              text: ev.combo > 1 ? `+${ev.points} x${ev.combo}` : `+${ev.points}`,
              color: "#ffffff",
              life: 40,
            });
          } else if (ev.t === "toxic") {
            g.hurt = 24;
            g.floaters.push({ x: ev.x, y: 520, text: `¡${ITEMS[ev.kind].label} no!`, color: "#ffb4ab", life: 50 });
            navigator.vibrate?.(80);
          } else if (ev.t === "end") {
            ended = true;
          }
        }
        if (g.hurt > 0) g.hurt -= 1;
        for (const f of g.floaters) {
          f.y -= 1.2;
          f.life -= 1;
        }
        g.floaters = g.floaters.filter((f) => f.life > 0);
      }
      paint();
      const s = g.state;
      setHud((h) => {
        const left = Math.ceil((DURATION_TICKS - s.tick) / TICKS_PER_SECOND);
        const combo = s.combo >= 15 ? 3 : s.combo >= 6 ? 2 : 1;
        return h.score === s.score && h.lives === s.lives && h.left === left && h.combo === combo
          ? h
          : { score: s.score, lives: s.lives, left, combo };
      });
      if (ended) void finish();
      else g.raf = requestAnimationFrame(frame);
    },
    [finish, paint],
  );

  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const seed = await startGame();
      const g = game.current!;
      g.pal = readPalette(wrapRef.current ?? document.documentElement);
      g.state = createGame(seed);
      g.seed = seed;
      g.inputs = [];
      g.target = W / 2;
      g.lastLogged = -1;
      g.floaters = [];
      g.hurt = 0;
      g.acc = 0;
      g.last = performance.now();
      setResult(null);
      setServerMsg("");
      setHud({ score: 0, lives: LIVES, left: 60, combo: 1 });
      setPhase("playing");
      canvasRef.current?.focus();
      g.raf = requestAnimationFrame(frame);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar la partida.");
    } finally {
      setBusy(false);
    }
  };

  const pause = useCallback(() => {
    const g = game.current;
    if (!g) return;
    cancelAnimationFrame(g.raf);
    setPhase((p) => (p === "playing" ? "paused" : p));
  }, []);

  const resume = () => {
    const g = game.current!;
    g.last = performance.now();
    setPhase("playing");
    canvasRef.current?.focus();
    g.raf = requestAnimationFrame(frame);
  };

  // Pausa automática si cambia de pestaña o minimiza.
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
  const toLogical = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  };
  const onPointer = (e: React.PointerEvent) => {
    if (phase !== "playing" || !game.current) return;
    game.current.target = toLogical(e.clientX);
  };
  const onKey = (e: React.KeyboardEvent, down: boolean) => {
    const g = game.current;
    if (!g) return;
    if (["ArrowLeft", "a", "A"].includes(e.key)) {
      g.keys.left = down;
      e.preventDefault();
    } else if (["ArrowRight", "d", "D"].includes(e.key)) {
      g.keys.right = down;
      e.preventDefault();
    } else if (down && (e.key === "Escape" || e.key === "p" || e.key === "P")) {
      if (phase === "playing") pause();
      else if (phase === "paused") resume();
    }
  };

  const tip = result?.lastToxic ? TIPS[result.lastToxic] : TIPS.chocolate;
  const timePct = (hud.left / 60) * 100;

  return (
    <div ref={wrapRef} className="mx-auto w-full max-w-[min(100%,calc((100dvh-200px)*0.5625))]">
      {/* Marcador */}
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-sm text-ink-soft">Puntos</p>
          <p className="tnum text-3xl font-bold leading-none text-teal-900">
            {hud.score}
            {hud.combo > 1 && phase === "playing" && (
              <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 align-middle text-sm text-[var(--on-accent)]">x{hud.combo}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1" aria-label={`${hud.lives} de ${LIVES} vidas`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <PawPrint key={i} weight="fill" size={26} className={i < hud.lives ? "text-teal-700" : "text-line"} aria-hidden="true" />
          ))}
        </div>
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
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-ground-2" aria-hidden="true">
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${timePct}%` }} />
      </div>

      {/* Campo de juego */}
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[var(--radius-toy)] shadow-[inset_0_-5px_0_var(--field-lip),0_16px_32px_-18px_rgb(4_42_43/0.6)]">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Campo de juego. Usa las flechas izquierda y derecha, el mouse o tu dedo para mover el plato."
          className="block h-full w-full touch-none select-none outline-none focus-visible:ring-4 focus-visible:ring-sun-400"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onKeyDown={(e) => onKey(e, true)}
          onKeyUp={(e) => onKey(e, false)}
        />

        {phase !== "playing" && (
          <div className="on-field absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-teal-950/70 px-6 py-4 text-center text-white backdrop-blur-[2px]">
            {phase === "intro" && (
              <>
                <h2 className="text-3xl font-bold [font-variation-settings:'wght'_740]">Lluvia de premios</h2>
                <p className="mt-3 max-w-[28ch] text-white/90">
                  Mueve el plato de Maya y atrapa los snacks. Ojo con el chocolate, las uvas y la cebolla: les hacen daño.
                </p>
                <ul className="mt-4 space-y-1 text-sm text-white/85">
                  <li>Celular: arrastra el dedo</li>
                  <li>Computador: mouse o flechas ← →</li>
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
                <p className="mt-2 text-white/85">Maya te espera con el plato listo.</p>
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
                  {result.caught} snacks atrapados · mejor racha {result.bestCombo}
                </p>
                <p className="mt-5 max-w-[30ch] rounded-2xl bg-white/12 px-4 py-3 text-sm text-white">
                  <span className="font-semibold">¿Sabías?</span> {tip}
                </p>
                {!onFinish && <ScoreSave key={result.seed} score={result.score} onSave={onSaveName} boardTitle={boardTitle} />}
                {busy && <p className="mt-4 text-white/85">Guardando tu puntaje…</p>}
                {serverMsg && <p className="mt-4 font-semibold text-[var(--accent)]" role="status">{serverMsg}</p>}
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
          mode="lados"
          paused={phase === "paused"}
          onPause={phase === "playing" ? pause : resume}
          onPress={(d) => {
            const g = game.current;
            if (!g) return;
            if (d === "left") g.keys.left = true;
            if (d === "right") g.keys.right = true;
          }}
          onRelease={(d) => {
            const g = game.current;
            if (!g) return;
            if (d === "left") g.keys.left = false;
            if (d === "right") g.keys.right = false;
          }}
        />
      )}
    </div>
  );
}
