/**
 * Agent V2 — the agency's Gemini agent endpoint, mounted alongside the older
 * /stream-agent so the existing admin UI keeps working.
 *
 * What it does beyond a plain generateContent call:
 *   - Function calling with four tools (fetch_url, google_search,
 *     lookup_companies_house, search_past_outputs), looped up to 4 rounds.
 *   - Retrieval over past outputs: each saved output is embedded with
 *     text-embedding-004 and ranked by cosine similarity, top 3 rated >=4
 *     injected as few-shot examples.
 *   - A per-agent output check (required sections, as regexes) with one retry
 *     when sections are missing.
 *   - Regex PII/banned-phrase scan before the text is returned.
 *   - A row per run in agent_runs: latency, token counts, estimated cost.
 *
 * Two things this is NOT, despite the table names:
 *   - It is not a vector database. Similarity is a JS loop over the 200 most
 *     recent rows. pgvector gets enabled on Postgres but nothing queries it
 *     with a vector operator, so at this corpus size it buys nothing. Rewrite
 *     the query as `ORDER BY embedding <=> $1 LIMIT k` before the table grows.
 *   - The output check is a regex section-presence test, not a quality eval.
 *     It catches a truncated draft; it cannot tell a good strategy from a bad
 *     one.
 */

const fetch = require('node-fetch');
const { safeFetch, BlockedUrlError } = require('./lib/safe-fetch');

// ─── Configuration ───────────────────────────────────────────────────────────
const GEMINI_KEY     = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const EMBED_MODEL    = 'text-embedding-004';
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta';

// Cost per 1K tokens, used only to turn token counts into a rough £/run figure
// on the telemetry dashboard. These were copied from Gemini 1.5 Flash pricing
// while GEMINI_MODEL defaults to 2.5-flash, so the numbers were wrong for the
// model actually being called. Override them from the environment when pricing
// changes rather than editing code, and treat the dashboard total as indicative
// — Google's billing console is the source of truth.
const COST_INPUT_PER_1K  = Number(process.env.COST_INPUT_PER_1K)  || 0.000075;
const COST_OUTPUT_PER_1K = Number(process.env.COST_OUTPUT_PER_1K) || 0.0003;

// ────────────────────────────────────────────────────────────────────────────
// SCHEMA — additive tables, run on server boot
// ────────────────────────────────────────────────────────────────────────────
async function ensureSchema(db, isProduction){
  const tables = [
    // Telemetry: every agent run logged
    `CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      run_id TEXT,
      brief_id INTEGER,
      agent_slug TEXT,
      model TEXT,
      latency_ms INTEGER,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost_usd REAL,
      status TEXT,
      validation_passed INTEGER DEFAULT 0,
      retries INTEGER DEFAULT 0,
      tools_called TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Embedding store for outputs and briefs (pgvector on Postgres, JSON fallback on SQLite)
    `CREATE TABLE IF NOT EXISTS agent_embeddings (
      id SERIAL PRIMARY KEY,
      source_type TEXT,
      source_id INTEGER,
      content TEXT,
      content_summary TEXT,
      embedding TEXT,
      agent_slug TEXT,
      rating INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Tool call log
    `CREATE TABLE IF NOT EXISTS agent_tool_calls (
      id SERIAL PRIMARY KEY,
      run_id TEXT,
      tool_name TEXT,
      tool_args TEXT,
      tool_result TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Safety flags log
    `CREATE TABLE IF NOT EXISTS agent_safety_flags (
      id SERIAL PRIMARY KEY,
      run_id TEXT,
      flag_type TEXT,
      detail TEXT,
      action TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (let q of tables){
    if (!isProduction) q = q.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    try { await db.query(q); } catch(e){ console.log('agent_v2 schema:', e.message); }
  }
  // Try to enable pgvector on Postgres (no-op on SQLite)
  if (isProduction){
    try {
      await db.query('CREATE EXTENSION IF NOT EXISTS vector');
      await db.query('ALTER TABLE agent_embeddings ALTER COLUMN embedding TYPE vector(768) USING embedding::vector')
        .catch(()=>{}); // if column already typed, skip
    } catch(e){ /* pgvector may need to be enabled in Render — gracefully degrade to TEXT storage */ }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SAFETY — PII detection + output policy classifier
// ────────────────────────────────────────────────────────────────────────────
const PII_PATTERNS = {
  uk_postcode:    /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/g,
  uk_phone:       /(?:(?:\+44|0044|0)\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}\b/g,
  email:          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  national_ins:   /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b/gi,
  credit_card:    /\b(?:\d[ -]?){13,19}\b/g,
};
const BANNED_PHRASES = [
  /\bas an AI\b/gi,
  /\bI am (?:an )?AI\b/gi,
  /\bI cannot actually\b/gi,
  /\bAs a language model\b/gi,
];

function scanForPII(text, briefContent){
  const flags = [];
  const briefLower = (briefContent || '').toLowerCase();
  for (const [type, rx] of Object.entries(PII_PATTERNS)){
    const matches = text.match(rx);
    if (!matches) continue;
    for (const m of matches){
      // Allow PII that already exists in the brief — that's the client's own data they gave us
      if (briefLower.includes(m.toLowerCase())) continue;
      flags.push({ type, match: m, severity: type === 'credit_card' || type === 'national_ins' ? 'high' : 'medium' });
    }
  }
  return flags;
}

function scanForBannedPhrases(text){
  const flags = [];
  for (const rx of BANNED_PHRASES){
    const matches = text.match(rx);
    if (matches){
      for (const m of matches){
        flags.push({ type: 'banned_phrase', match: m, severity: 'medium' });
      }
    }
  }
  return flags;
}

function applySafetyScrub(text, flags){
  let scrubbed = text;
  for (const f of flags){
    if (f.severity === 'high'){
      // Hard mask anything sensitive
      scrubbed = scrubbed.split(f.match).join(`[${f.type.toUpperCase()}_REMOVED]`);
    }
  }
  return scrubbed;
}

// ────────────────────────────────────────────────────────────────────────────
// EMBEDDINGS — for RAG and memory
// ────────────────────────────────────────────────────────────────────────────
async function embedText(text){
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(`${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] }
    })
  });
  if (!res.ok){
    const err = await res.text();
    throw new Error('Embedding failed: ' + err.slice(0, 200));
  }
  const data = await res.json();
  return data.embedding?.values || null;
}

function cosineSimilarity(a, b){
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++){
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function storeEmbedding(db, isProduction, params){
  const { sourceType, sourceId, content, contentSummary, agentSlug, rating } = params;
  try {
    const vec = await embedText(content);
    if (!vec) return null;
    const vecStr = JSON.stringify(vec);
    await db.query(
      `INSERT INTO agent_embeddings (source_type, source_id, content, content_summary, embedding, agent_slug, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sourceType, sourceId, content.slice(0, 8000), contentSummary?.slice(0, 500) || '', vecStr, agentSlug || '', rating || 0]
    );
    return vec;
  } catch(e){
    console.log('storeEmbedding error:', e.message);
    return null;
  }
}

async function retrieveSimilar(db, isProduction, queryText, opts = {}){
  const { topK = 5, agentSlug = null, minRating = 0, sourceTypes = null } = opts;
  try {
    const queryVec = await embedText(queryText);
    if (!queryVec) return [];

    // Pull candidates; filter in app since pgvector may not be available
    const filters = [];
    const args = [];
    let idx = 1;
    if (agentSlug){ filters.push(`agent_slug = $${idx++}`); args.push(agentSlug); }
    if (minRating > 0){ filters.push(`rating >= $${idx++}`); args.push(minRating); }
    if (sourceTypes && sourceTypes.length){
      filters.push(`source_type = ANY($${idx++})`);
      args.push(sourceTypes);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    // SQLite doesn't support ANY() — fall back
    const limitClause = `LIMIT 200`;
    let sql = `SELECT id, source_type, source_id, content, content_summary, embedding, rating FROM agent_embeddings ${where} ORDER BY created_at DESC ${limitClause}`;

    // SQLite has no ANY(), so filter agent_slug/rating in SQL only on Postgres
    // and fall back to an unfiltered read plus a JS filter locally.
    let candidates;
    if (isProduction){
      candidates = (await db.query(sql, args)).rows;
    } else {
      const simpler = `SELECT id, source_type, source_id, content, content_summary, embedding, rating, agent_slug FROM agent_embeddings ORDER BY created_at DESC LIMIT 200`;
      candidates = (await db.query(simpler)).rows.filter(row => {
        if (agentSlug && row.agent_slug && row.agent_slug !== agentSlug) return false;
        if (minRating > 0 && (row.rating || 0) < minRating) return false;
        return true;
      });
    }

    // Rank by cosine similarity
    const scored = [];
    for (const row of candidates){
      try {
        const vec = JSON.parse(row.embedding);
        const sim = cosineSimilarity(queryVec, vec);
        scored.push({ ...row, similarity: sim });
      } catch(_){}
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK).filter(s => s.similarity > 0.3);
  } catch(e){
    console.log('retrieveSimilar error:', e.message);
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TOOLS — Gemini function-calling
// ────────────────────────────────────────────────────────────────────────────
const TOOLS = {
  fetch_url: {
    declaration: {
      name: 'fetch_url',
      description: 'Fetch the contents of a public web page. Returns the visible text (HTML stripped). Use this to inspect a competitor site, the client\'s own website, a Companies House profile page, or any URL provided in the brief.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full https:// URL to fetch' }
        },
        required: ['url']
      }
    },
    handler: async ({ url }) => {
      // The model chooses this URL, and the brief it reasons over can come from
      // an anonymous form — so this is the one tool call an outsider can steer.
      // Same guard the site-check endpoints use.
      let res;
      try {
        res = await safeFetch(url, {
          headers: { 'User-Agent': 'KWBA-Agent/2.0 (compatible)' },
          timeout: 15000,
        });
      } catch (e) {
        if (e instanceof BlockedUrlError) return `Refused to fetch ${url}: ${e.message}`;
        throw e;
      }
      if (!res.ok) return `HTTP ${res.status} fetching ${url}`;
      const html = await res.text();
      // Strip HTML to readable text
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 6000);
    }
  },

  google_search: {
    declaration: {
      name: 'google_search',
      description: 'Search Google for current information. Returns top 5 result snippets. Use to verify facts, find UK industry benchmarks, check competitor mentions, or ground recommendations.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (3-8 words is usually best)' },
          uk_only: { type: 'boolean', description: 'Restrict to UK results (default true for KWBA agency work)' }
        },
        required: ['query']
      }
    },
    handler: async ({ query, uk_only = true }) => {
      // Uses Google Custom Search API; requires GOOGLE_CSE_KEY + GOOGLE_CSE_ID env vars
      // Graceful degradation if not configured
      const cseKey = process.env.GOOGLE_CSE_KEY;
      const cseId  = process.env.GOOGLE_CSE_ID;
      if (!cseKey || !cseId){
        return `Google search not configured (admin must set GOOGLE_CSE_KEY and GOOGLE_CSE_ID env vars on Render). Query was: ${query}`;
      }
      const url = `https://www.googleapis.com/customsearch/v1?key=${cseKey}&cx=${cseId}&q=${encodeURIComponent(query)}${uk_only ? '&cr=countryUK&gl=uk' : ''}&num=5`;
      const res = await fetch(url);
      if (!res.ok) return `Search failed: HTTP ${res.status}`;
      const data = await res.json();
      const items = (data.items || []).slice(0, 5).map(it => ({
        title: it.title,
        link: it.link,
        snippet: it.snippet
      }));
      return JSON.stringify(items, null, 2);
    }
  },

  lookup_companies_house: {
    declaration: {
      name: 'lookup_companies_house',
      description: 'Look up a UK company on Companies House by name or company number. Returns registration details, filing history, and financial summary if available.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Company name or 8-digit company number' }
        },
        required: ['query']
      }
    },
    handler: async ({ query }) => {
      const apiKey = process.env.COMPANIES_HOUSE_KEY;
      if (!apiKey) return `Companies House not configured (set COMPANIES_HOUSE_KEY env var). Query was: ${query}`;
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const url = /^\d{8}$/.test(query)
        ? `https://api.company-information.service.gov.uk/company/${query}`
        : `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
      if (!res.ok) return `Companies House error: HTTP ${res.status}`;
      const data = await res.json();
      return JSON.stringify(data.items?.slice(0, 5) || data, null, 2).slice(0, 4000);
    }
  },

  search_past_outputs: {
    declaration: {
      name: 'search_past_outputs',
      description: 'Search the agency\'s past agent outputs for ones similar to the current brief. Returns top 3 rated examples. Use to learn from what worked before for similar clients.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Description of what to find — usually a short summary of current brief' },
          agent: { type: 'string', description: 'Specific agent slug to filter by (optional)' }
        },
        required: ['query']
      }
    },
    handler: async ({ query, agent }, ctx) => {
      const { db, isProduction } = ctx;
      const hits = await retrieveSimilar(db, isProduction, query, {
        topK: 3, agentSlug: agent || null, minRating: 3, sourceTypes: ['output']
      });
      if (!hits.length) return 'No past outputs found matching this query (or none rated ≥3 stars).';
      return hits.map((h, i) =>
        `[${i+1}] (similarity ${(h.similarity*100).toFixed(0)}%, rated ${h.rating}/5)\n${h.content_summary || h.content.slice(0, 400)}`
      ).join('\n\n');
    }
  }
};

const TOOL_DECLARATIONS = Object.values(TOOLS).map(t => t.declaration);

async function runTool(name, args, ctx){
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}` };
  const t0 = Date.now();
  try {
    const result = await tool.handler(args, ctx);
    return { result: typeof result === 'string' ? result : JSON.stringify(result), latencyMs: Date.now() - t0 };
  } catch(e){
    return { error: e.message || String(e), latencyMs: Date.now() - t0 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GEMINI CALL with tool-use loop
// ────────────────────────────────────────────────────────────────────────────
async function callGeminiWithTools(systemPrompt, userPrompt, ctx, opts = {}){
  const { maxToolRounds = 4, enableTools = true } = opts;
  const tokens = { in: 0, out: 0 };
  const toolsCalled = [];

  // Initial conversation
  const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];

  for (let round = 0; round < maxToolRounds; round++){
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2400,
        topP: 0.95
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_ONLY_HIGH' }
      ]
    };
    if (enableTools){
      body.tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
    }

    const res = await fetch(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok){
      const err = await res.text();
      throw new Error(`Gemini error (round ${round}): ${err.slice(0, 300)}`);
    }
    const data = await res.json();
    tokens.in  += data.usageMetadata?.promptTokenCount     || 0;
    tokens.out += data.usageMetadata?.candidatesTokenCount || 0;

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');
    const parts = candidate.content?.parts || [];

    // Inspect each part — function call or text
    const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    const textParts     = parts.filter(p => p.text).map(p => p.text).join('');

    if (!functionCalls.length){
      // Done — model produced final text
      return { text: textParts, tokens, toolsCalled };
    }

    // Add the model's function-call message to history
    contents.push({
      role: 'model',
      parts: functionCalls.map(fc => ({ functionCall: fc }))
    });

    // Execute each function call in parallel
    const results = await Promise.all(functionCalls.map(async fc => {
      const { name, args = {} } = fc;
      const out = await runTool(name, args, ctx);
      toolsCalled.push({ name, args, ok: !out.error, latencyMs: out.latencyMs });
      return { name, response: out.result || out.error };
    }));

    // Add function responses back to conversation
    contents.push({
      role: 'function',
      parts: results.map(r => ({
        functionResponse: { name: r.name, response: { content: r.response } }
      }))
    });
  }

  // Out of tool budget. Ask once more with tools off so the model has to answer
  // from what it already gathered — throwing here billed the caller for every
  // round and then returned a 500 with nothing to show for it.
  const finalRes = await fetch(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2400, topP: 0.95 }
    })
  });
  if (!finalRes.ok) {
    throw new Error(`Exceeded ${maxToolRounds} tool rounds and the wrap-up call failed: ${(await finalRes.text()).slice(0, 200)}`);
  }
  const finalData = await finalRes.json();
  tokens.in  += finalData.usageMetadata?.promptTokenCount     || 0;
  tokens.out += finalData.usageMetadata?.candidatesTokenCount || 0;
  const finalText = (finalData.candidates?.[0]?.content?.parts || [])
    .filter(pt => pt.text).map(pt => pt.text).join('');
  return { text: finalText, tokens, toolsCalled, hitToolLimit: true };
}

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION — schema-aware output checker per agent
// ────────────────────────────────────────────────────────────────────────────
const VALIDATORS = {
  // Each entry: array of required-section regex patterns
  default: [],
  strategist:        [/where the growth actually comes from/i, /positioning/i, /channel strategy/i, /month 1/i, /month 2/i, /month 3/i, /kpi/i],
  deal_maker:        [/executive summary/i, /scope/i, /investment options?/i, /next steps?/i, /(starter|growth|elite|premium)/i],
  financial_modeller:[/assumptions?/i, /scenario 1|conservative/i, /scenario 2|moderate/i, /scenario 3|aggressive/i, /sensitivity/i, /break.?even/i],
  ops_manager:       [/kickoff/i, /assets required/i, /milestones?/i, /communication/i, /decision rights/i],
  market_researcher: [/market overview/i, /competitors?/i, /weakness/i, /underserved/i, /positioning/i],
  seo_lead:          [/keyword/i, /on.?page/i, /technical/i, /content/i],
  copywriter:        [/headline|h1/i, /hero/i, /(cta|call.to.action)/i],
  brand_guide:       [/voice|tone/i, /(messaging|pillar)/i, /visual/i],
  summariser:        [/snapshot/i, /goals/i, /risks?/i, /missing/i, /next steps?/i],
};

function validateOutput(agentSlug, text){
  const rules = VALIDATORS[agentSlug] || VALIDATORS.default;
  const missing = [];
  for (const rx of rules){
    if (!rx.test(text)) missing.push(rx.source);
  }
  return { passed: missing.length === 0, missing };
}

// ────────────────────────────────────────────────────────────────────────────
// MEMORY — load past rated examples
// ────────────────────────────────────────────────────────────────────────────
async function loadFewShotExamples(db, isProduction, agentSlug, briefContent){
  if (!agentSlug) return [];
  try {
    const hits = await retrieveSimilar(db, isProduction, briefContent, {
      topK: 3, agentSlug, minRating: 4, sourceTypes: ['output']
    });
    return hits;
  } catch(e){
    console.log('loadFewShotExamples:', e.message);
    return [];
  }
}

function formatFewShotBlock(examples){
  if (!examples.length) return '';
  const lines = [
    '',
    '=== EXAMPLES OF WHAT WORKED BEFORE (highly-rated past outputs from similar briefs) ===',
    'Study these for tone, depth, and structure — but never copy specific names, prices, or details. They are reference, not template.',
    ''
  ];
  examples.forEach((ex, i) => {
    lines.push(`--- Example ${i+1} (rated ${ex.rating}/5, similarity ${(ex.similarity*100).toFixed(0)}%) ---`);
    lines.push(ex.content.slice(0, 1500));
    lines.push('');
  });
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN AGENT V2 ENDPOINT
// ────────────────────────────────────────────────────────────────────────────
function mountAgentV2(app, db, isProduction, authenticate){
  ensureSchema(db, isProduction);

  // authenticate() only proves the token is valid — client-portal users get one
  // too, with role 'client'. Every route here spends the agency's Gemini quota
  // or exposes internal telemetry, so allow-list the internal roles as well.
  // ('staff' is listed for when /create-staff stops handing out 'admin'.)
  const STAFF_ROLES = new Set(['admin', 'staff']);
  const staffOnly = (req, res, next) =>
    STAFF_ROLES.has(req.user?.role) ? next() : res.status(403).json({ error: 'Staff access required' });

  // Main run endpoint
  app.post('/agent-v2/run', authenticate, staffOnly, async (req, res) => {
    const t0 = Date.now();
    const runId = 'run_' + Math.random().toString(36).slice(2, 12);
    const {
      systemPrompt,       // the full agent system prompt (built client-side)
      userPrompt,         // the task brief + context
      briefId = null,
      agentSlug = '',
      briefContent = '',
      enableTools = true,
      enableMemory = true,
      enableRetry = true,
    } = req.body || {};

    if (!systemPrompt || !userPrompt){
      return res.status(400).json({ error: 'systemPrompt and userPrompt required' });
    }

    let augmentedSystem = systemPrompt;
    const telemetry = {
      runId, briefId, agentSlug, model: GEMINI_MODEL,
      tokensIn: 0, tokensOut: 0, costUsd: 0,
      toolsCalled: [], retries: 0, validationPassed: false,
      latencyMs: 0, status: 'running'
    };

    try {
      // Inject few-shot memory if enabled
      if (enableMemory && agentSlug){
        const examples = await loadFewShotExamples(db, isProduction, agentSlug, briefContent || userPrompt);
        if (examples.length){
          augmentedSystem += formatFewShotBlock(examples);
        }
      }

      // Attempt 1
      let { text, tokens, toolsCalled } = await callGeminiWithTools(
        augmentedSystem, userPrompt, { db, isProduction }, { enableTools }
      );
      telemetry.tokensIn  += tokens.in;
      telemetry.tokensOut += tokens.out;
      telemetry.toolsCalled.push(...toolsCalled);

      // Validate
      let validation = validateOutput(agentSlug, text);

      // Retry once if validation fails
      if (!validation.passed && enableRetry){
        telemetry.retries = 1;
        const retryPrompt = userPrompt
          + '\n\n=== RETRY INSTRUCTION ===\n'
          + 'Your previous draft was missing required sections: '
          + validation.missing.join(', ')
          + '. Produce a complete draft that includes ALL required sections this time.';
        const retry = await callGeminiWithTools(
          augmentedSystem, retryPrompt, { db, isProduction }, { enableTools: false }
        );
        telemetry.tokensIn  += retry.tokens.in;
        telemetry.tokensOut += retry.tokens.out;
        text = retry.text;
        validation = validateOutput(agentSlug, text);
      }
      telemetry.validationPassed = validation.passed;

      // Safety scrub
      const piiFlags     = scanForPII(text, briefContent);
      const bannedFlags  = scanForBannedPhrases(text);
      const allFlags     = [...piiFlags, ...bannedFlags];
      const scrubbedText = applySafetyScrub(text, allFlags);

      // Log safety flags
      for (const f of allFlags){
        const action = f.severity === 'high' ? 'auto-scrubbed' : 'flagged';
        await db.query(
          `INSERT INTO agent_safety_flags (run_id, flag_type, detail, action) VALUES ($1, $2, $3, $4)`,
          [runId, f.type, f.match, action]
        ).catch(()=>{});
      }

      // Cost calc
      telemetry.costUsd =
        (telemetry.tokensIn  / 1000) * COST_INPUT_PER_1K +
        (telemetry.tokensOut / 1000) * COST_OUTPUT_PER_1K;
      telemetry.latencyMs = Date.now() - t0;
      telemetry.status = 'ok';

      // Log telemetry
      await db.query(
        `INSERT INTO agent_runs
         (run_id, brief_id, agent_slug, model, latency_ms, tokens_in, tokens_out, cost_usd, status, validation_passed, retries, tools_called)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [runId, briefId, agentSlug, GEMINI_MODEL, telemetry.latencyMs,
         telemetry.tokensIn, telemetry.tokensOut, telemetry.costUsd,
         'ok', validation.passed ? 1 : 0, telemetry.retries, JSON.stringify(telemetry.toolsCalled)]
      ).catch(()=>{});

      // Log individual tool calls
      for (const tc of telemetry.toolsCalled){
        await db.query(
          `INSERT INTO agent_tool_calls (run_id, tool_name, tool_args, tool_result, latency_ms) VALUES ($1,$2,$3,$4,$5)`,
          [runId, tc.name, JSON.stringify(tc.args), tc.ok ? 'ok' : 'error', tc.latencyMs]
        ).catch(()=>{});
      }

      return res.json({
        runId,
        text: scrubbedText,
        telemetry,
        validation,
        safetyFlags: allFlags
      });

    } catch(e){
      telemetry.status = 'error';
      telemetry.latencyMs = Date.now() - t0;
      await db.query(
        `INSERT INTO agent_runs (run_id, brief_id, agent_slug, model, latency_ms, tokens_in, tokens_out, cost_usd, status, validation_passed, retries, tools_called)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [runId, briefId, agentSlug, GEMINI_MODEL, telemetry.latencyMs,
         telemetry.tokensIn, telemetry.tokensOut, telemetry.costUsd,
         'error', 0, telemetry.retries, JSON.stringify(telemetry.toolsCalled)]
      ).catch(()=>{});
      return res.status(500).json({ error: e.message, runId, telemetry });
    }
  });

  // Save approved output → triggers embedding for memory
  app.post('/agent-v2/save-output', authenticate, staffOnly, async (req, res) => {
    const { briefId, agentSlug, output, rating = 0 } = req.body || {};
    if (!briefId || !output) return res.status(400).json({ error: 'briefId and output required' });
    try {
      // Save to outputs table (existing schema)
      const r = await db.query(
        `INSERT INTO outputs (briefId, agent, output, rating) VALUES ($1, $2, $3, $4) RETURNING id`,
        [briefId, agentSlug, output, rating]
      );
      const outputId = r.rows[0].id;

      // Background embed (don't block response)
      storeEmbedding(db, isProduction, {
        sourceType: 'output',
        sourceId: outputId,
        content: output,
        contentSummary: output.slice(0, 400),
        agentSlug,
        rating
      }).catch(e => console.log('embed fail:', e.message));

      return res.json({ ok: true, outputId });
    } catch(e){
      return res.status(500).json({ error: e.message });
    }
  });

  // Observability dashboard data
  app.get('/agent-v2/telemetry', authenticate, staffOnly, async (req, res) => {
    try {
      const sql = isProduction
        ? `SELECT agent_slug,
                  COUNT(*) AS runs,
                  AVG(latency_ms)::int AS avg_latency,
                  SUM(tokens_in)  AS total_tokens_in,
                  SUM(tokens_out) AS total_tokens_out,
                  SUM(cost_usd)::numeric(10,4) AS total_cost,
                  SUM(CASE WHEN validation_passed=1 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) AS validation_rate,
                  SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
           FROM agent_runs
           GROUP BY agent_slug
           ORDER BY runs DESC`
        : `SELECT agent_slug,
                  COUNT(*) AS runs,
                  AVG(latency_ms) AS avg_latency,
                  SUM(tokens_in)  AS total_tokens_in,
                  SUM(tokens_out) AS total_tokens_out,
                  SUM(cost_usd)   AS total_cost,
                  CAST(SUM(CASE WHEN validation_passed=1 THEN 1 ELSE 0 END) AS REAL) / NULLIF(COUNT(*),0) AS validation_rate,
                  SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
           FROM agent_runs
           GROUP BY agent_slug
           ORDER BY runs DESC`;
      const r = await db.query(sql);
      const rows = r.rows;

      // Aggregate totals
      const totals = rows.reduce((acc, row) => ({
        runs: acc.runs + Number(row.runs || 0),
        cost: acc.cost + Number(row.total_cost || 0),
        tokens: acc.tokens + Number(row.total_tokens_in || 0) + Number(row.total_tokens_out || 0),
        errors: acc.errors + Number(row.errors || 0),
      }), { runs: 0, cost: 0, tokens: 0, errors: 0 });

      return res.json({ totals, perAgent: rows });
    } catch(e){
      return res.status(500).json({ error: e.message });
    }
  });

  // List recent safety flags
  app.get('/agent-v2/safety-flags', authenticate, staffOnly, async (req, res) => {
    try {
      const r = await db.query('SELECT * FROM agent_safety_flags ORDER BY created_at DESC LIMIT 50');
      const rows = r.rows;
      return res.json({ flags: rows });
    } catch(e){
      return res.status(500).json({ error: e.message });
    }
  });

  // Tool availability check
  app.get('/agent-v2/tools-status', authenticate, staffOnly, async (req, res) => {
    return res.json({
      tools: Object.keys(TOOLS),
      configured: {
        google_search:          !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID),
        lookup_companies_house: !!process.env.COMPANIES_HOUSE_KEY,
        fetch_url:              true,
        search_past_outputs:    true,
      }
    });
  });

  console.log('Agent V2 mounted at /agent-v2/*');
}

module.exports = { mountAgentV2, ensureSchema, scanForPII, scanForBannedPhrases, validateOutput, retrieveSimilar };
