import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as schema from "../db/schema";
import { staffUsers, type StaffRole } from "../db/schema";
import type { AppEnv, Bindings, StaffIdentity } from "../env";

/**
 * Autenticación: Cloudflare Access firma un JWT por petición
 * (header `Cf-Access-Jwt-Assertion`). Lo validamos contra los certificados del equipo.
 * Autorización: el correo debe existir y estar activo en `staff_users`.
 */

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export async function resolveStaffEmail(req: Request, env: Bindings): Promise<string> {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, DEV_ADMIN_EMAIL } = env;

  // Desarrollo: solo en localhost y solo si Access NO está configurado.
  const host = new URL(req.url).hostname;
  if (!ACCESS_AUD && DEV_ADMIN_EMAIL && LOCAL_HOSTS.has(host)) {
    return DEV_ADMIN_EMAIL.toLowerCase();
  }

  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD) {
    throw new HTTPException(503, { message: "El acceso al panel no está configurado." });
  }

  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HTTPException(401, { message: "Inicia sesión para continuar." });

  try {
    const { payload } = await jwtVerify(token, jwksFor(ACCESS_TEAM_DOMAIN), {
      issuer: `https://${ACCESS_TEAM_DOMAIN}`,
      audience: ACCESS_AUD,
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!email) throw new Error("sin correo");
    return email.toLowerCase();
  } catch {
    throw new HTTPException(401, { message: "Tu sesión no es válida. Vuelve a entrar." });
  }
}

/** Identifica a la persona del panel o lanza 401/403/503 con un mensaje para mostrar. */
export async function identifyStaff(req: Request, env: Bindings): Promise<StaffIdentity> {
  const email = await resolveStaffEmail(req, env);
  const db = drizzle(env.DB, { schema });
  const row = await db.query.staffUsers.findFirst({ where: eq(staffUsers.email, email) });
  if (!row || !row.active) {
    throw new HTTPException(403, { message: "Tu correo no tiene acceso al panel de MAYA Pets." });
  }
  return { id: row.id, email: row.email, name: row.name, roles: row.roles };
}

export function hasRole(staff: StaffIdentity, ...roles: StaffRole[]): boolean {
  return staff.roles.includes("admin") || staff.roles.some((r) => roles.includes(r));
}

export const requireStaff = createMiddleware<AppEnv>(async (c, next) => {
  c.set("staff", await identifyStaff(c.req.raw, c.env));
  await next();
});

/** `admin` siempre pasa. */
export function requireRole(...roles: StaffRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const staff = c.get("staff");
    if (!hasRole(staff, ...roles)) throw new HTTPException(403, { message: "Tu rol no permite esta acción." });
    await next();
  });
}
