/**
 * "Lluvia de premios": simulación determinista.
 *
 * La MISMA función corre en el navegador (para jugar) y en el servidor (para validar):
 * con la misma semilla y los mismos movimientos del plato, el puntaje es idéntico.
 * Sin DOM, sin Math.random, sin fechas: solo enteros y un generador con semilla.
 */

export const W = 360;
export const H = 640;
export const TICKS_PER_SECOND = 60;
export const DURATION_TICKS = 60 * TICKS_PER_SECOND;
export const LIVES = 3;

export const PLATE_Y = H - 92;
export const PLATE_HALF = 40;
/** Velocidad máxima del plato por tick: evita "teletransportarse" con trampas. */
export const PLATE_MAX_STEP = 16;

export type ItemKind = "croqueta" | "galleta" | "hueso" | "estrella" | "chocolate" | "uvas" | "cebolla";

export const ITEMS: Record<ItemKind, { points: number; toxic: boolean; radius: number; label: string }> = {
  croqueta: { points: 5, toxic: false, radius: 13, label: "Croqueta" },
  galleta: { points: 10, toxic: false, radius: 16, label: "Galleta" },
  hueso: { points: 15, toxic: false, radius: 18, label: "Hueso" },
  estrella: { points: 50, toxic: false, radius: 17, label: "Premio dorado" },
  chocolate: { points: 0, toxic: true, radius: 18, label: "Chocolate" },
  uvas: { points: 0, toxic: true, radius: 18, label: "Uvas" },
  cebolla: { points: 0, toxic: true, radius: 17, label: "Cebolla" },
};

export const TIPS: Record<"chocolate" | "uvas" | "cebolla", string> = {
  chocolate: "El chocolate tiene teobromina: es tóxico para perros y gatos, incluso en poca cantidad.",
  uvas: "Las uvas y las uvas pasas pueden dañar los riñones de los perros. Mejor nunca.",
  cebolla: "La cebolla y el ajo dañan los glóbulos rojos de perros y gatos, crudos o cocidos.",
};

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  /** Velocidad vertical en unidades por tick ×100 (enteros para ser deterministas). */
  vy100: number;
  /** Deriva horizontal ×100. */
  vx100: number;
  y100: number;
  x100: number;
}

export type GameEvent =
  | { t: "catch"; kind: ItemKind; x: number; points: number; combo: number }
  | { t: "toxic"; kind: ItemKind; x: number }
  | { t: "miss"; kind: ItemKind; x: number }
  | { t: "end"; reason: "time" | "lives" };

export interface GameState {
  tick: number;
  rng: number;
  nextId: number;
  plateX: number;
  items: Item[];
  score: number;
  lives: number;
  combo: number;
  bestCombo: number;
  caught: number;
  over: boolean;
  lastToxic: "chocolate" | "uvas" | "cebolla" | null;
  spawnIn: number;
}

/** mulberry32: rápido, determinista y con estado de 32 bits. */
function nextRandom(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randInt(state: GameState, min: number, max: number) {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function createGame(seed: number): GameState {
  return {
    tick: 0,
    rng: seed | 0,
    nextId: 1,
    plateX: W / 2,
    items: [],
    score: 0,
    lives: LIVES,
    combo: 0,
    bestCombo: 0,
    caught: 0,
    over: false,
    lastToxic: null,
    spawnIn: 40,
  };
}

/** Dificultad de 0 a 1 según el tiempo jugado. */
function difficulty(tick: number) {
  return Math.min(1, tick / DURATION_TICKS);
}

function pickKind(state: GameState): ItemKind {
  const d = difficulty(state.tick);
  const roll = nextRandom(state);
  const toxicChance = 0.16 + d * 0.16; // 16% → 32%
  if (roll < toxicChance) {
    const r = randInt(state, 0, 2);
    return r === 0 ? "chocolate" : r === 1 ? "uvas" : "cebolla";
  }
  const s = nextRandom(state);
  if (s < 0.04) return "estrella";
  if (s < 0.3) return "hueso";
  if (s < 0.62) return "galleta";
  return "croqueta";
}

function spawn(state: GameState) {
  const kind = pickKind(state);
  const r = ITEMS[kind].radius;
  const d = difficulty(state.tick);
  const x = randInt(state, r + 6, W - r - 6);
  const base = 220 + Math.floor(d * 260); // velocidad ×100 por tick
  state.items.push({
    id: state.nextId++,
    kind,
    x,
    y: -r,
    x100: x * 100,
    y100: -r * 100,
    vy100: base + randInt(state, 0, 120),
    vx100: d > 0.4 ? randInt(state, -40, 40) : 0,
  });
  // Cada vez caen más seguido: de ~0,8 s a ~0,3 s entre objetos.
  state.spawnIn = Math.max(16, 48 - Math.floor(d * 30)) + randInt(state, 0, 10);
}

/**
 * Avanza un tick. `targetX` es hacia dónde quiere ir el plato (puntero o teclado).
 * Devuelve los eventos del tick para sonidos y efectos.
 */
export function step(state: GameState, targetX: number): GameEvent[] {
  if (state.over) return [];
  const events: GameEvent[] = [];

  // Plato: se mueve hacia el objetivo con velocidad máxima.
  const want = Math.max(PLATE_HALF, Math.min(W - PLATE_HALF, Math.round(targetX)));
  const delta = Math.max(-PLATE_MAX_STEP, Math.min(PLATE_MAX_STEP, want - state.plateX));
  state.plateX += delta;

  state.spawnIn -= 1;
  if (state.spawnIn <= 0) spawn(state);

  const keep: Item[] = [];
  for (const item of state.items) {
    const prevY = item.y;
    item.y100 += item.vy100;
    item.x100 += item.vx100;
    item.y = Math.round(item.y100 / 100);
    item.x = Math.round(item.x100 / 100);
    const def = ITEMS[item.kind];
    if (item.x < def.radius || item.x > W - def.radius) {
      item.vx100 = -item.vx100;
    }

    // ¿Cruzó la línea del plato en este tick?
    const crossed = prevY < PLATE_Y && item.y >= PLATE_Y;
    if (crossed && Math.abs(item.x - state.plateX) <= PLATE_HALF + def.radius - 6) {
      if (def.toxic) {
        state.lives -= 1;
        state.combo = 0;
        state.lastToxic = item.kind as GameState["lastToxic"];
        events.push({ t: "toxic", kind: item.kind, x: item.x });
      } else {
        state.combo = Math.min(state.combo + 1, 30);
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const mult = state.combo >= 15 ? 3 : state.combo >= 6 ? 2 : 1;
        const points = def.points * mult;
        state.score += points;
        state.caught += 1;
        events.push({ t: "catch", kind: item.kind, x: item.x, points, combo: mult });
      }
      continue;
    }

    if (item.y > H + def.radius) {
      if (!def.toxic) {
        state.combo = 0;
        events.push({ t: "miss", kind: item.kind, x: item.x });
      }
      continue;
    }
    keep.push(item);
  }
  state.items = keep;
  state.tick += 1;

  if (state.lives <= 0) {
    state.over = true;
    events.push({ t: "end", reason: "lives" });
  } else if (state.tick >= DURATION_TICKS) {
    state.over = true;
    events.push({ t: "end", reason: "time" });
  }
  return events;
}

/**
 * Movimientos del plato comprimidos: [tick, x] solo cuando cambia el objetivo.
 * Es lo que el navegador envía al servidor en lugar del puntaje.
 */
export type InputLog = [number, number][];

export interface ReplayResult {
  score: number;
  ticks: number;
  lives: number;
  caught: number;
  bestCombo: number;
}

/** Vuelve a jugar la partida completa a partir de la semilla y los movimientos. */
export function replay(seed: number, inputs: InputLog): ReplayResult {
  const state = createGame(seed);
  let target = W / 2;
  let i = 0;
  while (!state.over) {
    while (i < inputs.length && inputs[i]![0] <= state.tick) {
      target = inputs[i]![1];
      i += 1;
    }
    step(state, target);
  }
  return {
    score: state.score,
    ticks: state.tick,
    lives: state.lives,
    caught: state.caught,
    bestCombo: state.bestCombo,
  };
}
