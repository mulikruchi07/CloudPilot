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