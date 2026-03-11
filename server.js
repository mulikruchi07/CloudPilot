// server.js - CloudPilot Backend
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { checkN8nHealth, detectBasePath } from './utils/n8n.js';
import { getSupabaseAdmin } from './utils/supabase.js';
import { requireAuth } from './middleware/auth.js';
import workflowsRouter   from './routes/workflows.js';
import credentialsRouter from './routes/credentials.js';
import templatesRouter   from './routes/templates.js';
import executionsRouter  from './routes/executions.js';

const app      = express();
const PORT     = process.env.PORT || 4000;
const DEMO_MODE = process.env.DEMO_MODE === 'true';

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

// Startup banner — no engine URL or key details logged
console.log(`
╔══════════════════════════════════════════════════════╗
║           ☁  CloudPilot Backend Starting              ║
╠══════════════════════════════════════════════════════╣
║  Port:        ${String(PORT).padEnd(38)}║
║  Demo Mode:   ${String(DEMO_MODE ? '✅ ACTIVE' : '❌ Off').padEnd(38)}║
║  Supabase:    ${String(process.env.SUPABASE_URL ? '✅ Configured' : '❌ Missing').padEnd(38)}║
║  Encryption:  ${String(process.env.ENCRYPTION_KEY ? '✅ Set' : '⚠  Missing').padEnd(38)}║
║  Engine:      ${String(process.env.N8N_URL ? '✅ Configured' : '❌ Missing').padEnd(38)}║
╚══════════════════════════════════════════════════════╝
`);

// ─────────────────────────────────────────────
// ENV VALIDATION — fail fast before accepting any requests
// ─────────────────────────────────────────────
if (!DEMO_MODE) {
  const REQUIRED_ENV = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'N8N_URL',
    'N8N_API_KEY',
    'ENCRYPTION_KEY',
  ];
  const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error('❌  FATAL: Missing required environment variables:', missingEnv.join(', '));
    console.error('    Add them to your .env file and restart the server.');
    process.exit(1);
  }

  detectBasePath().catch(err => console.warn('⚠  Engine base path detection failed:', err.message));
}

// ─────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const supabaseUrl    = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!DEMO_MODE && (!supabaseUrl || !supabaseAnonKey)) {
    return res.status(500).json({
      error:   'Server misconfigured',
      message: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env',
    });
  }

  res.json({
    supabase: { url: supabaseUrl || '', anonKey: supabaseAnonKey || '' },
    demoMode: DEMO_MODE,
    version:  '3.0.0',
  });
});

// Health — returns engine status without exposing engine internals
app.get('/api/health', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({
      status:    'demo',
      demo:      true,
      services:  { engine: 'mocked', supabase: 'mocked' },
      timestamp: new Date().toISOString(),
    });
  }

  const engineHealth = await checkN8nHealth();
  const status = engineHealth.connected ? 'healthy' : 'degraded';

  res.status(engineHealth.connected ? 200 : 503).json({
    status,
    services: {
      engine:   engineHealth.connected ? 'connected' : 'disconnected',
      supabase: process.env.SUPABASE_URL ? 'configured' : 'not configured',
    },
    timestamp: new Date().toISOString(),
    // No engine URL, basePath, or apiKey status exposed
  });
});

// ─────────────────────────────────────────────
// ENGINE CALLBACK — called by the execution engine when a run completes.
// Secured by a shared secret set in ENGINE_CALLBACK_SECRET env var.
// Configure n8n to POST here with a final HTTP Request node.
// ─────────────────────────────────────────────
const ENGINE_CALLBACK_SECRET = process.env.ENGINE_CALLBACK_SECRET || '';

app.post('/internal/engine/callback', async (req, res) => {
  // Validate shared secret
  const secret = req.headers['x-engine-secret'];
  if (!ENGINE_CALLBACK_SECRET || secret !== ENGINE_CALLBACK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    cloudpilot_execution_id,
    engine_execution_id,
    status,
    finished_at,
    duration_ms,
    error_message,
  } = req.body;

  if (!cloudpilot_execution_id) {
    return res.status(400).json({ error: 'cloudpilot_execution_id is required' });
  }

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('executions').update({
      status:               status === 'error' ? 'failed' : 'success',
      engine_execution_ref: engine_execution_id ? String(engine_execution_id) : undefined,
      finished_at:          finished_at || new Date().toISOString(),
      duration_ms:          duration_ms  || null,
      error_message:        error_message || null,
    }).eq('id', cloudpilot_execution_id);

    res.json({ received: true });
  } catch (err) {
    console.error('Callback processing error:', err.message);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

// ─────────────────────────────────────────────
// AUTHENTICATED ENGINE HEALTH — for internal admin use only
// ─────────────────────────────────────────────
app.get('/api/engine-health', requireAuth, async (req, res) => {
  const health = await checkN8nHealth();
  res.json({
    engine:    health.connected ? 'connected' : 'degraded',
    timestamp: new Date().toISOString(),
    // Never expose: health.basePath, health.url, key status
  });
});

// ─────────────────────────────────────────────
// PROTECTED API ROUTES
// ─────────────────────────────────────────────
app.use('/api/workflows',   workflowsRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/templates',   templatesRouter);
app.use('/api/executions',  executionsRouter);

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// Never forward raw error messages to the client.
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log(`\n🚀 CloudPilot running at ${base}`);
  console.log(`   Health:  ${base}/api/health`);
  console.log(`   Config:  ${base}/api/config`);
  if (DEMO_MODE) console.log('\n🎭 DEMO MODE ACTIVE\n');
});