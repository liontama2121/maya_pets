// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mayapets.co",
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
  },
  security: { checkOrigin: true },
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
});
