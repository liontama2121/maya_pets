import { describe, expect, it } from "vitest";
import { CONTENT_SCHEMAS, DEFAULT_CONTENT, isBannerLive, paragraphs, parseBlock } from "../src/content";
import { CONTENT_KEYS } from "../src/db/schema";
import { hashPassword } from "../src/middleware/auth";

describe("contenido del sitio", () => {
  it("el contenido inicial pasa la validación de cada bloque", () => {
    for (const key of CONTENT_KEYS) {
      expect(CONTENT_SCHEMAS[key].safeParse(DEFAULT_CONTENT[key]).success, key).toBe(true);
    }
  });

  it("el inicio arranca con 'Hola, soy Maya' y el botón 'Ver productos' en el banner", () => {
    expect(DEFAULT_CONTENT.hero.title).toBe("Hola, soy Maya");
    expect(DEFAULT_CONTENT.banner.ctaLabel).toBe("Ver productos");
  });

  it("rechaza enlaces e imágenes externas o con HTML", () => {
    const hero = { ...DEFAULT_CONTENT.hero, ctaHref: "javascript:alert(1)" };
    expect(parseBlock("hero", hero)).toBeNull();
    const img = { ...DEFAULT_CONTENT.hero, imageLeft: { src: "https://otro.sitio/x.png", alt: "" } };
    expect(parseBlock("hero", img)).toBeNull();
    expect(parseBlock("hero", { ...DEFAULT_CONTENT.hero, ctaHref: "//otro.sitio" })).toBeNull();
  });

  it("el banner solo se ve encendido y entre sus fechas", () => {
    const b = { ...DEFAULT_CONTENT.banner, enabled: true, startsAt: "2026-10-01", endsAt: "2026-10-31" };
    expect(isBannerLive(b, "2026-10-17")).toBe(true);
    expect(isBannerLive(b, "2026-11-01")).toBe(false);
    expect(isBannerLive({ ...b, enabled: false }, "2026-10-17")).toBe(false);
  });

  it("parte la historia en párrafos y respeta **negritas**", () => {
    const p = paragraphs("Uno\ncon salto\n\nDos con **lema** al final");
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual([{ text: "Uno con salto", bold: false }]);
    expect(p[1]).toEqual([
      { text: "Dos con ", bold: false },
      { text: "lema", bold: true },
      { text: " al final", bold: false },
    ]);
  });
});

describe("contraseñas del equipo", () => {
  it("cada hash lleva sal distinta y el formato esperado", async () => {
    const [a, b] = await Promise.all([hashPassword("una-clave-larga"), hashPassword("una-clave-larga")]);
    expect(a).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
  });
});
