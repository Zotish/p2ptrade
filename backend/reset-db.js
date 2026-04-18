/**
 * reset-db.js — Drop all tables and re-run migrations fresh
 * Usage:  node reset-db.js
 */
import "dotenv/config";
import pg from "pg";
import { runMigrations } from "./src/migrations.js";
import { seedAdminCatalog } from "./src/repositories/admin.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3
});

async function resetDb() {
  const client = await pool.connect();
  try {
    console.log("🔴  Dropping all tables...");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO public");
    console.log("✅  Schema cleared.\n");
  } finally {
    client.release();
  }

  console.log("🔧  Running migrations...");
  await runMigrations();
  console.log("✅  Migrations done.\n");

  console.log("🌱  Seeding admin catalog...");
  await seedAdminCatalog();
  console.log("✅  Catalog seeded.\n");

  await pool.end();
  console.log("🎉  Database reset complete! Run: npm run dev");
}

resetDb().catch((err) => {
  console.error("❌  Reset failed:", err.message);
  process.exit(1);
});
