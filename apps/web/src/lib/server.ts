import type { APIContext, AstroGlobal } from "astro";
import type { Bindings } from "@maya/api";

/** Bindings de Cloudflare (D1, R2, variables) desde cualquier página o endpoint. */
export function envOf(ctx: AstroGlobal | APIContext): Bindings {
  return ctx.locals.runtime.env;
}
