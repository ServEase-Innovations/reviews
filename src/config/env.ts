import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { syncPostgresDbAliases, buildDatabaseUrl } = require("../../../../scripts/postgres-env.cjs");

const ENV = process.env.NODE_ENV || "development";

let envPath = path.resolve(process.cwd(), `.env.${ENV}`);
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), ".env");
}

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("[reviews] loaded env:", envPath);
} else {
  console.warn(
    `[reviews] no .env file at ${path.resolve(process.cwd(), `.env.${ENV}`)} or .env — ` +
      "copy .env.example to .env.development (same Postgres vars as payments)."
  );
}

syncPostgresDbAliases(process.env);

/** Build connection string from DATABASE_URL or POSTGRES_* (same pattern as payments). */
export function getDatabaseUrl(): string {
  return buildDatabaseUrl(process.env);
}
