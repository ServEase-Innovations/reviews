import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { getDatabaseUrl } from "../config/env.js";

const connectionString = getDatabaseUrl();
const pool = new pg.Pool({ connectionString });

const dbName = (() => {
  try {
    return new URL(connectionString.replace(/^postgresql:/, "http:")).pathname.slice(1);
  } catch {
    return "(unknown)";
  }
})();

console.log(`[reviews] postgres → ${dbName}`);

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

export default prisma;
