import { defineConfig } from "drizzle-kit";

// Las migraciones se generan aquí y las aplica wrangler sobre D1 (local o remoto).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "../../apps/web/migrations",
});
