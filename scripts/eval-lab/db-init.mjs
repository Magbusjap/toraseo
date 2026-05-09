#!/usr/bin/env node
import { DEFAULT_DB_PATH, DEFAULT_SCHEMA_PATH, applySchema, openDatabase, parseArgs } from "./db-utils.mjs";

const args = parseArgs();
const dbPath = String(args.db ?? DEFAULT_DB_PATH);
const schemaPath = String(args.schema ?? DEFAULT_SCHEMA_PATH);

const db = openDatabase(dbPath);
applySchema(db, schemaPath);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((row) => row.name);

db.close();

console.log(`Eval Lab database ready: ${dbPath}`);
console.log(`Schema: ${schemaPath}`);
console.log(`Tables: ${tables.join(", ")}`);
