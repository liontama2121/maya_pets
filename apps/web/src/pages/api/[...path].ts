import type { APIRoute } from "astro";
import { app } from "@maya/api";

export const prerender = false;

/** Toda la API (pública y del panel) la atiende Hono dentro del mismo Worker. */
export const ALL: APIRoute = ({ request, locals }) =>
  app.fetch(request, locals.runtime.env, locals.runtime.ctx);
