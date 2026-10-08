import type { APIRoute } from "astro";
import { app } from "@maya/api";

export const prerender = false;

/** Fotos guardadas en R2. */
export const GET: APIRoute = ({ request, locals }) => app.fetch(request, locals.runtime.env, locals.runtime.ctx);
