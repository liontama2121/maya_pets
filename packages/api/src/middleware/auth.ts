import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwtVerify, SignJWT } from "jose";
import type { StaffRole } from "../db/schema";
import type { AppEnv, Bindings, StaffIdentity } from "../env";

/**
 * Panel con usuario y contraseña definidos en variables de entorno (secretos del Worker):
 *   ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET (≥ 32 caracteres) y opcional ADMIN_NAME.
 * La sesión es una cookie HttpOnly firmada (HS256) que dura 12 horas.
 * Si cambia la contraseña, todas las sesiones abiertas dejan de servir.
 */

export const SESSION_COOKIE = "maya_admin";
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const enc = new TextEncoder();

export function authConfigured(env: Bindings) {
  return Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32);
}

const notConfigured = () =>
  new HTTPException(503, {
    message: "El panel no está configurado: faltan las variables ADMIN_USERNAME, ADMIN_PASSWORD y SESSION_SECRET.",
  });

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function sameBytes(a: Uint8Array, b: Uint8Array) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Huella de la contraseña actual: al cambiarla, las sesiones viejas quedan inválidas. */
async function passwordVersion(env: Bindings) {
  const h = await sha256(`${env.ADMIN_PASSWORD}:${env.SESSION_SECRET}`);
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const key = (env: Bindings) => enc.encode(env.SESSION_SECRET!);

const clientIp = (req: Request) => req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "local";

/** Verifica usuario y contraseña con bloqueo por intentos fallidos. Devuelve la cookie de sesión. */
export async function login(req: Request, env: Bindings, username: string, password: string) {
  if (!authConfigured(env)) throw notConfigured();
  const ip = clientIp(req);
  const now = Date.now();

  const row = await env.DB.prepare(`SELECT fails, first_at, locked_until FROM login_attempts WHERE ip = ?`)
    .bind(ip)
    .first<{ fails: number; first_at: number; locked_until: number }>();
  if (row && row.locked_until > now) {
    const min = Math.ceil((row.locked_until - now) / 60000);
    throw new HTTPException(429, { message: `Demasiados intentos fallidos. Intenta de nuevo en ${min} ${min === 1 ? "minuto" : "minutos"}.` });
  }

  // Se calculan las dos comparaciones siempre, para no revelar cuál falló.
  const [u1, u2, p1, p2] = await Promise.all([
    sha256(username.trim().toLowerCase()),
    sha256(env.ADMIN_USERNAME!.trim().toLowerCase()),
    sha256(password),
    sha256(env.ADMIN_PASSWORD!),
  ]);
  const ok = sameBytes(u1, u2) && sameBytes(p1, p2);

  if (!ok) {
    const windowExpired = !row || now - row.first_at > LOCK_MS;
    const fails = windowExpired ? 1 : row.fails + 1;
    const lockedUntil = fails >= MAX_FAILS ? now + LOCK_MS : 0;
    await env.DB.prepare(
      `INSERT INTO login_attempts (ip, fails, first_at, locked_until) VALUES (?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET fails = excluded.fails, first_at = excluded.first_at, locked_until = excluded.locked_until`,
    )
      .bind(ip, fails, windowExpired ? now : row.first_at, lockedUntil)
      .run();
    throw new HTTPException(401, {
      message: lockedUntil
        ? "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos."
        : `Usuario o contraseña incorrectos.${MAX_FAILS - fails <= 2 ? ` Te quedan ${MAX_FAILS - fails} intentos.` : ""}`,
    });
  }

  await env.DB.prepare(`DELETE FROM login_attempts WHERE ip = ?`).bind(ip).run();
  const token = await new SignJWT({ name: env.ADMIN_NAME || "Administración", roles: ["admin"], pv: await passwordVersion(env) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_USERNAME!.trim().toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key(env));
  return sessionCookie(req, token, SESSION_HOURS * 3600);
}

export function sessionCookie(req: Request, value: string, maxAge: number) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Identifica a la persona del panel por su cookie de sesión o lanza 401/503. */
export async function identifyStaff(req: Request, env: Bindings): Promise<StaffIdentity> {
  if (!authConfigured(env)) throw notConfigured();
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) throw new HTTPException(401, { message: "Inicia sesión para continuar." });
  try {
    const { payload } = await jwtVerify(token, key(env), { algorithms: ["HS256"] });
    if (payload.pv !== (await passwordVersion(env))) throw new Error("contraseña cambiada");
    return {
      id: 0,
      email: String(payload.sub ?? ""),
      name: String(payload.name ?? "Administración"),
      roles: (payload.roles as StaffRole[]) ?? ["admin"],
    };
  } catch {
    throw new HTTPException(401, { message: "Tu sesión venció. Vuelve a entrar." });
  }
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
    if (!hasRole(c.get("staff"), ...roles)) throw new HTTPException(403, { message: "Tu rol no permite esta acción." });
    await next();
  });
}
