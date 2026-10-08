import { H, ITEMS, PLATE_HALF, PLATE_Y, W, type GameState, type Item, type ItemKind } from "@maya/api/game";

/**
 * Dibujo de "Lluvia de premios" en canvas. Formas simples propias (sin arte de terceros).
 * Los colores del campo y del acento salen de las variables CSS: el juego se viste con la temporada.
 */

export interface Palette {
  field: string;
  fieldLip: string;
  accent: string;
  accentLip: string;
}

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    field: v("--field", "#0f6267"),
    fieldLip: v("--field-lip", "#073f40"),
    accent: v("--accent", "#feca0c"),
    accentLip: v("--accent-lip", "#c99d00"),
  };
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

function paw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.25, s * 0.42, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of [
    [-0.42, -0.2],
    [-0.15, -0.48],
    [0.15, -0.48],
    [0.42, -0.2],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, y + dy * s, s * 0.14, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item, tick: number, pal: Palette) {
  const { x, y } = item;
  const r = ITEMS[item.kind].radius;
  ctx.save();
  ctx.translate(x, y);
  const kind: ItemKind = item.kind;

  if (ITEMS[kind].toxic) {
    // Aviso: anillo rojo punteado alrededor de lo tóxico.
    ctx.strokeStyle = "rgba(232, 74, 60, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  switch (kind) {
    case "croqueta": {
      ctx.rotate((item.id % 7) * 0.6);
      ctx.fillStyle = "#a8692f";
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c98a4b";
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.2, r * 0.35, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "galleta": {
      ctx.fillStyle = "#e2b56b";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c48f3e";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#8c5a26";
      for (const [dx, dy] of [
        [-0.4, -0.3],
        [0.35, -0.25],
        [0, 0.15],
        [-0.25, 0.45],
        [0.4, 0.35],
      ] as const) {
        ctx.beginPath();
        ctx.arc(dx * r, dy * r, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "hueso": {
      ctx.rotate(Math.sin((tick + item.id * 13) / 18) * 0.5);
      ctx.fillStyle = "#fbfaf5";
      ctx.strokeStyle = "#cfd8d6";
      ctx.lineWidth = 2;
      roundRect(ctx, -r * 0.75, -r * 0.22, r * 1.5, r * 0.44, r * 0.2);
      ctx.fill();
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * r * 0.82, sy * r * 0.26, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    }
    case "estrella": {
      ctx.rotate(tick / 30);
      ctx.shadowColor = pal.accent;
      ctx.shadowBlur = 16;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = pal.accentLip;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "chocolate": {
      ctx.rotate(-0.2);
      ctx.fillStyle = "#5b3a29";
      roundRect(ctx, -r * 0.8, -r * 0.6, r * 1.6, r * 1.2, 4);
      ctx.fill();
      ctx.strokeStyle = "#3d261a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(0, r * 0.6);
      ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, 0);
      ctx.stroke();
      ctx.fillStyle = "#c0392b";
      roundRect(ctx, -r * 0.8, r * 0.2, r * 1.6, r * 0.4, 3);
      ctx.fill();
      break;
    }
    case "uvas": {
      ctx.fillStyle = "#6b3fa0";
      ctx.strokeStyle = "#4a2a72";
      ctx.lineWidth = 1.5;
      for (const [dx, dy] of [
        [-0.4, -0.35],
        [0.05, -0.4],
        [0.45, -0.3],
        [-0.2, 0.05],
        [0.25, 0.05],
        [0.02, 0.45],
      ] as const) {
        ctx.beginPath();
        ctx.arc(dx * r, dy * r, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#4f8a3a";
      ctx.beginPath();
      ctx.ellipse(r * 0.1, -r * 0.85, r * 0.3, r * 0.14, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "cebolla": {
      ctx.fillStyle = "#c98bb9";
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.9, r * 0.8, 0, r * 0.85);
      ctx.bezierCurveTo(-r * 0.9, r * 0.8, -r * 0.9, -r * 0.2, 0, -r);
      ctx.fill();
      ctx.strokeStyle = "#9b5f8c";
      ctx.lineWidth = 1.5;
      for (const k of [-0.35, 0, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85);
        ctx.quadraticCurveTo(k * r * 1.6, 0, k * r * 0.6, r * 0.8);
        ctx.stroke();
      }
      ctx.strokeStyle = "#6d8f43";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, -r * 1.35);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** El plato de Maya: ella es invisible, solo se ven su sombra y sus patas sosteniéndolo. */
function drawPlate(ctx: CanvasRenderingContext2D, x: number, pal: Palette, hurt: number) {
  const y = PLATE_Y;
  const shake = hurt > 0 ? Math.sin(hurt * 1.7) * 5 : 0;
  ctx.save();
  ctx.translate(x + shake, y);

  // Sombra de Maya en el piso.
  const g = ctx.createRadialGradient(0, 64, 4, 0, 64, 70);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 64, 70, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Patas que sostienen el plato.
  paw(ctx, -PLATE_HALF - 4, 22, 18, pal.accent);
  paw(ctx, PLATE_HALF + 4, 22, 18, pal.accent);

  // Plato: borde amarillo, cuerpo verde.
  ctx.fillStyle = "#0f6267";
  ctx.beginPath();
  ctx.moveTo(-PLATE_HALF, 0);
  ctx.lineTo(PLATE_HALF, 0);
  ctx.lineTo(PLATE_HALF - 10, 26);
  ctx.quadraticCurveTo(0, 34, -PLATE_HALF + 10, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hurt > 0 ? "#e84a3c" : pal.accent;
  ctx.beginPath();
  ctx.ellipse(0, 0, PLATE_HALF + 4, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 1, PLATE_HALF - 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  pal: Palette,
  floaters: Floater[],
  hurt: number,
) {
  // Campo.
  ctx.fillStyle = pal.field;
  ctx.fillRect(0, 0, W, H);
  // Franjas de pasto, quietas: dan profundidad sin distraer.
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 80, W, 40);
  // Piso.
  ctx.fillStyle = pal.fieldLip;
  ctx.fillRect(0, PLATE_Y + 52, W, H - PLATE_Y - 52);

  for (const item of state.items) drawItem(ctx, item, state.tick, pal);
  drawPlate(ctx, state.plateX, pal, hurt);

  ctx.textAlign = "center";
  ctx.font = "700 20px 'Rubik Variable', system-ui, sans-serif";
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, f.life / 40);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
