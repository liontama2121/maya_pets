import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { useEffect, useState } from "react";

/**
 * Control en pantalla con aspecto de consola: plástico con relieve que se hunde al presionar.
 * - "cruceta": 4 direcciones (Maya en casa).
 * - "lados": izquierda/derecha que se mantienen presionadas (Lluvia de premios).
 */

export type PadDir = "up" | "right" | "down" | "left";

/** Muestra el control en celulares y pantallas angostas. */
export function useShowPad() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const sync = () => setShow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return show;
}

const PLASTIC =
  "bg-teal-800 text-white shadow-[inset_0_2px_0_rgb(255_255_255/0.18),inset_0_-6px_0_var(--color-teal-950),0_6px_14px_-6px_rgb(4_42_43/0.6)] transition-[transform,box-shadow] duration-75 select-none touch-none";
const PRESSED = "translate-y-[3px] shadow-[inset_0_2px_0_rgb(255_255_255/0.1),inset_0_-2px_0_var(--color-teal-950),0_2px_6px_-4px_rgb(4_42_43/0.6)]";

function Arrow({ dir }: { dir: PadDir }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return <CaretUp weight="fill" size={28} style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true" />;
}

function PadButton({
  dir,
  label,
  className,
  onPress,
  onRelease,
}: {
  dir: PadDir;
  label: string;
  className: string;
  onPress: (d: PadDir) => void;
  onRelease?: (d: PadDir) => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid place-items-center ${PLASTIC} ${down ? PRESSED : ""} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDown(true);
        navigator.vibrate?.(8);
        onPress(dir);
      }}
      onPointerUp={() => {
        setDown(false);
        onRelease?.(dir);
      }}
      onPointerCancel={() => {
        setDown(false);
        onRelease?.(dir);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Arrow dir={dir} />
    </button>
  );
}

export function GamePad({
  mode,
  onPress,
  onRelease,
  paused,
  onPause,
}: {
  mode: "cruceta" | "lados";
  onPress: (d: PadDir) => void;
  onRelease?: (d: PadDir) => void;
  paused: boolean;
  onPause: () => void;
}) {
  return (
    <div
      className="mt-4 flex items-center justify-between gap-4 rounded-[28px] bg-ground-2 px-5 py-4 shadow-[inset_0_2px_6px_rgb(4_42_43/0.15)]"
      aria-label="Control del juego"
    >
      {mode === "cruceta" ? (
        // Cruceta de una sola pieza: cuatro brazos alrededor de un centro.
        <div className="relative size-[168px] shrink-0">
          <span className={`absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-md ${PLASTIC}`} aria-hidden="true" />
          <PadButton dir="up" label="Arriba" onPress={onPress} className="absolute left-1/2 top-0 h-[60px] w-14 -translate-x-1/2 rounded-t-xl" />
          <PadButton dir="down" label="Abajo" onPress={onPress} className="absolute bottom-0 left-1/2 h-[60px] w-14 -translate-x-1/2 rounded-b-xl" />
          <PadButton dir="left" label="Izquierda" onPress={onPress} className="absolute left-0 top-1/2 h-14 w-[60px] -translate-y-1/2 rounded-l-xl" />
          <PadButton dir="right" label="Derecha" onPress={onPress} className="absolute right-0 top-1/2 h-14 w-[60px] -translate-y-1/2 rounded-r-xl" />
        </div>
      ) : (
        <div className="flex gap-3">
          <PadButton dir="left" label="Mover a la izquierda" onPress={onPress} onRelease={onRelease} className="size-20 rounded-full" />
          <PadButton dir="right" label="Mover a la derecha" onPress={onPress} onRelease={onRelease} className="size-20 rounded-full" />
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onPause}
          aria-label={paused ? "Seguir jugando" : "Pausar"}
          className="grid size-16 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[inset_0_2px_0_rgb(255_255_255/0.35),inset_0_-6px_0_var(--accent-lip),0_6px_14px_-6px_rgb(4_42_43/0.6)] active:translate-y-[3px] active:shadow-[inset_0_-2px_0_var(--accent-lip)]"
        >
          {paused ? <Play size={26} weight="fill" aria-hidden="true" /> : <Pause size={26} weight="fill" aria-hidden="true" />}
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{paused ? "Seguir" : "Pausa"}</span>
      </div>
    </div>
  );
}
