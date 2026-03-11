// server.js - CloudPilot Backend
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
<<<<<<< HEAD
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
=======
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
dotenv.config();

const execAsync = promisify(exec);

import { checkN8nHealth, detectBasePath, getN8nHeaders } from './utils/n8n.js';
import workflowsRouter from './routes/workflows.js';
import credentialsRouter from './routes/credentials.js';
import templatesRouter from './routes/templates.js';
import executionsRouter from './routes/executions.js';

const app = express();
const PORT = process.env.PORT || 4000;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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

<<<<<<< HEAD
// Startup banner — no engine URL or key details logged
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
console.log(`
╔══════════════════════════════════════════════════════╗
║           ☁  CloudPilot Backend Starting              ║
╠══════════════════════════════════════════════════════╣
<<<<<<< HEAD
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
=======
║  Port:          ${String(PORT).padEnd(36)}║
║  Demo Mode:     ${String(DEMO_MODE ? '✅ ACTIVE' : '❌ Off').padEnd(36)}║
║  N8N URL:       ${String(process.env.N8N_URL || 'http://localhost:5678').padEnd(36)}║
║  N8N API Key:   ${String(process.env.N8N_API_KEY ? '✅ Set' : '❌ Missing').padEnd(36)}║
║  Supabase:      ${String(process.env.SUPABASE_URL ? '✅ Configured' : '❌ Missing').padEnd(36)}║
║  Encryption:    ${String(process.env.ENCRYPTION_KEY ? '✅ Set' : '⚠  Missing').padEnd(36)}║
║  N8N Container: ${String(process.env.N8N_CONTAINER_NAME || 'n8n (default)').padEnd(36)}║
╚══════════════════════════════════════════════════════╝
`);

if (!DEMO_MODE) {
  detectBasePath().catch(err => console.warn('⚠  n8n base path detection failed:', err.message));
}

// ─────────────────────────────────────────────
// PUBLIC DIAGNOSTIC — NO AUTH REQUIRED
// Visit: http://localhost:4000/api/n8n-debug
// ─────────────────────────────────────────────
app.get('/api/n8n-debug', async (req, res) => {
  const n8nBase = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
  const headers = getN8nHeaders();

  const result = {
    config: {
      n8n_url: n8nBase,
      api_key_set: !!process.env.N8N_API_KEY,
      api_key_preview: process.env.N8N_API_KEY
        ? process.env.N8N_API_KEY.slice(0, 10) + '…'
        : '⚠ NOT SET',
      container_name: process.env.N8N_CONTAINER_NAME || 'n8n (default, set N8N_CONTAINER_NAME in .env)',
    },
    endpoint_tests: [],
    docker_test: null,
    instructions: [],
  };

  const tests = [
    { method: 'GET',  path: '/api/v1/workflows?limit=1', note: 'Public API — used for list/toggle/delete' },
    { method: 'GET',  path: '/rest/workflows?limit=1',   note: 'Internal REST — needs session cookie' },
    { method: 'POST', path: '/api/v1/workflows/FAKE/run',note: 'Public run endpoint — usually 404 in community' },
    { method: 'POST', path: '/rest/workflows/run',        note: 'Internal run — what the editor button calls' },
  ];

  for (const { method, path, note } of tests) {
    const url = `${n8nBase}${path}`;
    try {
      const body = method === 'POST'
        ? JSON.stringify({ workflowData: { nodes: [], connections: {}, name: 'test' } })
        : undefined;
      const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(5000) });
      const text = await r.text().catch(() => '');
      result.endpoint_tests.push({ method, url, note, status: r.status, ok: r.ok, response: text.slice(0, 400) });
    } catch (err) {
      result.endpoint_tests.push({ method, url, note, error: err.message });
    }
  }

  // Docker availability check
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}" 2>&1');
    const containers = stdout.trim().split('\n').filter(Boolean);
    result.docker_test = { available: true, containers };

    // Try a real docker exec dry-run
    const containerName = process.env.N8N_CONTAINER_NAME || 'n8n';
    try {
      await execAsync(`docker exec ${containerName} n8n --version`, { timeout: 5000 });
      result.docker_test.exec_test = { container: containerName, status: '✅ Can exec into container' };
    } catch (e) {
      result.docker_test.exec_test = {
        container: containerName,
        status: `❌ Cannot exec: ${e.message}`,
        tip: `Set N8N_CONTAINER_NAME to one of: ${containers.join(', ')}`,
      };
    }
  } catch (err) {
    result.docker_test = {
      available: false,
      error: err.message,
      tip: 'Docker not accessible from Node.js process. Run: sudo usermod -aG docker $USER then re-login.',
    };
  }

  // Give specific instructions based on results
  const runEndpointWorks = result.endpoint_tests.find(t => t.url.includes('/run') && t.ok);
  const dockerWorks = result.docker_test?.exec_test?.status?.includes('✅');

  if (runEndpointWorks) {
    result.instructions.push('✅ Run endpoint works directly — no extra config needed.');
  } else if (dockerWorks) {
    result.instructions.push('✅ Docker exec works — workflow running should work now.');
  } else if (result.docker_test?.available && !dockerWorks) {
    result.instructions.push(
      `⚠ Docker is available but can't exec into "${process.env.N8N_CONTAINER_NAME || 'n8n'}".`,
      `Set N8N_CONTAINER_NAME in your .env to one of: ${(result.docker_test.containers || []).join(', ')}`,
      'Then restart your backend.'
    );
  } else {
    result.instructions.push(
      '❌ Neither API run endpoints nor Docker exec work.',
      'Fix Docker access: sudo usermod -aG docker $USER && newgrp docker',
      'Then add N8N_CONTAINER_NAME=<your-container-name> to .env',
      'Restart your backend server.'
    );
  }

  res.json(result);
});
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

// ─────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────
app.get('/api/config', (req, res) => {
<<<<<<< HEAD
  const supabaseUrl    = process.env.SUPABASE_URL;
=======
  const supabaseUrl = process.env.SUPABASE_URL;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!DEMO_MODE && (!supabaseUrl || !supabaseAnonKey)) {
    return res.status(500).json({
<<<<<<< HEAD
      error:   'Server misconfigured',
=======
      error: 'Server misconfigured',
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      message: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env',
    });
  }

  res.json({
    supabase: { url: supabaseUrl || '', anonKey: supabaseAnonKey || '' },
    demoMode: DEMO_MODE,
<<<<<<< HEAD
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
=======
    version: '2.0.0',
  });
});

app.get('/api/health', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({
      status: 'demo', demo: true,
      services: { n8n: 'mocked', supabase: 'mocked' },
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      timestamp: new Date().toISOString(),
    });
  }

<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  });
});

// ─────────────────────────────────────────────
// PROTECTED API ROUTES
// ─────────────────────────────────────────────
<<<<<<< HEAD
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
=======
app.use('/api/workflows', workflowsRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/executions', executionsRouter);

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
});

app.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log(`\n🚀 CloudPilot running at ${base}`);
<<<<<<< HEAD
  console.log(`   Health:  ${base}/api/health`);
  console.log(`   Config:  ${base}/api/config`);
=======
  console.log(`   Health:    ${base}/api/health`);
  console.log(`   Debug:     ${base}/api/n8n-debug   ← open this to diagnose run issues`);
  console.log(`   Config:    ${base}/api/config`);
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  if (DEMO_MODE) console.log('\n🎭 DEMO MODE ACTIVE\n');
});