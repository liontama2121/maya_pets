import type { AstroGlobal } from "astro";
import { app } from "@maya/api";
import { envOf } from "./server";

/**
 * Llama a la API del panel desde una página del servidor, con los mismos headers
 * de la petición (Cloudflare Access) para que aplique la misma autorización.
 */
export async function adminFetch<T>(Astro: AstroGlobal, path: string): Promise<T> {
  const res = await app.fetch(
    new Request(new URL(`/api/admin${path}`, Astro.url), { headers: Astro.request.headers }),
    envOf(Astro),
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw Object.assign(new Error(body.error ?? "Error del panel"), { status: res.status });
  }
  return (await res.json()) as T;
}
