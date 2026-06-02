import dotenv from "dotenv";
import fs from "fs";
import path from "path";

type PostgresEnvHelpers = {
  syncPostgresDbAliases: (env?: NodeJS.ProcessEnv) => string | undefined;
  buildDatabaseUrl: (env?: NodeJS.ProcessEnv) => string;
};

function loadPostgresEnvHelpers(): PostgresEnvHelpers {
  const candidates = [
    path.resolve(__dirname, "../../../../scripts/postgres-env.cjs"),
    path.resolve(__dirname, "../../../scripts/postgres-env.cjs"),
    path.resolve(process.cwd(), "scripts/postgres-env.cjs"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      // CommonJS require — compatible with tsc module: CommonJS
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(filePath) as PostgresEnvHelpers;
    }
  }

  return {
    syncPostgresDbAliases(env: NodeJS.ProcessEnv = process.env) {
      if (env.DATABASE_URL?.trim() && !env.POSTGRES_DB?.trim()) {
        try {
          const u = new URL(env.DATABASE_URL.trim());
          const db = decodeURIComponent(u.pathname.replace(/^\//, "").split("?")[0] || "");
          if (db) env.POSTGRES_DB = db;
        } catch {
          /* ignore */
        }
      }
      return env.POSTGRES_DB;
    },
    buildDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
      if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
      const host = env.POSTGRES_HOST || "127.0.0.1";
      const port = env.POSTGRES_PORT || "5432";
      const user = env.POSTGRES_USER || "";
      const password = env.POSTGRES_PASSWORD ?? "";
      const database = env.POSTGRES_DB || "";
      if (!user || !database) {
        throw new Error(
          "Set DATABASE_URL or POSTGRES_USER + POSTGRES_DB (and related POSTGRES_* vars) for reviews."
        );
      }
      return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
    },
  };
}

const { syncPostgresDbAliases, buildDatabaseUrl } = loadPostgresEnvHelpers();

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
      "use Render env vars or copy .env.example to .env.development for local dev."
  );
}

syncPostgresDbAliases(process.env);

/** Build connection string from DATABASE_URL or POSTGRES_* (same pattern as payments). */
export function getDatabaseUrl(): string {
  return buildDatabaseUrl(process.env);
}
