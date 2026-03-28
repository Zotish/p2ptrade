import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("neon.tech") || config.databaseUrl.includes("postgres")
    ? { rejectUnauthorized: false }
    : false,
  max: 10
});

pool.on("error", (err) => console.error("[db] Pool error:", err.message));

// Convert SQLite ? placeholders → PostgreSQL $1, $2...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Fix SQLite-specific syntax for PostgreSQL
// datetime('now') → text so it matches our text-typed date columns
function normalizeSql(sql) {
  let s = sql
    // datetime('now', '+X unit') — positive literal interval
    .replace(/datetime\('now',\s*'([+]?\d+\s+\w+)'\)/gi, (_, iv) => {
      const cleaned = iv.replace(/^\+/, "").trim();
      return `((NOW() AT TIME ZONE 'UTC') + INTERVAL '${cleaned}')::text`;
    })
    // datetime('now', '-X unit') — negative literal interval
    .replace(/datetime\('now',\s*'(-\d+\s+\w+)'\)/gi, (_, iv) => {
      const cleaned = iv.replace(/^-/, "").trim();
      return `((NOW() AT TIME ZONE 'UTC') - INTERVAL '${cleaned}')::text`;
    })
    // datetime('now', ?) — parameter-based interval e.g. '-5 minutes'
    .replace(/datetime\('now',\s*\?\)/gi,
      "((NOW() AT TIME ZONE 'UTC') + ?::interval)::text")
    // datetime('now') — plain current time
    .replace(/datetime\('now'\)/gi, "(NOW() AT TIME ZONE 'UTC')::text")
    // SQLite autoincrement → PostgreSQL serial
    .replace(/\binteger\s+primary\s+key\s+autoincrement\b/gi, "serial primary key");

  // Convert ? placeholders to $1, $2... (must be last)
  return convertPlaceholders(s);
}

export async function run(sql, params = []) {
  const result = await pool.query(normalizeSql(sql), params);
  return { changes: result.rowCount, rowCount: result.rowCount };
}

export async function get(sql, params = []) {
  const result = await pool.query(normalizeSql(sql), params);
  return result.rows[0] ?? null;
}

export async function all(sql, params = []) {
  const result = await pool.query(normalizeSql(sql), params);
  return result.rows;
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
