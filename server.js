// server.js - CloudPilot Backend (complete rewrite)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { checkN8nHealth, detectBasePath } from './utils/n8n.js';
import workflowsRouter from './routes/workflows.js';
import credentialsRouter from './routes/credentials.js';
import templatesRouter from './routes/templates.js';
import executionsRouter from './routes/executions.js';

const app = express();
const PORT = process.env.PORT || 4000;
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:8000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:4000',
    'http://127.0.0.1:8000',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ─────────────────────────────────────────────
// STARTUP LOG
// ─────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════╗
║           ☁  CloudPilot Backend Starting              ║
╠══════════════════════════════════════════════════════╣
║  Port:          ${String(PORT).padEnd(36)}║
║  Demo Mode:     ${String(DEMO_MODE ? '✅ ACTIVE' : '❌ Off').padEnd(36)}║
║  N8N URL:       ${String(process.env.N8N_URL || 'http://localhost:5678').padEnd(36)}║
║  N8N API Key:   ${String(process.env.N8N_API_KEY ? '✅ Set' : '❌ Missing').padEnd(36)}║
║  Supabase:      ${String(process.env.SUPABASE_URL ? '✅ Configured' : '❌ Missing').padEnd(36)}║
║  Encryption:    ${String(process.env.ENCRYPTION_KEY ? '✅ Set' : '⚠  Missing (credentials disabled)').padEnd(36)}║
╚══════════════════════════════════════════════════════╝
`);

// Auto-detect n8n base path on startup (non-blocking)
if (!DEMO_MODE) {
  detectBasePath().catch(err => {
    console.warn('⚠  n8n base path detection failed:', err.message);
  });
}

// ─────────────────────────────────────────────
// ADD THIS ROUTE to server.js, before the other routes
// Visit http://localhost:4000/api/n8n-debug in your browser
// to see exactly what's wrong with your n8n connection
// ─────────────────────────────────────────────

app.get('/api/n8n-debug', async (req, res) => {
  const n8nUrl = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
  const apiKey = process.env.N8N_API_KEY || '';

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (apiKey) headers['X-N8N-API-KEY'] = apiKey;

  const results = {
    config: {
      n8n_url: n8nUrl,
      api_key_set: !!apiKey,
      api_key_preview: apiKey ? `${apiKey.slice(0, 8)}…` : '⚠ NOT SET — this causes 401/403',
    },
    endpoint_tests: [],
  };

  const paths = [
    '/api/v1/workflows?limit=1',
    '/rest/workflows?limit=1',
    '/api/v1/workflows',
    '/healthz',
  ];

  for (const path of paths) {
    const url = `${n8nUrl}${path}`;
    try {
      const r = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(4000) });
      let body = '';
      try { body = await r.text(); } catch (_) {}
      let parsed = null;
      try { parsed = JSON.parse(body); } catch (_) {}

      results.endpoint_tests.push({
        url,
        status: r.status,
        ok: r.ok,
        response_preview: body.slice(0, 300),
      });
    } catch (err) {
      results.endpoint_tests.push({ url, error: err.message, ok: false });
    }
  }

  // Interpret results
  const interpretations = [];
  const anyOk = results.endpoint_tests.some(t => t.ok);
  const any401 = results.endpoint_tests.some(t => t.status === 401 || t.status === 403);
  const anyConnRefused = results.endpoint_tests.some(t => t.error?.includes('ECONNREFUSED') || t.error?.includes('ENOTFOUND'));

  if (anyConnRefused) {
    interpretations.push('❌ n8n is NOT running or N8N_URL is wrong. Check that n8n is started and the URL is correct.');
  } else if (any401 && !anyOk) {
    interpretations.push('❌ n8n is reachable but your API key is wrong or missing. Set N8N_API_KEY in your .env file.');
  } else if (anyOk) {
    interpretations.push('✅ n8n connection is working!');
  }

  results.interpretations = interpretations;

  res.json(results);
});

// ─────────────────────────────────────────────
// PUBLIC ROUTES (no auth)
// ─────────────────────────────────────────────

// Frontend config - only expose public keys
app.get('/api/config', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!DEMO_MODE && (!supabaseUrl || !supabaseAnonKey)) {
    return res.status(500).json({
      error: 'Server misconfigured',
      message: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env',
    });
  }

  res.json({
    supabase: {
      url: supabaseUrl || '',
      anonKey: supabaseAnonKey || '',
    },
    demoMode: DEMO_MODE,
    version: '2.0.0',
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({
      status: 'demo',
      demo: true,
      services: { n8n: 'mocked', supabase: 'mocked' },
      timestamp: new Date().toISOString(),
    });
  }

  const n8nHealth = await checkN8nHealth();
  const status = n8nHealth.connected ? 'healthy' : 'degraded';

  res.status(n8nHealth.connected ? 200 : 503).json({
    status,
    services: {
      n8n: n8nHealth.connected ? 'connected' : 'disconnected',
      supabase: process.env.SUPABASE_URL ? 'configured' : 'not configured',
    },
    n8n: n8nHealth,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// PROTECTED API ROUTES
// ─────────────────────────────────────────────
app.use('/api/workflows', workflowsRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/executions', executionsRouter);

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log(`\n🚀 CloudPilot running at ${base}`);
  console.log(`   Health:    ${base}/api/health`);
  console.log(`   Config:    ${base}/api/config`);
  console.log(`   Workflows: ${base}/api/workflows`);
  if (DEMO_MODE) console.log('\n🎭 DEMO MODE ACTIVE — no real n8n or Supabase needed\n');
});