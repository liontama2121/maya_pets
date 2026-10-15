/**
 * Sub-marcas de MAYA Pets. Se escriben SIEMPRE así (sin variaciones):
 * Club MAYA · MAYA Conecta · MAYA Kids · MAYA Premia.
 * No tienen logo propio: se componen con el wordmark "MAYA" en la tipografía de marca + el nombre.
 */
export const SUB_BRANDS = {
  club: { name: "Club MAYA", href: "/club-maya" },
  conecta: { name: "MAYA Conecta", href: "/maya-conecta" },
  kids: { name: "MAYA Kids", href: "/maya-kids" },
  premia: { name: "MAYA Premia", href: "/maya-premia" },
} as const;
export type SubBrandKey = keyof typeof SUB_BRANDS;

/** Las 6 secciones de MAYA Conecta, en orden. `ready` = ya construida. */
export const CONECTA_SECTIONS = [
  {
    slug: "adopta",
    name: "Adopta con MAYA",
    href: "/maya-conecta/adopta",
    text: "Perritos y gatos que buscan familia. Maya te ayuda a elegir.",
    ready: true,
  },
  {
    slug: "ayudame-a-volver",
    name: "Ayúdame a volver",
    href: "/maya-conecta/ayudame-a-volver",
    text: "Mascotas perdidas y encontradas en Bogotá.",
    ready: false,
  },
  { slug: "blog", name: "Blog MAYA", href: "/maya-conecta/blog", text: "Consejos, noticias e historias de mascotas.", ready: false },
  {
    slug: "aliados",
    name: "MAYA Aliados",
    href: "/maya-conecta/aliados",
    text: "Veterinarios, paseadores, cuidadores y entrenadores de confianza.",
    ready: false,
  },
  {
    slug: "historias",
    name: "Historias que conectan",
    href: "/maya-conecta/historias",
    text: "Adopciones, reencuentros y experiencias de la comunidad.",
    ready: false,
  },
  {
    slug: "solidaria",
    name: "MAYA Solidaria",
    href: "/maya-conecta/solidaria",
    text: "Campañas y voluntariado por el bienestar animal.",
    ready: false,
  },
] as const;
