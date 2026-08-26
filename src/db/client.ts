import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let database: Database | undefined;

/**
 * Lazily creates the connection pool so importing application modules remains
 * safe during static builds and tests where DATABASE_URL is intentionally absent.
 */
export function getDb(): Database {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when a database connection is used");
  }

  pool = new Pool({ connectionString });
  database = drizzle(pool, { schema });
  return database;
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
}
