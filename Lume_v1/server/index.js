import express from "express";
import { createServer } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { getDatabase, withTransaction } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
const publicPath = path.resolve(__dirname, "..", "public");
const serviceFeeRate = 0.1;
const payments = new Set(["card", "pix", "cash"]);

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", async (_req, res) => {
  try {
    const database = await getDatabase();
    const row = await database.get(database.db, "SELECT COUNT(*) AS count FROM products WHERE active = 1");
    return res.json({ ok: true, database: "sqlite", file: "database/lume.db", products: row.count });
  } catch (error) {
    console.error("SQLite health check failed", error);
    return res.status(503).json({ ok: false, database: "unavailable", message: "Não foi possível abrir o banco SQLite local." });
  }
});

app.post("/api/orders", async (req, res) => {
  const { customerName, tableNumber, paymentMethod, serviceFeeEnabled = true, items } = req.body ?? {};
  const table = Number(tableNumber);

  if (typeof customerName !== "string" || customerName.trim().length < 2 || customerName.trim().length > 120) {
    return res.status(400).json({ error: "Informe um nome válido." });
  }
  if (!Number.isInteger(table) || table < 1 || table > 50) {
    return res.status(400).json({ error: "A mesa deve estar entre 1 e 50." });
  }
  if (!payments.has(paymentMethod)) {
    return res.status(400).json({ error: "Forma de pagamento inválida." });
  }
  if (typeof serviceFeeEnabled !== "boolean") {
    return res.status(400).json({ error: "A opção de serviço deve ser booleana." });
  }
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    return res.status(400).json({ error: "O pedido precisa ter entre 1 e 50 itens." });
  }

  const quantities = new Map();
  for (const item of items) {
    if (typeof item?.productId !== "string" || !item.productId.trim() || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
      return res.status(400).json({ error: "Itens ou quantidades inválidos." });
    }
    const productId = item.productId.trim();
    const quantity = Number(item.quantity);
    const totalQuantity = (quantities.get(productId) || 0) + quantity;
    if (totalQuantity > 99) return res.status(400).json({ error: "A quantidade máxima por produto é 99." });
    quantities.set(productId, totalQuantity);
  }

  const normalized = [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));

  try {
    const order = await withTransaction(async (database) => {
      const ids = normalized.map((item) => item.productId);
      const placeholders = ids.map(() => "?").join(",");
      const rows = await database.all(database.db, `SELECT id, name, price FROM products WHERE active = 1 AND id IN (${placeholders})`, ids);
      const products = new Map(rows.map((product) => [product.id, product]));
      if (products.size !== ids.length) throw new Error("PRODUCT_NOT_FOUND");

      const priced = normalized.map((item) => {
        const product = products.get(item.productId);
        const unitPrice = roundMoney(Number(product.price));
        return { ...item, name: product.name, unitPrice, itemTotal: roundMoney(unitPrice * item.quantity) };
      });
      const subtotal = roundMoney(priced.reduce((sum, item) => sum + item.itemTotal, 0));
      const serviceFee = serviceFeeEnabled ? roundMoney(subtotal * serviceFeeRate) : 0;
      const total = roundMoney(subtotal + serviceFee);
      const reference = `CA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const result = await database.run(database.db, "INSERT INTO orders (reference, customer_name, table_number, service_fee_enabled, service_fee_rate, subtotal, service_fee, total, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)", [reference, customerName.trim(), String(table), serviceFeeEnabled ? 1 : 0, serviceFeeRate, subtotal, serviceFee, total, paymentMethod]);
      for (const item of priced) {
        await database.run(database.db, "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, item_total) VALUES (?, ?, ?, ?, ?, ?)", [result.lastID, item.productId, item.name, item.unitPrice, item.quantity, item.itemTotal]);
      }
      return { id: result.lastID, reference, customerName: customerName.trim(), tableNumber: table, paymentMethod, items: priced, subtotal, serviceFee, total };
    });
    return res.status(201).json({ order });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") return res.status(400).json({ error: "Um ou mais produtos não estão disponíveis.", code: "PRODUCT_NOT_FOUND" });
    console.error("Order creation failed", error);
    return res.status(500).json({ error: "Não foi possível registrar o pedido.", code: "ORDER_PERSISTENCE_FAILED" });
  }
});

app.use(express.static(publicPath));
app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint não encontrado.", code: "ENDPOINT_NOT_FOUND" }));
app.get("*", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));

app.use((error, req, res, next) => {
  if (req.path.startsWith("/api") && error?.status === 400) return res.status(400).json({ error: "JSON inválido.", code: "INVALID_JSON" });
  return next(error);
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => console.log(`Lume JS + SQLite running on http://${host}:${port}`));
