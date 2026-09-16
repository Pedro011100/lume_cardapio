import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const SQLite = sqlite3.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.resolve(__dirname, "../database");
const databasePath = path.join(dataDirectory, "lume.db");
const schemaPath = path.join(dataDirectory, "schema.sqlite.sql");

let databasePromise;
let writeQueue = Promise.resolve();

function loadCatalog() {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../public/menu-data.js"),
    "utf8"
  );
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 1000 });

  if (!context.window.CASA_AURORA_DATA) {
    throw new Error("CATALOG_NOT_FOUND");
  }

  return context.window.CASA_AURORA_DATA;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const db = new SQLite.Database(databasePath, (error) => {
      if (error) reject(error);
      else resolve(db);
    });
  });
}

function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => (error ? reject(error) : resolve()));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

async function initialize() {
  fs.mkdirSync(dataDirectory, { recursive: true });

  const db = await openDatabase();

  try {
    await exec(
      db,
      `PRAGMA foreign_keys = ON;
       PRAGMA busy_timeout = 5000;
       PRAGMA journal_mode = WAL;
       PRAGMA synchronous = NORMAL;`
    );

    // Usa o mesmo schema documentado em database/schema.sqlite.sql.
    // Assim, o banco criado em runtime e o arquivo de referência nunca divergem.
    const schema = fs.readFileSync(schemaPath, "utf8");
    await exec(db, schema);

    const catalog = loadCatalog();

    await exec(db, "BEGIN IMMEDIATE TRANSACTION");
    try {
      for (const [index, category] of catalog.categories.entries()) {
        await run(
          db,
          `INSERT INTO categories (id, name, description, sort_order)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             sort_order = excluded.sort_order`,
          [category.id, category.label, category.description, index + 1]
        );
      }

      for (const product of catalog.products) {
        await run(
          db,
          `INSERT INTO products
             (id, category_id, name, description, price, tag, featured, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET
             category_id = excluded.category_id,
             name = excluded.name,
             description = excluded.description,
             price = excluded.price,
             tag = excluded.tag,
             featured = excluded.featured,
             active = 1,
             updated_at = CURRENT_TIMESTAMP`,
          [
            product.id,
            product.category,
            product.name,
            product.description,
            product.price,
            product.tag || null,
            product.featured ? 1 : 0,
          ]
        );
      }

      await exec(db, "COMMIT");
    } catch (error) {
      await exec(db, "ROLLBACK");
      throw error;
    }

    return { db, run, all, get };
  } catch (error) {
    db.close(() => {});
    throw error;
  }
}

export function getDatabase() {
  if (!databasePromise) {
    databasePromise = initialize();
  }
  return databasePromise;
}

export function withTransaction(callback) {
  const task = writeQueue.then(async () => {
    const database = await getDatabase();

    await exec(database.db, "BEGIN IMMEDIATE TRANSACTION");
    try {
      const result = await callback(database);
      await exec(database.db, "COMMIT");
      return result;
    } catch (error) {
      await exec(database.db, "ROLLBACK");
      throw error;
    }
  });

  // Mantém a fila utilizável mesmo se uma transação falhar.
  writeQueue = task.catch(() => undefined);
  return task;
}
