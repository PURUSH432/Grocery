import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 4173);
const root = path.dirname(fileURLToPath(import.meta.url));
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "goquick",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
});
const jwtSecret = process.env.JWT_SECRET || "development-secret-change-me";
const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

app.use(express.json());
app.use(express.static(root));

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    jwtSecret,
    { expiresIn: "7d" },
  );
}

function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function getOrCreateCart(connection, userId) {
  await connection.query(
    "INSERT INTO carts (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)",
    [userId],
  );
  const [[cart]] = await connection.query(
    "SELECT id FROM carts WHERE user_id = ?",
    [userId],
  );
  return cart.id;
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: "unavailable",
      error:
        error.code ||
        error.message ||
        "Check that MySQL is running and .env is configured",
    });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const category = req.query.category;
    const [rows] =
      category && category !== "All"
        ? await pool.query(
            "SELECT id, name, category, price, unit, image_url AS imageUrl, stock FROM products WHERE category = ? ORDER BY id",
            [category],
          )
        : await pool.query(
            "SELECT id, name, category, price, unit, image_url AS imageUrl, stock FROM products ORDER BY id",
          );
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not load products", details: error.message });
  }
});

app.post("/api/payments/create-order", requireUser, async (req, res) => {
  if (!razorpay)
    return res.status(503).json({
      error:
        "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env",
    });
  try {
    const [[cart]] = await pool.query(
      "SELECT id FROM carts WHERE user_id = ?",
      [req.user.id],
    );
    if (!cart) return res.status(400).json({ error: "Your cart is empty" });
    const [[result]] = await pool.query(
      "SELECT COALESCE(SUM(p.price * ci.quantity), 0) AS total, COUNT(*) AS itemCount FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ?",
      [cart.id],
    );
    if (!Number(result.itemCount))
      return res.status(400).json({ error: "Your cart is empty" });
    const paymentOrder = await razorpay.orders.create({
      amount: Math.round(Number(result.total) * 100),
      currency: "INR",
      receipt: `goquick_${req.user.id}_${Date.now()}`,
      notes: { userId: String(req.user.id) },
    });
    res.json({
      orderId: paymentOrder.id,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    res.status(502).json({
      error: "Could not create Razorpay order",
      details: error.message,
    });
  }
});

app.post("/api/payments/verify", requireUser, async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
    return res
      .status(400)
      .json({ error: "Incomplete Razorpay payment response" });
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  if (expected !== razorpaySignature)
    return res
      .status(400)
      .json({ error: "Razorpay payment verification failed" });
  res.json({ verified: true });
});

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  if (
    !name ||
    !email ||
    !email.includes("@") ||
    !password ||
    password.length < 8
  )
    return res.status(400).json({
      error:
        "Enter a valid name, email address, and password of at least 8 characters",
    });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash],
    );
    const user = {
      id: result.insertId,
      name,
      email,
    };
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      error:
        error.code === "ER_DUP_ENTRY"
          ? "Email is already registered"
          : "Could not create account",
      details: error.code === "ER_DUP_ENTRY" ? undefined : error.message,
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [[user]] = await pool.query(
      "SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = ?",
      [email?.toLowerCase().trim()],
    );
    if (!user || !(await bcrypt.compare(password || "", user.passwordHash)))
      return res.status(401).json({ error: "Incorrect email or password" });
    delete user.passwordHash;
    res.json({ user, token: createToken(user) });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not sign in", details: error.message });
  }
});

app.get("/api/cart", requireUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT p.id, p.name, p.price, p.unit, p.image_url AS imageUrl, ci.quantity, (p.price * ci.quantity) AS subtotal FROM cart_items ci JOIN carts c ON c.id = ci.cart_id JOIN products p ON p.id = ci.product_id WHERE c.user_id = ? ORDER BY p.name",
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
    const [rows] = await pool.query(
      "SELECT id AS orderId, total, status, customer_name AS customerName, phone, shipping_address AS shippingAddress, payment_method AS paymentMethod, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY id DESC",
      [req.user.id],
    );
    const orders = await Promise.all(
      rows.map(async (order) => {
        const [items] = await pool.query(
          "SELECT product_id AS productId, product_name AS name, unit_price AS price, quantity FROM order_items WHERE order_id = ? ORDER BY product_name",
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
  const productId = Number(req.body.productId);
  const quantity = Number(req.body.quantity || 1);
  if (!productId || quantity < 1)
    return res
      .status(400)
      .json({ error: "A valid product and quantity are required" });
  const connection = await pool.getConnection();
  try {
    const cartId = await getOrCreateCart(connection, req.user.id);
    await connection.query(
      "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)",
      [cartId, productId, quantity],
    );
    res.status(201).json({ message: "Item added" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not update cart", details: error.message });
  } finally {
    connection.release();
  }
});

app.post("/api/orders", requireUser, async (req, res) => {
  const address = req.body.shippingAddress?.trim();
  const customerName = req.body.customerName?.trim();
  const phone = req.body.phone?.trim();
  const paymentMethod = req.body.paymentMethod;
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const paymentMethods = ["UPI", "Debit Card", "Cash on Delivery"];
  if (
    !customerName ||
    !address ||
    !phone ||
    !paymentMethods.includes(paymentMethod)
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[cart]] = await connection.query(
      "SELECT id FROM carts WHERE user_id = ? FOR UPDATE",
      [req.user.id],
    );
    if (!cart) return res.status(400).json({ error: "Your cart is empty" });
    const [items] = await connection.query(
      "SELECT ci.product_id AS productId, ci.quantity, p.name, p.price, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ?",
      [cart.id],
    );
    if (!items.length)
      return res.status(400).json({ error: "Your cart is empty" });
    if (items.some((item) => item.quantity > item.stock))
      return res
        .status(409)
        .json({ error: "One or more items are out of stock" });
    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );
    const [order] = await connection.query(
      "INSERT INTO orders (user_id, total, customer_name, phone, shipping_address, payment_method, razorpay_order_id, razorpay_payment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        total,
        customerName,
        phone,
        address,
        paymentMethod,
        razorpayOrderId || null,
        razorpayPaymentId || null,
      ],
    );
    for (const item of items) {
      await connection.query(
        "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)",
        [order.insertId, item.productId, item.name, item.price, item.quantity],
      );
      await connection.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.productId],
      );
    }
    await connection.query("DELETE FROM cart_items WHERE cart_id = ?", [
      cart.id,
    ]);
    await connection.commit();
    res.status(201).json({ orderId: order.insertId, total, status: "pending" });
  } catch (error) {
    await connection.rollback();
    res
      .status(500)
      .json({ error: "Could not create order", details: error.message });
  } finally {
    connection.release();
  }
});

app.listen(port, () =>
  console.log(`GoQuick running at http://localhost:${port}`),
);
