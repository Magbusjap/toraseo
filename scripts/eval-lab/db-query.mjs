#!/usr/bin/env node
import { DEFAULT_DB_PATH, applySchema, openDatabase, parseArgs } from "./db-utils.mjs";

const args = parseArgs();
const dbPath = String(args.db ?? DEFAULT_DB_PATH);
const sql = String(args.sql ?? args._?.join(" ") ?? "");

if (!sql.trim()) {
  console.error('Use --sql "SELECT * FROM eval_cases"');
  process.exit(1);
}

const db = openDatabase(dbPath);
applySchema(db);

const rows = db.prepare(sql).all();
db.close();

console.table(rows);
