import dotenv from "dotenv";
import fs from "fs";
import path from "path";

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

/** Build connection string from DATABASE_URL or POSTGRES_* (same pattern as payments). */
export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const host = process.env.POSTGRES_HOST || "127.0.0.1";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD ?? "";
  const database = process.env.POSTGRES_DB || "serveaso";

  if (!user) {
    throw new Error(
      "Reviews DB not configured. Set DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB " +
        "in services/reviews/.env.development (see .env.example)."
    );
  }

  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgresql://${encUser}:${encPass}@${host}:${port}/${database}`;
}
