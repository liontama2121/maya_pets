import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwtVerify, SignJWT } from "jose";
import type { StaffRole } from "../db/schema";
import type { AppEnv, Bindings, StaffIdentity } from "../env";

/**
 * Acceso al panel con usuario y contraseña:
 *  - La dueña entra con la cuenta de las variables de entorno (secretos del Worker):
 *    ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET (≥ 32 caracteres) y opcional ADMIN_NAME. Rol `admin`.
 *  - El resto del equipo tiene cuenta en D1 (`staff_users`): correo como usuario, contraseña cifrada con
 *    PBKDF2-SHA256 y sus roles. La administradora las crea desde /admin/equipo.
 * La sesión es una cookie HttpOnly firmada (HS256) que dura 12 horas.
 * Si cambia la contraseña de una cuenta, o se desactiva, sus sesiones abiertas dejan de servir.
 */

export const SESSION_COOKIE = "maya_admin";
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
/** Iteraciones de PBKDF2. Se guardan en cada hash, así se pueden subir sin romper las contraseñas viejas. */
const PBKDF2_ITERATIONS = 60_000;
/** Sujeto del token de la cuenta del entorno; las de D1 usan `staff:<id>`. */
const OWNER_SUB = "env:admin";

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

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return new Uint8Array(bits);
}

/** Hash para guardar en D1: `pbkdf2$<iteraciones>$<sal>$<hash>` (base64). */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  try {
    return sameBytes(await pbkdf2(password, unb64(salt), Number(iter)), unb64(hash));
  } catch {
    return false;
  }
}

/** Hash de relleno: si el usuario no existe se calcula igual, para no revelar qué correos tienen cuenta. */
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

interface Account {
  sub: string;
  email: string;
  name: string;
  roles: StaffRole[];
  id: number;
  /** Material de la contraseña actual: si cambia, las sesiones viejas se invalidan. */
  secret: string;
}

const normUser = (u: string) => u.trim().toLowerCase();

function ownerAccount(env: Bindings): Account {
  return {
    sub: OWNER_SUB,
    email: normUser(env.ADMIN_USERNAME!),
    name: env.ADMIN_NAME || "Administración",
    roles: ["admin"],
    id: 0,
    secret: env.ADMIN_PASSWORD!,
  };
}

interface StaffRow {
  id: number;
  email: string;
  name: string;
  roles: string;
  active: number;
  password_hash: string | null;
}

function staffAccount(r: StaffRow): Account {
  return {
    sub: `staff:${r.id}`,
    email: r.email,
    name: r.name,
    roles: JSON.parse(r.roles) as StaffRole[],
    id: r.id,
    secret: r.password_hash ?? "",
  };
}

/** Huella de la contraseña actual de la cuenta. */
async function passwordVersion(env: Bindings, account: Account) {
  const h = await sha256(`${account.secret}:${env.SESSION_SECRET}`);
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

  const user = normUser(username);
  let match: Account | null = null;

  // 1) Cuenta de la dueña (entorno). Se comparan siempre usuario y contraseña, para no revelar cuál falló.
  const owner = ownerAccount(env);
  const [u1, u2, p1, p2] = await Promise.all([sha256(user), sha256(owner.email), sha256(password), sha256(owner.secret)]);
  if (sameBytes(u1, u2) && sameBytes(p1, p2)) match = owner;

  // 2) Cuentas del equipo en D1. Si no existe, se calcula igual un PBKDF2 de relleno.
  if (!match) {
    const staff = await env.DB.prepare(
      `SELECT id, email, name, roles, active, password_hash FROM staff_users WHERE email = ? AND active = 1 AND password_hash IS NOT NULL`,
    )
      .bind(user)
      .first<StaffRow>();
    const ok = await verifyPassword(password, staff?.password_hash ?? DUMMY_HASH);
    if (staff && ok) match = staffAccount(staff);
  }

  if (!match) {
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
  const token = await new SignJWT({ pv: await passwordVersion(env, match) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(match.sub)
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
    // Nombre y roles salen siempre de la cuenta actual, no del token: un cambio de rol aplica de inmediato.
    let account: Account | null = null;
    if (payload.sub === OWNER_SUB) account = ownerAccount(env);
    else if (typeof payload.sub === "string" && /^staff:\d+$/.test(payload.sub)) {
      const r = await env.DB.prepare(
        `SELECT id, email, name, roles, active, password_hash FROM staff_users WHERE id = ? AND active = 1`,
      )
        .bind(Number(payload.sub.slice(6)))
        .first<StaffRow>();
      if (r?.password_hash) account = staffAccount(r);
    }
    if (!account || payload.pv !== (await passwordVersion(env, account))) throw new Error("cuenta cambiada");
    return { id: account.id, email: account.email, name: account.name, roles: account.roles };
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
