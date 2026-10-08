import { describe, expect, it } from "vitest";
import { COLS, createCasa, MAP, MAX_TICKS, replayCasa, ROWS, stepCasa, SUB, type CasaInputLog, type Dir } from "../src/game/casa";

/** Jugador simulado: cambia de dirección cada cierto tiempo según la semilla. */
function playLive(seed: number) {
  const state = createCasa(seed);
  const log: CasaInputLog = [];
  let r = seed >>> 0 || 1;
  while (!state.over) {
    let want: Dir = 0;
    if (state.tick % 37 === 0) {
      r = (r * 1103515245 + 12345) >>> 0;
      want = ((r % 4) + 1) as Dir;
      log.push([state.tick, want]);
    }
    stepCasa(state, want);
  }
  return { state, log };
}

describe("Maya en casa", () => {
  it("el mapa es rectangular", () => {
    for (const row of MAP) expect(row.length).toBe(COLS);
    expect(ROWS).toBe(MAP.length);
  });

  it("todas las croquetas se pueden alcanzar desde el inicio de Maya", () => {
    const start = MAP.flatMap((row, y) => [...row].map((c, x) => [c, x, y] as const)).find(([c]) => c === "M")!;
    const seen = new Set<string>([`${start[1]},${start[2]}`]);
    const queue: [number, number][] = [[start[1], start[2]]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx!;
        const ny = y + dy!;
        const c = MAP[ny]?.[nx];
        if (!c || "#=E".includes(c) || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
    MAP.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === "." || c === "o") expect(seen.has(`${x},${y}`), `croqueta en ${x},${y}`).toBe(true);
    }));
  });

  it("los cuatro enemigos salen del lavadero", () => {
    const s = createCasa(9);
    const seenOut = new Set<string>();
    for (let i = 0; i < 60 * 16 && !s.over; i++) {
      // Maya lejos para que nadie la atrape: solo se mide la salida del lavadero.
      s.maya.x = -999;
      s.maya.y = -999;
      stepCasa(s, 0);
      for (const e of s.enemies) {
        const c = MAP[Math.round(e.y / SUB)]?.[Math.round(e.x / SUB)];
        if (c !== "E" && c !== "=") seenOut.add(e.kind);
      }
    }
    expect([...seenOut].sort()).toEqual(["aspiradora", "cartero", "manguera", "secador"]);
  });

  it("la repetición da exactamente el mismo puntaje que la partida en vivo", () => {
    for (const seed of [1, 77, 123456, -9]) {
      const { state, log } = playLive(seed);
      const r = replayCasa(seed, log);
      expect(r.score).toBe(state.score);
      expect(r.ticks).toBe(state.tick);
      expect(r.lives).toBe(state.lives);
    }
  });

  it("la partida nunca pasa de 3 minutos", () => {
    const { state } = playLive(5);
    expect(state.tick).toBeLessThanOrEqual(MAX_TICKS);
  });
});
