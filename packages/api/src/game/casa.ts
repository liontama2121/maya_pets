/**
 * "Maya en casa": laberinto propio (vista de una casa desde arriba).
 * Maya, invisible (sombra y huellas), recorre la casa comiendo croquetas.
 * La persiguen cosas que los perros odian: aspiradora, manguera, secador y cartero.
 * Hueso dorado: Maya ladra y por unos segundos ellos huyen.
 *
 * Simulación determinista por casillas: misma semilla + mismas direcciones = mismo puntaje.
 * Corre igual en el navegador (para jugar) y en el servidor (para validar).
 */

/** # mueble/pared · . croqueta · o hueso dorado · = puerta del lavadero (solo enemigos) · E lavadero · M inicio de Maya */
export const MAP = [
  "###################",
  "#o......###......o#",
  "#.####..###..####.#",
  "#.#.....###.....#.#",
  "#.#.###.....###.#.#",
  "#...#...#.#...#...#",
  "###.#.###.###.#.###",
  "#.....#.....#.....#",
  "#.###.#.##=##.###.#",
  "#.....#.#EEE#.....#",
  "#.###.#.#####.###.#",
  "#.....#...M.......#",
  "###.#.###.###.#.###",
  "#...#...#.#...#...#",
  "#.#.###.....###.#.#",
  "#.#.....###.....#.#",
  "#.####..###..####.#",
  "#o......###......o#",
  "###################",
] as const;

export const COLS = MAP[0].length;
export const ROWS = MAP.length;
/** Subdivisiones por casilla: el movimiento es suave pero entero. */
export const SUB = 8;
export const TICKS_PER_SECOND = 60;
export const MAX_TICKS = 3 * 60 * TICKS_PER_SECOND; // 3 minutos máximo por partida
export const LIVES = 3;
const POWER_TICKS = 6 * TICKS_PER_SECOND;
const FREEZE_TICKS = 70;

export type Dir = 0 | 1 | 2 | 3 | 4; // 0 quieto, 1 arriba, 2 derecha, 3 abajo, 4 izquierda
const DX = [0, 0, 1, 0, -1] as const;
const DY = [0, -1, 0, 1, 0] as const;
const REVERSE: Record<Dir, Dir> = { 0: 0, 1: 3, 2: 4, 3: 1, 4: 2 };

export type EnemyKind = "aspiradora" | "manguera" | "secador" | "cartero";
export const ENEMY_KINDS: EnemyKind[] = ["aspiradora", "manguera", "secador", "cartero"];
export const ENEMY_LABEL: Record<EnemyKind, string> = {
  aspiradora: "Aspiradora",
  manguera: "Manguera",
  secador: "Secador",
  cartero: "Cartero",
};

export interface Mover {
  /** Posición en sub-casillas (casilla × SUB). */
  x: number;
  y: number;
  dir: Dir;
  acc: number;
}

export interface Enemy extends Mover {
  kind: EnemyKind;
  /** Tick en que sale del lavadero. */
  releaseAt: number;
  scared: boolean;
}

export type CasaEvent =
  | { t: "croqueta" }
  | { t: "hueso" }
  | { t: "espanta"; kind: EnemyKind; points: number; x: number; y: number }
  | { t: "atrapada"; kind: EnemyKind }
  | { t: "nivel"; level: number }
  | { t: "end"; reason: "time" | "lives" };

export interface CasaState {
  tick: number;
  rng: number;
  level: number;
  score: number;
  lives: number;
  maya: Mover;
  want: Dir;
  enemies: Enemy[];
  /** Casillas con croqueta (1) u hueso (2). */
  food: Uint8Array;
  foodLeft: number;
  powerUntil: number;
  chain: number;
  freezeUntil: number;
  over: boolean;
  eaten: number;
}

const idx = (cx: number, cy: number) => cy * COLS + cx;
const cell = (cx: number, cy: number) => (cy < 0 || cy >= ROWS || cx < 0 || cx >= COLS ? "#" : MAP[cy]![cx]!);

function find(ch: string): [number, number][] {
  const out: [number, number][] = [];
  MAP.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push([x, y])));
  return out;
}
const MAYA_START = find("M")[0]!;
const PEN = find("E");
const DOOR = find("=")[0]!;

function nextRandom(state: CasaState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function freshFood(): { food: Uint8Array; left: number } {
  const food = new Uint8Array(COLS * ROWS);
  let left = 0;
  MAP.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ".") (food[idx(x, y)] = 1), left++;
      else if (c === "o") (food[idx(x, y)] = 2), left++;
    }),
  );
  return { food, left };
}

function placeActors(state: CasaState) {
  state.maya = { x: MAYA_START[0] * SUB, y: MAYA_START[1] * SUB, dir: 0, acc: 0 };
  state.want = 0;
  state.enemies = ENEMY_KINDS.map((kind, i) => {
    const [px, py] = PEN[i % PEN.length]!;
    return {
      kind,
      x: px * SUB,
      y: py * SUB,
      dir: 1 as Dir,
      acc: 0,
      releaseAt: state.tick + TICKS_PER_SECOND * (1 + i * 3),
      scared: false,
    };
  });
  state.powerUntil = 0;
  state.chain = 0;
}

export function createCasa(seed: number): CasaState {
  const { food, left } = freshFood();
  const state: CasaState = {
    tick: 0,
    rng: seed | 0,
    level: 1,
    score: 0,
    lives: LIVES,
    maya: { x: 0, y: 0, dir: 0, acc: 0 },
    want: 0,
    enemies: [],
    food,
    foodLeft: left,
    powerUntil: 0,
    chain: 0,
    freezeUntil: 60,
    over: false,
    eaten: 0,
  };
  placeActors(state);
  return state;
}

const atCenter = (m: Mover) => m.x % SUB === 0 && m.y % SUB === 0;

function walkable(cx: number, cy: number, enemy: boolean, leaving: boolean) {
  const c = cell(cx, cy);
  if (c === "#") return false;
  if (c === "=" || c === "E") return enemy && leaving;
  return true;
}

/** Avanza un móvil `speed` centésimas de sub-casilla; decide giros en el centro de cada casilla. */
function advance(m: Mover, speed: number, choose: (cx: number, cy: number) => Dir, canEnter: (cx: number, cy: number) => boolean) {
  m.acc += speed;
  while (m.acc >= 100) {
    m.acc -= 100;
    if (atCenter(m)) {
      const cx = m.x / SUB;
      const cy = m.y / SUB;
      const next = choose(cx, cy);
      m.dir = next;
      if (next === 0 || !canEnter(cx + DX[next], cy + DY[next])) {
        m.dir = 0;
        m.acc = 0;
        return;
      }
    }
    m.x += DX[m.dir];
    m.y += DY[m.dir];
  }
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

function enemyTarget(state: CasaState, e: Enemy): [number, number] {
  const mx = Math.round(state.maya.x / SUB);
  const my = Math.round(state.maya.y / SUB);
  switch (e.kind) {
    case "aspiradora":
      return [mx, my];
    case "secador":
      return [mx + DX[state.maya.dir] * 4, my + DY[state.maya.dir] * 4];
    case "cartero": {
      const ex = e.x / SUB;
      const ey = e.y / SUB;
      return dist2(ex, ey, mx, my) > 36 ? [1, ROWS - 2] : [mx, my];
    }
    case "manguera":
      return [mx, my]; // se usa solo si no deambula
  }
}

function chooseEnemyDir(state: CasaState, e: Enemy, cx: number, cy: number): Dir {
  const leaving = state.tick >= e.releaseAt;
  const inPen = cell(cx, cy) === "E" || cell(cx, cy) === "=";
  // La puerta del lavadero es solo de salida: afuera nunca se vuelve a entrar.
  const canUsePen = leaving && inPen;
  const options: Dir[] = ([1, 2, 3, 4] as Dir[]).filter(
    (d) => walkable(cx + DX[d], cy + DY[d], true, canUsePen) && d !== REVERSE[e.dir],
  );
  const all = options.length ? options : ([1, 2, 3, 4] as Dir[]).filter((d) => walkable(cx + DX[d], cy + DY[d], true, canUsePen));
  if (!all.length) return 0;

  // En el lavadero: ir hacia la puerta.
  if (inPen) {
    let best = all[0]!;
    let bestD = Infinity;
    for (const d of all) {
      const dd = dist2(cx + DX[d], cy + DY[d], DOOR[0], DOOR[1] - 1);
      if (dd < bestD) (bestD = dd), (best = d);
    }
    return best;
  }

  if (e.scared) {
    let best = all[0]!;
    let bestD = -1;
    const mx = state.maya.x / SUB;
    const my = state.maya.y / SUB;
    for (const d of all) {
      const dd = dist2(cx + DX[d], cy + DY[d], mx, my);
      if (dd > bestD) (bestD = dd), (best = d);
    }
    return best;
  }

  if (e.kind === "manguera" && nextRandom(state) < 0.55) {
    return all[Math.floor(nextRandom(state) * all.length)]!;
  }

  const [tx, ty] = enemyTarget(state, e);
  let best = all[0]!;
  let bestD = Infinity;
  for (const d of all) {
    const dd = dist2(cx + DX[d], cy + DY[d], tx, ty);
    if (dd < bestD) (bestD = dd), (best = d);
  }
  return best;
}

function enemySpeed(state: CasaState, e: Enemy) {
  const base = { aspiradora: 52, manguera: 55, secador: 50, cartero: 47 }[e.kind];
  const lvl = Math.min(state.level - 1, 5) * 4;
  return e.scared ? 30 : base + lvl;
}

/** Un tick. `want` es la dirección que pide el jugador (se guarda hasta poder girar). */
export function stepCasa(state: CasaState, want: Dir): CasaEvent[] {
  if (state.over) return [];
  const events: CasaEvent[] = [];
  if (want !== 0) state.want = want;

  if (state.tick < state.freezeUntil) {
    state.tick += 1;
    return events;
  }

  // Maya: gira si puede hacia donde pide el jugador; si no, sigue derecho.
  const maya = state.maya;
  advance(
    maya,
    60 + Math.min(state.level - 1, 5) * 2,
    (cx, cy) => {
      if (state.want && walkable(cx + DX[state.want], cy + DY[state.want], false, false)) return state.want;
      if (maya.dir && walkable(cx + DX[maya.dir], cy + DY[maya.dir], false, false)) return maya.dir;
      return 0;
    },
    (cx, cy) => walkable(cx, cy, false, false),
  );

  // Comer.
  if (atCenter(maya)) {
    const i = idx(maya.x / SUB, maya.y / SUB);
    const f = state.food[i];
    if (f) {
      state.food[i] = 0;
      state.foodLeft -= 1;
      if (f === 1) {
        state.score += 10;
        state.eaten += 1;
        events.push({ t: "croqueta" });
      } else {
        state.score += 50;
        state.powerUntil = state.tick + POWER_TICKS;
        state.chain = 0;
        for (const e of state.enemies) if (state.tick >= e.releaseAt) e.scared = true;
        events.push({ t: "hueso" });
      }
    }
  }
  if (state.tick >= state.powerUntil) for (const e of state.enemies) e.scared = false;

  // Enemigos.
  for (const e of state.enemies) {
    if (state.tick < e.releaseAt) continue;
    advance(
      e,
      enemySpeed(state, e),
      (cx, cy) => chooseEnemyDir(state, e, cx, cy),
      (cx, cy) => {
        const here = cell(Math.round(e.x / SUB), Math.round(e.y / SUB));
        return walkable(cx, cy, true, here === "E" || here === "=");
      },
    );
  }

  // Choques.
  for (const e of state.enemies) {
    if (Math.abs(e.x - maya.x) + Math.abs(e.y - maya.y) >= 6) continue;
    if (e.scared) {
      state.chain += 1;
      const points = 200 * 2 ** Math.min(state.chain - 1, 3);
      state.score += points;
      events.push({ t: "espanta", kind: e.kind, points, x: e.x, y: e.y });
      const [px, py] = PEN[ENEMY_KINDS.indexOf(e.kind) % PEN.length]!;
      Object.assign(e, { x: px * SUB, y: py * SUB, dir: 1, acc: 0, scared: false, releaseAt: state.tick + 2 * TICKS_PER_SECOND });
    } else if (state.tick >= e.releaseAt) {
      state.lives -= 1;
      events.push({ t: "atrapada", kind: e.kind });
      if (state.lives > 0) {
        placeActors(state);
        state.freezeUntil = state.tick + FREEZE_TICKS;
      }
      break;
    }
  }

  // Nivel completo: la casa se vuelve a llenar y todo va un poco más rápido.
  if (state.foodLeft === 0 && state.lives > 0) {
    state.score += 500;
    state.level += 1;
    const { food, left } = freshFood();
    state.food = food;
    state.foodLeft = left;
    placeActors(state);
    state.freezeUntil = state.tick + FREEZE_TICKS;
    events.push({ t: "nivel", level: state.level });
  }

  state.tick += 1;
  if (state.lives <= 0) {
    state.over = true;
    events.push({ t: "end", reason: "lives" });
  } else if (state.tick >= MAX_TICKS) {
    state.over = true;
    events.push({ t: "end", reason: "time" });
  }
  return events;
}

/** Direcciones pedidas por el jugador: [tick, dir] solo cuando cambian. */
export type CasaInputLog = [number, Dir][];

export function replayCasa(seed: number, inputs: CasaInputLog) {
  const state = createCasa(seed);
  let i = 0;
  while (!state.over) {
    let want: Dir = 0;
    while (i < inputs.length && inputs[i]![0] <= state.tick) {
      want = inputs[i]![1];
      i += 1;
    }
    stepCasa(state, want);
  }
  return { score: state.score, ticks: state.tick, lives: state.lives, level: state.level, eaten: state.eaten };
}
