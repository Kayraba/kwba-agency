const express = require("express");
const { Pool } = require("pg");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = process.env.JWT_SECRET || "agency-super-secret-key";

// --- DATABASE SETUP (Hybrid: Postgres for Production, SQLite for Local) ---
let db;
const isProduction = !!process.env.DATABASE_URL;

if (isProduction) {
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  const sqliteDb = new sqlite3.Database("./database.db");
  db = {
    query: (text, params) => {
      return new Promise((resolve, reject) => {
        const sql = text.replace(/\$(\d+)/g, "?");
        if (text.trim().toUpperCase().startsWith("SELECT")) {
          sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows });
          });
        } else {
          sqliteDb.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ rows: [], lastID: this.lastID, rowCount: this.changes });
          });
        }
      });
    }
  };
}

const initDb = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'admin',
      briefId INTEGER DEFAULT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS briefs (
      id SERIAL PRIMARY KEY,
      data TEXT,
      status TEXT DEFAULT 'new',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS outputs (
      id SERIAL PRIMARY KEY,
      briefId INTEGER,
      agent TEXT,
      output TEXT,
      isApproved INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      feedback TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      briefId INTEGER,
      name TEXT,
      url TEXT,
      tag TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      briefId INTEGER,
      stripeId TEXT,
      amount INTEGER,
      status TEXT DEFAULT 'sent',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      userEmail TEXT,
      action TEXT,
      entityType TEXT,
      entityId INTEGER,
      details TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS agents (
      type TEXT PRIMARY KEY,
      prompt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  ];

  for (let q of queries) {
    if (!isProduction) q = q.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT");
    await db.query(q).catch(e => console.log("Init Table Error:", e.message));
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync("admin123", salt);
  const adminEmail = "admin@kwba-agency.com";
  
  if (isProduction) {
    await db.query("INSERT INTO users (email, password, role) VALUES ($1, $2, 'admin') ON CONFLICT (email) DO NOTHING", [adminEmail, hash]);
  } else {
    await db.query("INSERT OR IGNORE INTO users (email, password, role) VALUES ($1, $2, 'admin')", [adminEmail, hash]);
  }
};

initDb();

// --- EMAIL SETUP ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || ""
  }
});

// --- CLOUDINARY SETUP ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "YOUR_CLOUD_NAME",
  api_key: process.env.CLOUDINARY_API_KEY || "YOUR_API_KEY",
  api_secret: process.env.CLOUDINARY_API_SECRET || "YOUR_API_SECRET"
});

const upload = multer({ dest: "uploads/" });

// --- AUTH MIDDLEWARE ---
const authenticate = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(403).send("Forbidden");
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send("Forbidden");
    req.user = decoded;
    next();
  });
};

// --- UTILS ---
async function logActivity(userEmail, action, entityType, entityId, details = "") {
  try {
    await db.query(
      "INSERT INTO activity (userEmail, action, entityType, entityId, details) VALUES ($1, $2, $3, $4, $5)",
      [userEmail, action, entityType, entityId, details]
    );
  } catch (e) {
    console.error("Activity Log Error:", e.message);
  }
}

// --- STRIPE INVOICE MOCK ---
app.post("/create-stripe-invoice", authenticate, async (req, res) => {
  const { briefId, amount, description, clientEmail } = req.body;
  
  // Logic from image:
  // const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  // const customer = await stripe.customers.create({ email: clientEmail, name: description });
  // const invoice = await stripe.invoices.create({ customer: customer.id, ... });
  
  try {
    const mockUrl = "https://stripe.com/invoice/mock_" + Date.now();
    await db.query(
      "INSERT INTO invoices (briefId, stripeId, amount, status) VALUES ($1, $2, $3, $4)",
      [briefId, "mock_stripe_id", amount, "sent"]
    );
    await logActivity(req.user.email, "create_invoice", "brief", briefId, `Amount: ${amount}`);
    res.send({ success: true, url: mockUrl });
  } catch (e) { res.status(500).send(e.message); }
});

// --- PROJECT STATUS TRACKER ---
const STAGES = ["new", "discovery", "in_progress", "review", "delivered"];

app.patch("/brief/:id/status", authenticate, async (req, res) => {
  const { status } = req.body;
  if (!STAGES.includes(status)) return res.status(400).send("Invalid status");
  
  try {
    await db.query("UPDATE briefs SET status = $1 WHERE id = $2", [status, req.params.id]);
    await logActivity(req.user.email, "update_status", "brief", req.params.id, `Status: ${status}`);
    res.send({ success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// --- ANALYTICS & ACTIVITY FEED ---
app.get("/activity", authenticate, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM activity ORDER BY createdAt DESC LIMIT 50");
    res.send(result.rows);
  } catch (e) { res.status(500).send(e.message); }
});

app.get("/analytics", authenticate, async (req, res) => {
  try {
    // Basic aggregation
    const briefsCount = await db.query("SELECT COUNT(*) as count, status FROM briefs GROUP BY status");
    const agentsUsage = await db.query("SELECT COUNT(*) as count, agent FROM outputs GROUP BY agent");
    const revenue = await db.query("SELECT SUM(amount) as total FROM invoices WHERE status = 'paid'");
    
    res.send({
      briefs: briefsCount.rows,
      agents: agentsUsage.rows,
      revenue: revenue.rows[0]?.total || 0
    });
  } catch (e) { res.status(500).send(e.message); }
});

// --- STREAMING AGENT PROXY ---
app.post("/stream-agent", authenticate, async (req, res) => {
  const { prompt } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) return res.status(500).send("Server missing Gemini Key");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const reader = response.body;
    reader.on('data', (chunk) => {
      res.write(chunk);
    });
    reader.on('end', () => res.end());
  } catch (e) {
    res.end(`data: {"error": "${e.message}"}`);
  }
});

// --- STANDARD ENDPOINTS ---

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = result.rows[0];
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).send("Invalid");
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, briefId: user.briefid || user.briefId }, JWT_SECRET, { expiresIn: "24h" });
  res.send({ token, role: user.role, briefId: user.briefid || user.briefId });
});

// PUBLIC INTAKE
app.post("/public-brief", async (req, res) => {
  const data = JSON.stringify(req.body);
  try {
    const result = await db.query("INSERT INTO briefs (data, status) VALUES ($1, 'new') RETURNING id", [data]);
    const id = isProduction ? result.rows[0].id : result.lastID;
    
    // Auto followup notification?
    await logActivity("system@public", "submit_brief", "brief", id, `Public submission: ${req.body.bizName}`);
    
    res.send({ id });
  } catch (e) { res.status(500).send(e.message); }
});

app.get("/briefs", authenticate, async (req, res) => {
  const result = await db.query("SELECT * FROM briefs ORDER BY id DESC");
  res.send(result.rows.map(r => ({ id: r.id, status: r.status, ...JSON.parse(r.data) })));
});

app.post("/output", authenticate, async (req, res) => {
  const { briefId, agent, output } = req.body;
  if (isProduction) {
    await db.query("INSERT INTO outputs (briefId, agent, output) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [briefId, agent, output]);
  } else {
    await db.query("INSERT INTO outputs (briefId, agent, output) VALUES ($1, $2, $3)", [briefId, agent, output]);
  }
  await logActivity(req.user.email, "run_agent", "brief", briefId, `Agent: ${agent}`);
  res.send({ success: true });
});

app.post("/rate-output", authenticate, async (req, res) => {
  const { briefId, agent, rating, feedback } = req.body;
  await db.query("UPDATE outputs SET rating = $1, feedback = $2 WHERE briefId = $3 AND agent = $4", [rating, feedback, briefId, agent]);
  res.send({ success: true });
});

app.get("/client-portal/data", authenticate, async (req, res) => {
  const briefId = req.user.briefId || req.user.briefid;
  const briefRes = await db.query("SELECT * FROM briefs WHERE id = $1", [briefId]);
  const outputRes = await db.query("SELECT agent, output FROM outputs WHERE briefId = $1 AND isApproved = 1", [briefId]);
  const filesRes = await db.query("SELECT * FROM files WHERE briefId = $1", [briefId]);
  res.send({ 
    brief: JSON.parse(briefRes.rows[0].data), 
    outputs: outputRes.rows,
    files: filesRes.rows 
  });
});

app.get("/settings", authenticate, async (req, res) => {
  const result = await db.query("SELECT * FROM settings");
  const settings = {};
  result.rows.forEach(r => settings[r.key] = r.value);
  res.send(settings);
});

app.post("/settings", authenticate, async (req, res) => {
  const { key, value } = req.body;
  if (isProduction) {
    await db.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, value]);
  } else {
    await db.query("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [key, value]);
  }
  res.send({ success: true });
});

app.post("/create-client", authenticate, async (req, res) => {
  const { email, password, briefId } = req.body;
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  try {
    if (isProduction) {
        await db.query("INSERT INTO users (email, password, role, briefId) VALUES ($1, $2, 'client', $3) ON CONFLICT (email) DO UPDATE SET password = $2, briefId = $3", [email, hash, briefId]);
    } else {
        await db.query("INSERT OR REPLACE INTO users (email, password, role, briefId) VALUES ($1, $2, 'client', $3)", [email, hash, briefId]);
    }
    res.send({ success: true });
  } catch(e) { res.status(500).send(e.message); }
});

app.use(express.static("."));
app.listen(3000, () => console.log("KWBA Pro OS running on 3000"));
