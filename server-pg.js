import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 4173);
const root = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || "goquick",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        ssl:
          process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      },
);
const jwtSecret = process.env.JWT_SECRET || "development-secret-change-me";
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;
app.use(express.json());
app.use(express.static(root));
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (
    !requestOrigin ||
    corsOrigins.length === 0 ||
    corsOrigins.includes(requestOrigin)
  ) {
    if (requestOrigin)
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

const tokenFor = (user) =>
  jwt.sign({ id: user.id, email: user.email, name: user.name }, jwtSecret, {
    expiresIn: "7d",
  });
function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
async function cartId(client, userId) {
  await client.query(
    "INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [userId],
  );
  const {
    rows: [cart],
  } = await client.query("SELECT id FROM carts WHERE user_id = $1", [userId]);
  return cart.id;
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected", engine: "postgresql" });
  } catch (error) {
    res
      .status(503)
      .json({ ok: false, database: "unavailable", error: error.message });
  }
});
app.get("/api/products", async (req, res) => {
  try {
    const params =
      req.query.category && req.query.category !== "All"
        ? [req.query.category]
        : [];
    const sql = params.length
      ? 'SELECT id, name, category, price, unit, image_url AS "imageUrl", stock FROM products WHERE category = $1 ORDER BY id'
      : 'SELECT id, name, category, price, unit, image_url AS "imageUrl", stock FROM products ORDER BY id';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not load products", details: error.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !email.includes("@") || password.length < 8)
    return res.status(400).json({
      error:
        "Enter a valid name, email address, and password of at least 8 characters",
    });
  try {
    const hash = await bcrypt.hash(password, 12);
    const {
      rows: [user],
    } = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
      [name, email, hash],
    );
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 500).json({
      error:
        error.code === "23505"
          ? "Email is already registered"
          : "Could not create account",
      details: error.code === "23505" ? undefined : error.message,
    });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      rows: [user],
    } = await pool.query(
      'SELECT id, name, email, password_hash AS "passwordHash" FROM users WHERE email = $1 AND is_active = TRUE',
      [
        String(req.body.email || "")
          .trim()
          .toLowerCase(),
      ],
    );
    if (
      !user ||
      !(await bcrypt.compare(
        String(req.body.password || ""),
        user.passwordHash,
      ))
    )
      return res.status(401).json({ error: "Incorrect email or password" });
    delete user.passwordHash;
    res.json({ user, token: tokenFor(user) });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not sign in", details: error.message });
  }
});

app.get("/api/cart", requireUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT p.id, p.name, p.price, p.unit, p.image_url AS "imageUrl", ci.quantity, (p.price * ci.quantity) AS subtotal FROM cart_items ci JOIN carts c ON c.id = ci.cart_id JOIN products p ON p.id = ci.product_id WHERE c.user_id = $1 ORDER BY p.name',
      [req.user.id],
    );
    res.json({
      items: rows,
      total: rows.reduce((sum, item) => sum + Number(item.subtotal), 0),
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not load cart", details: error.message });
  }
});
app.get("/api/orders", requireUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id AS "orderId", total, status, customer_name AS "customerName", phone, shipping_address AS "shippingAddress", payment_method AS "paymentMethod", created_at AS "createdAt" FROM orders WHERE user_id = $1 ORDER BY id DESC',
      [req.user.id],
    );
    const orders = await Promise.all(
      rows.map(async (order) => {
        const { rows: items } = await pool.query(
          'SELECT product_id AS "productId", product_name AS name, unit_price AS price, quantity FROM order_items WHERE order_id = $1 ORDER BY product_name',
          [order.orderId],
        );
        return { ...order, items };
      }),
    );
    res.json({ orders });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not load orders", details: error.message });
  }
});
app.post("/api/cart/items", requireUser, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = await cartId(client, req.user.id);
    await client.query(
      "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity",
      [id, Number(req.body.productId), Number(req.body.quantity || 1)],
    );
    res.status(201).json({ message: "Item added" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not update cart", details: error.message });
  } finally {
    client.release();
  }
});

app.post("/api/payments/create-order", requireUser, async (req, res) => {
  if (!razorpay)
    return res.status(503).json({ error: "Razorpay is not configured" });
  try {
    const {
      rows: [cart],
    } = await pool.query("SELECT id FROM carts WHERE user_id = $1", [
      req.user.id,
    ]);
    if (!cart) return res.status(400).json({ error: "Your cart is empty" });
    const {
      rows: [total],
    } = await pool.query(
      "SELECT COALESCE(SUM(p.price * ci.quantity), 0) AS total, COUNT(*) AS count FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = $1",
      [cart.id],
    );
    if (!Number(total.count))
      return res.status(400).json({ error: "Your cart is empty" });
    const order = await razorpay.orders.create({
      amount: Math.round(Number(total.total) * 100),
      currency: "INR",
      receipt: `goquick_${req.user.id}_${Date.now()}`,
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    res.status(502).json({
      error: "Could not create Razorpay order",
      details: error.message,
    });
  }
});
app.post("/api/payments/verify", requireUser, (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  if (!razorpayOrderId || !razorpayPaymentId || expected !== razorpaySignature)
    return res
      .status(400)
      .json({ error: "Razorpay payment verification failed" });
  res.json({ verified: true });
});

app.post("/api/orders", requireUser, async (req, res) => {
  const {
    customerName,
    phone,
    shippingAddress,
    paymentMethod,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = req.body;
  if (
    !customerName?.trim() ||
    !phone?.trim() ||
    !shippingAddress?.trim() ||
    !["UPI", "Debit Card", "Cash on Delivery"].includes(paymentMethod)
  )
    return res.status(400).json({
      error: "Name, phone, address, and a valid payment method are required",
    });
  if (paymentMethod === "UPI") {
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpayOrderId || ""}|${razorpayPaymentId || ""}`)
      .digest("hex");
    if (
      !razorpayOrderId ||
      !razorpayPaymentId ||
      expected !== razorpaySignature
    )
      return res.status(400).json({
        error:
          "UPI payment must be completed and verified before placing the order",
      });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [cart],
    } = await client.query(
      "SELECT id FROM carts WHERE user_id = $1 FOR UPDATE",
      [req.user.id],
    );
    if (!cart) throw new Error("Your cart is empty");
    const { rows: items } = await client.query(
      'SELECT ci.product_id AS "productId", ci.quantity, p.name, p.price, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = $1',
      [cart.id],
    );
    if (!items.length) throw new Error("Your cart is empty");
    if (items.some((item) => item.quantity > item.stock))
      throw new Error("One or more items are out of stock");
    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );
    const {
      rows: [order],
    } = await client.query(
      "INSERT INTO orders (user_id, total, customer_name, phone, shipping_address, payment_method, razorpay_order_id, razorpay_payment_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [
        req.user.id,
        total,
        customerName.trim(),
        phone.trim(),
        shippingAddress.trim(),
        paymentMethod,
        razorpayOrderId || null,
        razorpayPaymentId || null,
      ],
    );
    for (const item of items) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)",
        [order.id, item.productId, item.name, item.price, item.quantity],
      );
      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [item.quantity, item.productId],
      );
    }
    await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cart.id]);
    await client.query("COMMIT");
    res.status(201).json({ orderId: order.id, total, status: "pending" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.listen(port, () =>
  console.log(`GoQuick PostgreSQL API running at http://localhost:${port}`),
);
