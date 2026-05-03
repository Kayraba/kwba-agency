const express = require("express");
const { Pool } = require("pg");
// sqlite3 only loaded in local dev — Render uses PostgreSQL
const sqlite3 = process.env.DATABASE_URL ? null : require("sqlite3").verbose();
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
// CORS: open locally, locked to your Netlify URL in production
app.use(cors({
  origin: (origin, callback) => {
    // Build allow-list from env vars (FRONTEND_URL, plus optional comma-separated PROSPECTOR_ORIGINS)
    const explicit = (process.env.PROSPECTOR_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowed = [
      process.env.FRONTEND_URL,
      "http://localhost:3000", "http://127.0.0.1:3000",
      "https://kwba-agency.onrender.com",
      ...explicit
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) return callback(null, true);
    // For *.netlify.app and *.vercel.app preview hosts (common static-host patterns)
    if (/^https:\/\/[a-z0-9-]+\.(netlify\.app|vercel\.app|onrender\.com|github\.io|pages\.dev)$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true
}));

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
    )`,
    `CREATE TABLE IF NOT EXISTS chatbots (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      business_name TEXT NOT NULL,
      niche TEXT,
      city TEXT,
      phone TEXT,
      email TEXT,
      color TEXT DEFAULT '#c9a84c',
      avatar TEXT DEFAULT '💬',
      knowledge_base TEXT,
      system_prompt TEXT,
      hours TEXT,
      services TEXT,
      pricing TEXT,
      service_area TEXT,
      about TEXT,
      wont_do TEXT,
      booking_url TEXT,
      lead_threshold INT DEFAULT 3,
      welcome_message TEXT,
      tone TEXT DEFAULT 'warm-professional',
      owner_user_id INT,
      status TEXT DEFAULT 'active',
      total_conversations INT DEFAULT 0,
      total_leads INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id SERIAL PRIMARY KEY,
      chatbot_slug TEXT NOT NULL,
      session_id TEXT NOT NULL,
      messages TEXT,
      lead_captured INT DEFAULT 0,
      lead_data TEXT,
      visitor_meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
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

// ========================================================================
// PUBLIC AUDIT ENDPOINT — used by the standalone audits.html platform.
// IP rate-limited to 3 audits/hour to prevent Gemini API key abuse.
// ========================================================================
const auditRateLimits = new Map(); // IP -> [timestamps]
function checkAuditRateLimit(ip) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const timestamps = (auditRateLimits.get(ip) || []).filter(t => now - t < oneHour);
  if (timestamps.length >= 3) return false;
  timestamps.push(now);
  auditRateLimits.set(ip, timestamps);
  // Periodic cleanup so the Map doesn't leak
  if (auditRateLimits.size > 1000) {
    for (const [k, v] of auditRateLimits) {
      if (v.every(t => now - t > oneHour)) auditRateLimits.delete(k);
    }
  }
  return true;
}

app.post("/public-audit", async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  if (!checkAuditRateLimit(ip)) {
    return res.status(429).send("Rate limit reached — please try again in an hour, or contact us at hello@kwba.co.uk for a full audit.");
  }

  const { prompt, leadCapture } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.length < 50) {
    return res.status(400).send("Invalid audit request");
  }
  if (prompt.length > 8000) {
    return res.status(400).send("Audit input too large");
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).send("Server missing Gemini Key");

  // Optionally capture the lead's contact details for follow-up
  if (leadCapture && leadCapture.email) {
    try {
      await logActivity(leadCapture.email, "audit_request", "audit", 0,
        `Audit lead: ${leadCapture.name || '?'} from ${leadCapture.business || '?'} (${leadCapture.city || '?'})`);
    } catch (e) { /* logging is best-effort */ }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const reader = response.body;
    reader.on('data', (chunk) => { res.write(chunk); });
    reader.on('end', () => res.end());
    reader.on('error', (err) => res.end(`data: {"error": "${err.message}"}`));
  } catch (e) {
    res.end(`data: {"error": "${e.message}"}`);
  }
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
    // Send portal invite email if SMTP configured
    if (process.env.SMTP_USER) {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: "Your KWBA Client Portal Access",
        html: `<p>Your client portal is ready.</p><p><strong>Email:</strong> ${email}<br><strong>Password:</strong> ${password}</p><p><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/portal.html">Log in here</a></p>`
      });
    }
    res.send({ success: true });
  } catch(e) { res.status(500).send(e.message); }
});

// ===== STAFF MANAGEMENT =====
// Create a new staff member with full admin access. Only existing admins can call this.
app.post("/create-staff", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send("Admin access required");
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).send("Email and password required");
  if (password.length < 8) return res.status(400).send("Password must be at least 8 characters");
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  try {
    if (isProduction) {
      await db.query("INSERT INTO users (email, password, role) VALUES ($1, $2, 'admin') ON CONFLICT (email) DO UPDATE SET password = $2, role = 'admin'", [email, hash]);
    } else {
      await db.query("INSERT OR REPLACE INTO users (email, password, role) VALUES ($1, $2, 'admin')", [email, hash]);
    }
    // Send invite email if SMTP configured
    if (process.env.SMTP_USER) {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: "You've been added to KWBA Agency OS",
        html: `<p>${name ? 'Hi ' + name + ',' : 'Hello,'}</p><p>You've been given full admin access to the KWBA Agency OS.</p><p><strong>Email:</strong> ${email}<br><strong>Password:</strong> ${password}</p><p><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/login.html">Log in here</a></p><p>Please change your password after your first login.</p>`
      });
    }
    res.send({ success: true });
  } catch(e) { res.status(500).send(e.message); }
});

// List all staff (admin role users)
app.get("/staff", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send("Admin access required");
  try {
    const result = await db.query("SELECT id, email, role FROM users WHERE role = 'admin' ORDER BY id ASC");
    const rows = isProduction ? result.rows : result;
    res.send(rows);
  } catch(e) { res.status(500).send(e.message); }
});

// Delete a staff member (cannot delete yourself)
app.delete("/staff/:id", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send("Admin access required");
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).send("You cannot delete your own account");
  try {
    await db.query("DELETE FROM users WHERE id = $1 AND role = 'admin'", [id]);
    res.send({ success: true });
  } catch(e) { res.status(500).send(e.message); }
});

// =====================================================================
// GOOGLE PLACES SEARCH — server-side proxy, key never touches frontend
// =====================================================================
const placesRateLimits = new Map();
function checkPlacesLimit(userId) {
  const now = Date.now();
  const win = 60 * 60 * 1000; // 1 hour
  const ts = (placesRateLimits.get(userId) || []).filter(t => now - t < win);
  if (ts.length >= 30) return false;
  ts.push(now);
  placesRateLimits.set(userId, ts);
  return true;
}

app.post("/api/places-search", authenticate, async (req, res) => {
  const userId = req.user.id;
  if (!checkPlacesLimit(userId)) return res.status(429).send("Rate limit: 30 searches/hour. Wait or contact admin.");
  const { query, city, maxResults } = req.body;
  if (!query || typeof query !== 'string' || query.length < 2) return res.status(400).send("Query required");
  const placesKey = process.env.GOOGLE_PLACES_KEY;
  if (!placesKey) return res.status(500).send("GOOGLE_PLACES_KEY not configured on server");
  const limit = Math.min(parseInt(maxResults) || 50, 60);
  const searchText = city ? `${query} in ${city}, UK` : `${query} UK`;
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': [
          'places.id','places.displayName','places.formattedAddress',
          'places.addressComponents','places.nationalPhoneNumber',
          'places.websiteUri','places.rating','places.userRatingCount',
          'places.types','places.primaryType','places.businessStatus',
          'places.location','places.regularOpeningHours'
        ].join(',')
      },
      body: JSON.stringify({
        textQuery: searchText,
        pageSize: limit,
        locationBias: {
          rectangle: {
            low:  { latitude: 49.8, longitude: -8.6 },
            high: { latitude: 60.9, longitude:  1.8 }
          }
        }
      })
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).send('Places API error: ' + err);
    }
    const data = await response.json();
    const places = (data.places || [])
      .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY')
      .map(p => {
        const cityComp = (p.addressComponents || []).find(c =>
          c.types && (c.types.includes('postal_town') || c.types.includes('locality'))
        );
        return {
          placeId: p.id,
          name: p.displayName?.text || '',
          address: p.formattedAddress || '',
          city: cityComp?.longText || city || '',
          phone: p.nationalPhoneNumber || '',
          website: p.websiteUri || '',
          rating: p.rating || null,
          reviews: p.userRatingCount || null,
          category: p.primaryType || (p.types && p.types[0]) || '',
          types: p.types || [],
          lat: p.location?.latitude || null,
          lng: p.location?.longitude || null,
          hasHours: !!(p.regularOpeningHours)
        };
      });
    await logActivity(req.user.email, "places_search", "search", 0, `"${searchText}" → ${places.length} results`);
    res.send({ query: searchText, places, count: places.length });
  } catch (e) {
    res.status(500).send('Places search failed: ' + e.message);
  }
});

// =====================================================================
// OUTREACH QUEUE — store, list, mark sent/skip
// =====================================================================

// Create outreach sequence (called after audit is generated)
app.post("/api/outreach", authenticate, async (req, res) => {
  const { prospect, messages } = req.body;
  if (!prospect || !messages || !Array.isArray(messages)) return res.status(400).send("prospect and messages[] required");
  try {
    // Store as a brief so it shows in admin, tagged as outreach
    const sequenceData = JSON.stringify({ prospect, messages, createdAt: new Date().toISOString(), status: 'pending', sentCount: 0 });
    const result = await db.query(
      "INSERT INTO briefs (data, status) VALUES ($1, 'outreach') RETURNING id",
      [sequenceData]
    );
    const id = isProduction ? result.rows[0].id : result.lastID;
    await logActivity(req.user.email, "outreach_created", "brief", id, `Outreach sequence: ${prospect.name}`);
    res.send({ id, success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// List all outreach sequences
app.get("/api/outreach", authenticate, async (req, res) => {
  try {
    const result = await db.query("SELECT id, data, created_at FROM briefs WHERE status = 'outreach' ORDER BY id DESC LIMIT 100");
    const rows = isProduction ? result.rows : result;
    res.send(rows.map(r => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.data) })));
  } catch (e) { res.status(500).send(e.message); }
});

// Update outreach sequence status (mark sent, skip, etc.)
app.patch("/api/outreach/:id", authenticate, async (req, res) => {
  const { updates } = req.body;
  try {
    const result = await db.query("SELECT data FROM briefs WHERE id = $1 AND status = 'outreach'", [parseInt(req.params.id)]);
    const rows = isProduction ? result.rows : result;
    if (!rows.length) return res.status(404).send("Not found");
    const current = JSON.parse(rows[0].data);
    const updated = { ...current, ...updates };
    await db.query("UPDATE briefs SET data = $1 WHERE id = $2", [JSON.stringify(updated), parseInt(req.params.id)]);
    res.send({ success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// =====================================================================
// AI CHATBOT — multi-tenant AI receptionist product
// Each client gets their own /chatbot/:slug endpoint with their own
// knowledge base, system prompt, and lead capture rules.
// =====================================================================

// Rate limiting per chatbot session — prevent abuse
const chatRateLimits = new Map();
function checkChatLimit(sessionKey) {
  const now = Date.now();
  const win = 60 * 1000; // 1 minute window
  const ts = (chatRateLimits.get(sessionKey) || []).filter(t => now - t < win);
  if (ts.length >= 20) return false; // 20 messages per minute per session
  ts.push(now);
  chatRateLimits.set(sessionKey, ts);
  // Cleanup
  if (chatRateLimits.size > 5000) {
    for (const [k, v] of chatRateLimits) {
      if (v.every(t => now - t > win)) chatRateLimits.delete(k);
    }
  }
  return true;
}

// Build the AI receptionist system prompt from a chatbot config
function buildChatbotSystemPrompt(c) {
  const lines = [];
  lines.push(`You are the AI receptionist for ${c.business_name}${c.city ? ', a ' + (c.niche || 'local business') + ' in ' + c.city + ', UK' : ''}.`);
  lines.push(`You speak in a warm, professional UK English tone — like an experienced receptionist who knows the business inside out. Concise. Helpful. Never robotic.`);
  lines.push('');
  lines.push('=== YOUR ABSOLUTE RULES ===');
  lines.push('1. NEVER invent prices, services, hours, or capabilities not listed below. If unsure, say "I\'ll have someone confirm that when they call you back."');
  lines.push('2. Your goal is to capture qualified leads — name, phone number, what they need. Get to that goal naturally, never robotically.');
  lines.push('3. Keep messages short (1-3 sentences usually). Real receptionists don\'t write essays.');
  lines.push('4. UK English throughout. Use £ for prices. No US-isms.');
  lines.push('5. If asked something not in the knowledge below, acknowledge honestly: "Let me get someone to confirm that for you — what\'s the best number to call you back on?"');
  lines.push('6. When the user mentions an enquiry/job/booking, gently capture (in this order): what they need → name → phone → confirm callback.');
  lines.push('7. Do NOT capture info via emoji-bombs or pushiness. One question at a time.');
  lines.push('8. If user is rude, abusive, or off-topic, stay polite and redirect: "Happy to help with anything about ' + c.business_name + ' — what brings you here today?"');
  lines.push('9. NEVER say "as an AI" or break character. You ARE the receptionist for this business.');
  lines.push('10. When you have name + phone + intent, end your reply with: [LEAD_CAPTURED] on its own line. The system will detect this and save the lead.');
  lines.push('');
  lines.push('=== ABOUT THE BUSINESS ===');
  lines.push('Name: ' + c.business_name);
  if (c.niche) lines.push('Type: ' + c.niche);
  if (c.city) lines.push('Location: ' + c.city + ', UK');
  if (c.about) lines.push('About: ' + c.about);
  if (c.hours) lines.push('Hours: ' + c.hours);
  if (c.services) lines.push('Services we offer:\n' + c.services);
  if (c.pricing) lines.push('Pricing guidance (use these as ranges, never quote exact prices unless explicitly listed):\n' + c.pricing);
  if (c.service_area) lines.push('Service area: ' + c.service_area);
  if (c.wont_do) lines.push('We do NOT offer: ' + c.wont_do);
  if (c.phone) lines.push('Direct phone (only share if user asks for it): ' + c.phone);
  if (c.email) lines.push('Direct email (only if asked): ' + c.email);
  if (c.booking_url) lines.push('Online booking: ' + c.booking_url);
  if (c.knowledge_base) lines.push('Additional knowledge:\n' + c.knowledge_base);
  if (c.system_prompt) {
    lines.push('');
    lines.push('=== ADDITIONAL OWNER INSTRUCTIONS ===');
    lines.push(c.system_prompt);
  }
  return lines.join('\n');
}

// Helper to fetch a chatbot by slug
async function getChatbotBySlug(slug) {
  const r = await db.query("SELECT * FROM chatbots WHERE slug = $1 AND status = 'active'", [slug]);
  const rows = isProduction ? r.rows : r;
  return rows[0] || null;
}

// PUBLIC — get chatbot's public config (used by widget at load time)
app.get("/api/chatbot/:slug", async (req, res) => {
  try {
    const c = await getChatbotBySlug(req.params.slug);
    if (!c) return res.status(404).send("Chatbot not found");
    // Strip private fields — only return what the widget needs
    res.send({
      slug: c.slug,
      business_name: c.business_name,
      niche: c.niche,
      city: c.city,
      color: c.color || '#c9a84c',
      avatar: c.avatar || '💬',
      welcome_message: c.welcome_message || `Hi! I'm the AI receptionist for ${c.business_name}. How can I help you today?`,
      phone: c.phone || null,
      email: c.email || null,
      booking_url: c.booking_url || null
    });
  } catch (e) { res.status(500).send(e.message); }
});

// PUBLIC — chat with the AI receptionist
app.post("/api/chatbot/:slug/chat", async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  const { sessionId, messages } = req.body;
  if (!sessionId || typeof sessionId !== 'string') return res.status(400).send("sessionId required");
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).send("messages array required");

  const sessionKey = req.params.slug + ':' + sessionId;
  if (!checkChatLimit(sessionKey)) return res.status(429).send("Rate limit reached. Please wait a moment.");

  // Validate message format
  for (const m of messages) {
    if (!m || !['user','model'].includes(m.role) || typeof m.text !== 'string') {
      return res.status(400).send("Invalid message format");
    }
    if (m.text.length > 2000) return res.status(400).send("Message too long");
  }
  if (messages.length > 40) return res.status(400).send("Conversation too long");

  const chatbot = await getChatbotBySlug(req.params.slug);
  if (!chatbot) return res.status(404).send("Chatbot not found");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).send("AI not configured");

  const systemPrompt = buildChatbotSystemPrompt(chatbot);

  // Build Gemini request — system_instruction + conversation history
  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    })),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 400,
      topP: 0.95
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody)
      }
    );
    if (!response.ok) {
      const err = await response.text();
      console.log('Gemini error:', err);
      return res.status(500).send("AI temporarily unavailable. Please try again.");
    }
    const data = await response.json();
    let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!aiText) return res.status(500).send("AI returned empty response");

    // Detect lead capture marker
    const leadCaptured = aiText.includes('[LEAD_CAPTURED]');
    aiText = aiText.replace(/\[LEAD_CAPTURED\]/g, '').trim();

    // Save/update conversation
    const fullMessages = [...messages, { role: 'model', text: aiText }];
    try {
      const existing = await db.query(
        "SELECT id FROM chatbot_conversations WHERE chatbot_slug = $1 AND session_id = $2",
        [req.params.slug, sessionId]
      );
      const exRows = isProduction ? existing.rows : existing;
      if (exRows.length) {
        await db.query(
          "UPDATE chatbot_conversations SET messages = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [JSON.stringify(fullMessages), exRows[0].id]
        );
      } else {
        await db.query(
          "INSERT INTO chatbot_conversations (chatbot_slug, session_id, messages, visitor_meta) VALUES ($1, $2, $3, $4)",
          [req.params.slug, sessionId, JSON.stringify(fullMessages), JSON.stringify({ ip, ua: req.headers['user-agent'] || '' })]
        );
        // Increment conversation counter on chatbot
        if (isProduction) await db.query("UPDATE chatbots SET total_conversations = total_conversations + 1 WHERE slug = $1", [req.params.slug]);
        else await db.query("UPDATE chatbots SET total_conversations = total_conversations + 1 WHERE slug = $1", [req.params.slug]);
      }
    } catch (e) { /* logging is best-effort */ }

    res.send({
      reply: aiText,
      leadCaptured: leadCaptured
    });
  } catch (e) {
    res.status(500).send("AI request failed: " + e.message);
  }
});

// PUBLIC — explicitly capture a lead (called when chatbot returns leadCaptured: true,
// or when the user fills a final form)
app.post("/api/chatbot/:slug/lead", async (req, res) => {
  const { sessionId, lead } = req.body;
  if (!sessionId || !lead) return res.status(400).send("sessionId and lead required");
  const chatbot = await getChatbotBySlug(req.params.slug);
  if (!chatbot) return res.status(404).send("Chatbot not found");

  try {
    // Update conversation row
    await db.query(
      "UPDATE chatbot_conversations SET lead_captured = 1, lead_data = $1, updated_at = CURRENT_TIMESTAMP WHERE chatbot_slug = $2 AND session_id = $3",
      [JSON.stringify(lead), req.params.slug, sessionId]
    );
    // Increment lead counter
    await db.query("UPDATE chatbots SET total_leads = total_leads + 1 WHERE slug = $1", [req.params.slug]);

    // Also create a brief in the main admin so KWBA team sees it
    const briefData = JSON.stringify({
      bizName: chatbot.business_name,
      contact: lead.name || 'Chatbot lead',
      email: lead.email || '',
      phone: lead.phone || '',
      city: chatbot.city || '',
      industry: chatbot.niche || '',
      source: 'ai-chatbot:' + req.params.slug,
      message: lead.message || '',
      chatLead: lead
    });
    await db.query("INSERT INTO briefs (data, status) VALUES ($1, 'new')", [briefData]);

    await logActivity('chatbot@public', 'chatbot_lead', 'chatbot', 0, `Lead from ${chatbot.business_name}: ${lead.name || '?'} ${lead.phone || ''}`);

    res.send({ success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// ADMIN — list all chatbots (KWBA team or specific owner)
app.get("/api/chatbots", authenticate, async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'admin') {
      query = "SELECT id, slug, business_name, niche, city, color, status, total_conversations, total_leads, created_at, owner_user_id FROM chatbots ORDER BY id DESC";
      params = [];
    } else {
      query = "SELECT id, slug, business_name, niche, city, color, status, total_conversations, total_leads, created_at FROM chatbots WHERE owner_user_id = $1 ORDER BY id DESC";
      params = [req.user.id];
    }
    const r = await db.query(query, params);
    const rows = isProduction ? r.rows : r;
    res.send(rows);
  } catch (e) { res.status(500).send(e.message); }
});

// ADMIN — fetch single chatbot full config
app.get("/api/chatbots/:slug", authenticate, async (req, res) => {
  try {
    const c = await getChatbotBySlug(req.params.slug);
    if (!c) return res.status(404).send("Not found");
    if (req.user.role !== 'admin' && c.owner_user_id !== req.user.id) return res.status(403).send("Forbidden");
    res.send(c);
  } catch (e) { res.status(500).send(e.message); }
});

// ADMIN — create new chatbot
app.post("/api/chatbots", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send("Admin only");
  const b = req.body;
  if (!b.business_name) return res.status(400).send("business_name required");

  // Generate slug from business name + random suffix
  let baseSlug = (b.business_name || 'chatbot').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'chatbot';
  let slug = b.slug || (baseSlug + '-' + Math.random().toString(36).slice(2, 7));

  try {
    // Check slug availability
    const exists = await db.query("SELECT 1 FROM chatbots WHERE slug = $1", [slug]);
    const exRows = isProduction ? exists.rows : exists;
    if (exRows.length) slug = baseSlug + '-' + Math.random().toString(36).slice(2, 8);

    const fields = ['slug','business_name','niche','city','phone','email','color','avatar',
      'knowledge_base','system_prompt','hours','services','pricing','service_area','about',
      'wont_do','booking_url','lead_threshold','welcome_message','tone','owner_user_id'];
    const values = [slug, b.business_name, b.niche || null, b.city || null, b.phone || null,
      b.email || null, b.color || '#c9a84c', b.avatar || '💬', b.knowledge_base || null,
      b.system_prompt || null, b.hours || null, b.services || null, b.pricing || null,
      b.service_area || null, b.about || null, b.wont_do || null, b.booking_url || null,
      b.lead_threshold || 3, b.welcome_message || null, b.tone || 'warm-professional',
      b.owner_user_id || null];

    const placeholders = values.map((_, i) => '$' + (i + 1)).join(', ');
    const result = await db.query(
      `INSERT INTO chatbots (${fields.join(',')}) VALUES (${placeholders}) RETURNING id, slug`,
      values
    );
    const row = isProduction ? result.rows[0] : { id: result.lastID, slug };
    await logActivity(req.user.email, 'chatbot_create', 'chatbot', row.id, b.business_name);
    res.send({ id: row.id, slug: row.slug, success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// ADMIN — update chatbot
app.patch("/api/chatbots/:slug", authenticate, async (req, res) => {
  const allowed = ['business_name','niche','city','phone','email','color','avatar',
    'knowledge_base','system_prompt','hours','services','pricing','service_area',
    'about','wont_do','booking_url','lead_threshold','welcome_message','tone','status'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (Object.keys(updates).length === 0) return res.status(400).send("No valid fields");

  try {
    const c = await getChatbotBySlug(req.params.slug);
    if (!c) return res.status(404).send("Not found");
    if (req.user.role !== 'admin' && c.owner_user_id !== req.user.id) return res.status(403).send("Forbidden");

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(updates), req.params.slug];
    await db.query(
      `UPDATE chatbots SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE slug = $${values.length}`,
      values
    );
    await logActivity(req.user.email, 'chatbot_update', 'chatbot', c.id, c.business_name);
    res.send({ success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// ADMIN — delete chatbot
app.delete("/api/chatbots/:slug", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send("Admin only");
  try {
    await db.query("DELETE FROM chatbots WHERE slug = $1", [req.params.slug]);
    res.send({ success: true });
  } catch (e) { res.status(500).send(e.message); }
});

// ADMIN — list conversations for a chatbot
app.get("/api/chatbots/:slug/conversations", authenticate, async (req, res) => {
  try {
    const c = await getChatbotBySlug(req.params.slug);
    if (!c) return res.status(404).send("Not found");
    if (req.user.role !== 'admin' && c.owner_user_id !== req.user.id) return res.status(403).send("Forbidden");
    const r = await db.query(
      "SELECT id, session_id, messages, lead_captured, lead_data, visitor_meta, created_at, updated_at FROM chatbot_conversations WHERE chatbot_slug = $1 ORDER BY id DESC LIMIT 200",
      [req.params.slug]
    );
    const rows = isProduction ? r.rows : r;
    res.send(rows);
  } catch (e) { res.status(500).send(e.message); }
});

// File upload — Cloudinary in production, local /uploads in dev
app.post("/upload", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file uploaded");
    let url = `/uploads/${req.file.filename}`;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "kwba-agency" });
      url = result.secure_url;
      fs.unlinkSync(req.file.path);
    }
    const { briefId, tag } = req.body;
    await db.query("INSERT INTO files (briefId, name, url, tag) VALUES ($1, $2, $3, $4)", [briefId, req.file.originalname, url, tag || "general"]);
    res.send({ success: true, url });
  } catch (e) { res.status(500).send(e.message); }
});

app.use("/uploads", express.static("uploads"));
app.use(express.static("."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KWBA Pro OS running on port ${PORT}`));
