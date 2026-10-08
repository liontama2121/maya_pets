// Prepara los logos de MAYA Pets para la web SIN redibujarlos.
//
// Los archivos entregados traen el "fondo transparente" pintado (cuadriculado dentro de la imagen):
//   - logo1.jpg: círculo verde. Se recorta exactamente el círculo (fuera = transparente).
//   - logo2.png: letras blancas y amarillas. Se conserva solo la tinta de las letras.
// Colores y proporciones no se tocan. También mide los HEX reales de la marca.
//
// Uso (desde la raíz): node apps/web/scripts/prepare-logos.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import pngjs from "pngjs";

const { PNG } = pngjs;
const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const out = resolve(root, "apps/web/public/brand");
mkdirSync(out, { recursive: true });

const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Reducción con promedio de área (sin dependencias). */
function resize(src, sw, sh, dw, dh) {
  const dst = new Uint8Array(dw * dh * 4);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * sw + xx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += src[i + 3]; n++;
        }
      }
      const o = (y * dw + x) * 4;
      const at = a / n;
      const k = at > 0 ? 255 / (a / n) / 1 : 0;
      dst[o] = Math.round((r / n) * k);
      dst[o + 1] = Math.round((g / n) * k);
      dst[o + 2] = Math.round((b / n) * k);
      dst[o + 3] = Math.round(at);
    }
  }
  return dst;
}

function savePng(path, data, w, h) {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data);
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
  console.log("  ", path.replace(root, "."), `${w}x${h}`);
}

/* ------------------------- logo1: círculo verde ------------------------- */
const j = jpeg.decode(readFileSync(resolve(root, "logo1.jpg")), { useTArray: true });
const W1 = j.width, H1 = j.height;
const at1 = (x, y) => { const i = (y * W1 + x) * 4; return [j.data[i], j.data[i + 1], j.data[i + 2]]; };

// Verde de marca: promedio de una zona lisa del círculo.
let tr = 0, tg = 0, tb = 0, tn = 0;
for (let y = 260; y < 340; y++) for (let x = 980; x < 1070; x++) { const [r, g, b] = at1(x, y); tr += r; tg += g; tb += b; tn++; }
const teal = [tr / tn, tg / tn, tb / tn];
const isTeal = ([r, g, b]) => Math.hypot(r - teal[0], g - teal[1], b - teal[2]) < 45;

// Bordes del círculo en la fila y columna centrales.
const cy0 = Math.round(H1 / 2), cx0 = Math.round(W1 / 2);
let L = 0; while (L < W1 && !isTeal(at1(L, cy0))) L++;
let R = W1 - 1; while (R > 0 && !isTeal(at1(R, cy0))) R--;
let T = 0; while (T < H1 && !isTeal(at1(cx0, T))) T++;
let B = H1 - 1; while (B > 0 && !isTeal(at1(cx0, B))) B--;
const cx = (L + R) / 2, cy = (T + B) / 2;
const radius = Math.min(R - L, B - T) / 2 - 2; // 2 px hacia adentro: evita el halo del cuadriculado
console.log(`logo1: círculo centro ${cx.toFixed(1)},${cy.toFixed(1)} radio ${radius.toFixed(1)}`);

const size = Math.ceil(radius * 2);
const circle = new Uint8Array(size * size * 4);
const ox = Math.round(cx - radius), oy = Math.round(cy - radius);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const sx = ox + x, sy = oy + y;
    const d = Math.hypot(sx + 0.5 - cx, sy + 0.5 - cy);
    const a = clamp01(radius - d + 0.5);
    const o = (y * size + x) * 4;
    if (a <= 0 || sx < 0 || sy < 0 || sx >= W1 || sy >= H1) continue;
    const [r, g, b] = at1(sx, sy);
    circle[o] = r; circle[o + 1] = g; circle[o + 2] = b; circle[o + 3] = Math.round(a * 255);
  }
}

/* ------------------------ logo2: letras sin fondo ------------------------ */
const p = PNG.sync.read(readFileSync(resolve(root, "logo2.png")));
const W2 = p.width, H2 = p.height;
const word = new Uint8Array(W2 * H2 * 4);
let yr = 0, yg = 0, yb = 0, yn = 0;
for (let i = 0; i < W2 * H2; i++) {
  const r = p.data[i * 4], g = p.data[i * 4 + 1], b = p.data[i * 4 + 2];
  if (r > 200 && g > 160 && b < 60) { yr += r; yg += g; yb += b; yn++; }
}
const yellow = [yr / yn, yg / yn, yb / yn];

let minX = W2, minY = H2, maxX = 0, maxY = 0;
for (let i = 0; i < W2 * H2; i++) {
  const r = p.data[i * 4], g = p.data[i * 4 + 1], b = p.data[i * 4 + 2];
  // Amarillo: cuánto se aleja del gris (r - b alto).
  const yA = clamp01((r - b - 40) / 110);
  // Blanco: el cuadriculado llega hasta ~205, la letra está en ~250.
  const neutral = Math.abs(r - b) < 30;
  const wA = neutral ? clamp01((Math.min(r, g, b) - 212) / 32) : 0;
  const o = i * 4;
  if (yA > wA && yA > 0) {
    word[o] = yellow[0]; word[o + 1] = yellow[1]; word[o + 2] = yellow[2]; word[o + 3] = Math.round(yA * 255);
  } else if (wA > 0) {
    word[o] = 255; word[o + 1] = 255; word[o + 2] = 255; word[o + 3] = Math.round(wA * 255);
  } else continue;
  if (word[o + 3] > 40) {
    const x = i % W2, y = Math.floor(i / W2);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}
// Recorte a la tinta con un margen pequeño.
const pad = 8;
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
maxX = Math.min(W2 - 1, maxX + pad); maxY = Math.min(H2 - 1, maxY + pad);
const cw = maxX - minX + 1, ch = maxY - minY + 1;
const cropped = new Uint8Array(cw * ch * 4);
for (let y = 0; y < ch; y++) cropped.set(word.subarray(((y + minY) * W2 + minX) * 4, ((y + minY) * W2 + minX + cw) * 4), y * cw * 4);

/* -------------------------------- Salidas -------------------------------- */
console.log("Archivos:");
// Letras: 2x para el encabezado (alto visible ~48 px) y una grande para el pie.
const wordH = 112, wordW = Math.round((cw / ch) * wordH);
savePng(resolve(out, "maya-logo.png"), resize(cropped, cw, ch, wordW, wordH), wordW, wordH);
const bigH = 240, bigW = Math.round((cw / ch) * bigH);
savePng(resolve(out, "maya-logo-lg.png"), resize(cropped, cw, ch, bigW, bigH), bigW, bigH);
// Círculo: insignia, favicon e ícono de iPhone.
savePng(resolve(out, "maya-logo-circle.png"), resize(circle, size, size, 512, 512), 512, 512);
savePng(resolve(out, "favicon.png"), resize(circle, size, size, 64, 64), 64, 64);
savePng(resolve(out, "apple-touch-icon.png"), resize(circle, size, size, 180, 180), 180, 180);

// Imagen para compartir (WhatsApp/redes): fondo verde de marca con el círculo al centro.
const OGW = 1200, OGH = 630, C = 520;
const og = new Uint8Array(OGW * OGH * 4);
for (let i = 0; i < OGW * OGH; i++) { og[i * 4] = teal[0]; og[i * 4 + 1] = teal[1]; og[i * 4 + 2] = teal[2]; og[i * 4 + 3] = 255; }
const small = resize(circle, size, size, C, C);
const offX = (OGW - C) / 2, offY = (OGH - C) / 2;
for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
  const s = (y * C + x) * 4, d = ((y + offY) * OGW + x + offX) * 4;
  const a = small[s + 3] / 255;
  for (let k = 0; k < 3; k++) og[d + k] = Math.round(small[s + k] * a + og[d + k] * (1 - a));
}
savePng(resolve(out, "og-maya.png"), og, OGW, OGH);

console.log(`\nColores medidos en el logo:\n  verde petróleo ${hex(...teal)}\n  amarillo       ${hex(...yellow)}`);
