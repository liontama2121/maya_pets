import { describe, expect, it } from "vitest";
import { ageLabel, matchScore, type DogCardData } from "../src/adoption";

const dog = (p: Partial<DogCardData>): DogCardData => ({
  id: 1,
  slug: "x",
  name: "X",
  sex: "hembra",
  ageMonths: 36,
  size: "mediano",
  energy: "media",
  breed: "Criollo",
  temperament: "",
  goodWithKids: "por_saber",
  goodWithDogs: "por_saber",
  goodWithCats: "por_saber",
  sterilized: true,
  vaccinated: true,
  status: "disponible",
  photo: null,
  ...p,
});

describe("Guía de Maya", () => {
  it("en apartamento, con gatos y poco tiempo, prefiere al pequeño tranquilo que convive con gatos", () => {
    const pelusa = dog({ size: "pequeno", energy: "baja", ageMonths: 108, goodWithCats: "si" });
    const rocky = dog({ size: "grande", energy: "alta", ageMonths: 20, goodWithCats: "no" });
    const a = { hogar: "apartamento", mascotas: "gatos", tiempo: "poco", ritmo: "tranquilo" } as const;
    expect(matchScore(pelusa, a).score).toBeGreaterThan(matchScore(rocky, a).score + 50);
    expect(matchScore(pelusa, a).reasons).toContain("convive con gatos");
  });

  it("una familia deportista con patio encaja con el perro activo", () => {
    const rocky = dog({ size: "grande", energy: "alta" });
    const luna = dog({ size: "grande", energy: "baja" });
    const a = { hogar: "casa_patio", mascotas: "ninguna", tiempo: "mucho", ritmo: "deporte" } as const;
    expect(matchScore(rocky, a).score).toBeGreaterThan(matchScore(luna, a).score);
  });

  it("baja mucho a quien no tolera niños si hay niños en casa", () => {
    const max = dog({ goodWithKids: "no" });
    const a = { hogar: "casa_patio", mascotas: "ninguna", tiempo: "medio", ritmo: "paseos", ninos: true } as const;
    expect(matchScore(max, a).score).toBeLessThan(60);
  });

  it("el puntaje siempre queda entre 0 y 100", () => {
    const peor = dog({ size: "grande", energy: "alta", ageMonths: 3, goodWithDogs: "no", goodWithCats: "no", goodWithKids: "no", status: "en_proceso" });
    const s = matchScore(peor, { hogar: "apartamento", mascotas: "ambos", tiempo: "poco", ritmo: "tranquilo", ninos: true }).score;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it("la edad se muestra en meses o años", () => {
    expect(ageLabel(1)).toBe("1 mes");
    expect(ageLabel(8)).toBe("8 meses");
    expect(ageLabel(12)).toBe("1 año");
    expect(ageLabel(30)).toBe("2 años");
  });
});
