import { COLS, MAP, ROWS, SUB, type CasaState, type Dir, type Enemy } from "@maya/api/game/casa";
import type { Palette } from "./draw";

/**
 * Dibujo de "Maya en casa". Arte propio con formas simples:
 * muebles como paredes, croquetas, hueso dorado y cuatro "enemigos de casa".
 */

export const CELL = 20;
export const CW = COLS * CELL;
export const CH = ROWS * CELL;

export interface Trail {
  x: number;
  y: number;
  angle: number;
  life: number;
  side: number;
}

const ANGLE: Record<Dir, number> = { 0: 0, 1: -Math.PI / 2, 2: 0, 3: Math.PI / 2, 4: Math.PI };

const isWall = (x: number, y: number) => {
  const c = MAP[y]?.[x];
  return c === undefined || c === "#";
};

function paw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.22, s * 0.38, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of [
    [-0.38, -0.18],
    [-0.13, -0.42],
    [0.13, -0.42],
    [0.38, -0.18],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(dx * s, dy * s, s * 0.12, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Fondo estático (piso y muebles): se dibuja una vez en un canvas aparte. */
export function drawHouse(pal: Palette): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = pal.field;
  ctx.fillRect(0, 0, CW, CH);
  // Baldosas sutiles.
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

  // Muebles: bloques con borde redondeado que se unen con sus vecinos.
  ctx.fillStyle = pal.fieldLip;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isWall(x, y)) continue;
      const px = x * CELL;
      const py = y * CELL;
      const r = 6;
      const tl = !isWall(x - 1, y) && !isWall(x, y - 1) ? r : 0;
      const tr = !isWall(x + 1, y) && !isWall(x, y - 1) ? r : 0;
      const br = !isWall(x + 1, y) && !isWall(x, y + 1) ? r : 0;
      const bl = !isWall(x - 1, y) && !isWall(x, y + 1) ? r : 0;
      ctx.beginPath();
      ctx.roundRect(px, py, CELL, CELL, [tl, tr, br, bl]);
      ctx.fill();
    }
  }
  // Brillo superior de los muebles (labio de caucho al revés).
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) if (isWall(x, y) && !isWall(x, y - 1) && y > 0) ctx.fillRect(x * CELL + 2, y * CELL + 1, CELL - 4, 3);

  // Puerta del lavadero.
  MAP.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "=") {
        ctx.fillStyle = pal.accent;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x * CELL + 2, y * CELL + CELL / 2 - 2, CELL - 4, 4);
        ctx.globalAlpha = 1;
      }
    }),
  );
  return c;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, tick: number, scaredEnding: boolean) {
  const x = (e.x / SUB) * CELL + CELL / 2;
  const y = (e.y / SUB) * CELL + CELL / 2;
  ctx.save();
  ctx.translate(x + (e.scared ? Math.sin(tick * 0.9) * 1.5 : 0), y);
  if (e.scared) {
    ctx.globalAlpha = scaredEnding && Math.floor(tick / 8) % 2 ? 0.9 : 0.55;
    ctx.scale(0.85, 0.85);
  }
  const s = CELL * 0.48;
  switch (e.kind) {
    case "aspiradora": {
      ctx.fillStyle = "#b9c4c6";
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4b5a5c";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#4b5a5c";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.floor(tick / 15) % 2 ? "#ff5a4f" : "#ffb3ad";
      ctx.beginPath();
      ctx.arc(s * 0.55, -s * 0.45, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "manguera": {
      ctx.strokeStyle = "#3f9b4f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.3) {
        const rr = (a / (Math.PI * 5)) * s;
        ctx.lineTo(Math.cos(a + tick * 0.05) * rr, Math.sin(a + tick * 0.05) * rr);
      }
      ctx.stroke();
      ctx.fillStyle = "#e8b931";
      ctx.fillRect(s * 0.6, -3, 6, 6);
      ctx.fillStyle = "#7fd3f0";
      ctx.beginPath();
      ctx.arc(s + 4, (tick % 20) / 3 - 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "secador": {
      ctx.fillStyle = "#e7849f";
      ctx.beginPath();
      ctx.arc(-s * 0.15, -s * 0.15, s * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(s * 0.2, -s * 0.45, s * 0.75, s * 0.6);
      ctx.fillStyle = "#b4536f";
      ctx.fillRect(-s * 0.3, s * 0.2, s * 0.3, s * 0.75);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const o = ((tick / 4 + i * 4) % 8) + 2;
        ctx.beginPath();
        ctx.moveTo(s * 0.95 + o, -s * 0.35);
        ctx.lineTo(s * 0.95 + o, s * 0.05);
        ctx.stroke();
      }
      break;
    }
    case "cartero": {
      ctx.fillStyle = "#f4efe6";
      ctx.fillRect(-s, -s * 0.65, s * 2, s * 1.3);
      ctx.strokeStyle = "#7b6d55";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s, -s * 0.65, s * 2, s * 1.3);
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.65);
      ctx.lineTo(0, s * 0.1);
      ctx.lineTo(s, -s * 0.65);
      ctx.stroke();
      ctx.fillStyle = "#d8453a";
      ctx.fillRect(s * 0.45, -s * 0.55, s * 0.4, s * 0.35);
      break;
    }
  }
  ctx.restore();
  if (e.scared) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 11px 'Rubik Variable', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("!", x, y - CELL * 0.55);
  }
}

export function drawCasa(
  ctx: CanvasRenderingContext2D,
  house: HTMLCanvasElement,
  state: CasaState,
  pal: Palette,
  trail: Trail[],
  floaters: { x: number; y: number; text: string; life: number }[],
) {
  ctx.drawImage(house, 0, 0);

  // Comida.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const f = state.food[y * COLS + x];
      if (!f) continue;
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;
      if (f === 1) {
        ctx.fillStyle = "#c98a4b";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 2.6, 2, 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const pulse = 1 + Math.sin(state.tick / 8) * 0.12;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);
        ctx.rotate(-0.5);
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.roundRect(-5, -1.8, 10, 3.6, 1.5);
        ctx.fill();
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * 5.5, sy * 2, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // Huellas que Maya va dejando.
  for (const t of trail) {
    ctx.globalAlpha = Math.max(0, Math.min(0.7, t.life / 40));
    const ox = Math.cos(t.angle + Math.PI / 2) * 3 * t.side;
    const oy = Math.sin(t.angle + Math.PI / 2) * 3 * t.side;
    paw(ctx, t.x + ox, t.y + oy, 7, pal.accent, t.angle);
  }
  ctx.globalAlpha = 1;

  // Maya: sombra + dos patas hacia donde va.
  const mx = (state.maya.x / SUB) * CELL + CELL / 2;
  const my = (state.maya.y / SUB) * CELL + CELL / 2;
  const powered = state.tick < state.powerUntil;
  const g = ctx.createRadialGradient(mx, my + 2, 1, mx, my + 2, CELL * 0.75);
  g.addColorStop(0, powered ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(mx, my + 2, CELL * 0.75, CELL * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  const a = ANGLE[state.maya.dir || 2];
  const fx = Math.cos(a) * 4;
  const fy = Math.sin(a) * 4;
  const px = Math.cos(a + Math.PI / 2) * 4;
  const py = Math.sin(a + Math.PI / 2) * 4;
  paw(ctx, mx + fx + px, my + fy + py, 7, pal.accent, a);
  paw(ctx, mx + fx - px, my + fy - py, 7, pal.accent, a);
  if (powered) {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(state.tick / 4) * 0.3;
    ctx.beginPath();
    ctx.arc(mx, my, CELL * 0.85 + ((state.tick % 30) / 30) * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Enemigos.
  const ending = state.powerUntil - state.tick < 90;
  for (const e of state.enemies) drawEnemy(ctx, e, state.tick, ending);

  // Textos flotantes.
  ctx.textAlign = "center";
  ctx.font = "700 13px 'Rubik Variable', system-ui, sans-serif";
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, f.life / 40);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
