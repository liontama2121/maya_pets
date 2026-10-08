import { describe, expect, it } from "vitest";
import { createGame, DURATION_TICKS, PLATE_MAX_STEP, replay, step, W, type InputLog } from "../src/game/lluvia";

/** Jugador simulado: persigue el objeto bueno más bajo y esquiva los tóxicos. */
function playLive(seed: number) {
  const state = createGame(seed);
  const log: InputLog = [];
  let last = -1;
  while (!state.over) {
    const good = state.items.filter((i) => !["chocolate", "uvas", "cebolla"].includes(i.kind)).sort((a, b) => b.y - a.y)[0];
    const target = good ? good.x : W / 2;
    if (target !== last) {
      log.push([state.tick, target]);
      last = target;
    }
    step(state, target);
  }
  return { state, log };
}

describe("Lluvia de premios", () => {
  it("la repetición da exactamente el mismo puntaje que la partida en vivo", () => {
    for (const seed of [1, 42, 987654321, -12345]) {
      const { state, log } = playLive(seed);
      const r = replay(seed, log);
      expect(r.score).toBe(state.score);
      expect(r.ticks).toBe(state.tick);
      expect(r.lives).toBe(state.lives);
    }
  });

  it("la partida dura como máximo 60 segundos", () => {
    const { state } = playLive(7);
    expect(state.tick).toBeLessThanOrEqual(DURATION_TICKS);
  });

  it("otra semilla produce otra lluvia", () => {
    expect(playLive(1).state.score).not.toBe(playLive(2).state.score);
  });

  it("teletransportar el plato no sirve: se mueve a velocidad limitada", () => {
    const s = createGame(3);
    step(s, 0);
    expect(Math.abs(s.plateX - W / 2)).toBeLessThanOrEqual(PLATE_MAX_STEP);
  });

  it("quedarse quieto no da un puntaje alto", () => {
    const idle = replay(5, [[0, W / 2]]);
    const { state } = playLive(5);
    expect(idle.score).toBeLessThan(state.score);
  });
});
