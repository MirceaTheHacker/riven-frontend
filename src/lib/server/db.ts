import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { env } from "$env/dynamic/private";
import * as schema from "./schema";
import fs from "fs";
import path from "path";

// Use provided DATABASE_URL or fall back to a local dev sqlite file.
const dbPath =
    env.DATABASE_URL && env.DATABASE_URL.trim().length > 0
        ? env.DATABASE_URL
        : path.resolve(process.cwd(), "dev_db", "auth.db");

// Ensure parent directory exists to avoid "Cannot open database because the directory does not exist".
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema, logger: env.DATABASE_LOGGING === "true" });
