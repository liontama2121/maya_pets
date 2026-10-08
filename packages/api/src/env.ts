import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/schema";
import type { StaffRole } from "./db/schema";

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Dominio Zero Trust, p. ej. mayapets.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** AUD tag de la aplicación de Access que protege /admin y /api/admin. */
  ACCESS_AUD?: string;
  /** Solo localhost: identidad de desarrollo cuando no hay Access delante. */
  DEV_ADMIN_EMAIL?: string;
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
