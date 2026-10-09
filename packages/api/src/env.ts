import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/schema";
import type { StaffRole } from "./db/schema";

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Usuario del panel (secreto). */
  ADMIN_USERNAME?: string;
  /** Contraseña del panel (secreto). */
  ADMIN_PASSWORD?: string;
  /** Texto al azar de 32+ caracteres que firma la sesión (secreto). */
  SESSION_SECRET?: string;
  /** Nombre que muestra el panel, p. ej. "Luisa". */
  ADMIN_NAME?: string;
  /** Token de la API de Instagram (cuenta profesional de MAYA) para contar likes de MAYA Kids. */
  INSTAGRAM_ACCESS_TOKEN?: string;
  /** Opcional: base de la API (por defecto https://graph.instagram.com). */
  INSTAGRAM_GRAPH_URL?: string;
}

export interface StaffIdentity {
  id: number;
  email: string;
  name: string;
  roles: StaffRole[];
}

export interface Variables {
  db: DrizzleD1Database<typeof schema>;
  staff: StaffIdentity;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
