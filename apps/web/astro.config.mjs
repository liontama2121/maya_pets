// Sin @ts-check: el proyecto usa los tipos de Workers, no los de Node, y este archivo corre en Node.
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * En desarrollo, Vite descubre las librerías a medida que las páginas las piden y, al encontrar una nueva,
 * reorganiza su caché: las páginas ya abiertas quedan pidiendo archivos viejos (error 504) y se caen las
 * islas y las animaciones. Para evitarlo se le entregan desde el arranque: anime.js, React y cada ícono
 * de Phosphor que el código importa (la lista se saca sola del código).
 */
function phosphorIconsUsed() {
  const src = fileURLToPath(new URL("./src", import.meta.url));
  const found = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|astro)$/.test(e.name)) {
        for (const m of readFileSync(p, "utf8").matchAll(/@phosphor-icons\/react\/dist\/csr\/(\w+)/g)) found.add(m[1]);
      }
    }
  };
  walk(src);
  return [...found].sort().map((name) => `@phosphor-icons/react/dist/csr/${name}`);
}

export default defineConfig({
  // Dominio público (canónicas, Open Graph, sitemap). Cambiar aquí al conectar el dominio propio.
  site: "https://maya-pets.pages.dev",
  output: "server",
  adapter: cloudflare({
    // Desarrollo contra la D1 y el R2 reales (bindings con "remote": true en wrangler.jsonc).
    platformProxy: { enabled: true, remoteBindings: false },
    imageService: "passthrough",
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // El paquete de la API se compila junto con el sitio (TypeScript sin build previo).
      noExternal: ["@maya/api"],
    },
    optimizeDeps: {
      include: [
        "animejs",
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "zod",
        ...phosphorIconsUsed(),
      ],
    },
  },
  security: { checkOrigin: true },
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
});
