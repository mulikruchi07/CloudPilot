// routes/workflows.js
import { Router } from 'express';
import { n8nRequest, resetBasePath } from '../utils/n8n.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DEMO_WORKFLOWS, DEMO_EXECUTIONS } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// GET /api/workflows
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ data: DEMO_WORKFLOWS, count: DEMO_WORKFLOWS.length });
  }
  try {
    const data = await n8nRequest('/workflows');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message, source: 'n8n' });
  }
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const wf = DEMO_WORKFLOWS.find(w => String(w.id) === req.params.id);
    return wf ? res.json(wf) : res.status(404).json({ error: 'Not found' });
  }
  try {
    const data = await n8nRequest(`/workflows/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ id: `demo-wf-${Date.now()}`, active: false, ...req.body });
  }
  try {
    const payload = {
      name: req.body.name || 'New Workflow',
      nodes: req.body.nodes || [],
      connections: req.body.connections || {},
      settings: req.body.settings || {},
      staticData: req.body.staticData || null,
      tags: req.body.tags || [],
    };
    const data = await n8nRequest('/workflows', 'POST', payload);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/workflows/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }
  try {
    await n8nRequest(`/workflows/${req.params.id}`, 'DELETE');
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('user_workflows')
        .delete()
        .eq('workflow_id', req.params.id)
        .eq('user_id', req.user.id);
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/toggle
//
// n8n requires:
//  - Active workflows must be DEACTIVATED before PATCH
//  - Use dedicated /activate and /deactivate endpoints when available
//  - Fall back to PATCH { active } on older versions
// ─────────────────────────────────────────────
router.post('/:id/toggle', async (req, res) => {
  const { active } = req.body;
  const workflowId = req.params.id;

  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true, id: workflowId, active });
  }

  // Strategy 1: dedicated /activate or /deactivate endpoint
  const action = active ? 'activate' : 'deactivate';
  try {
    const data = await n8nRequest(`/workflows/${workflowId}/${action}`, 'POST');
    console.log(`✅ Toggle via /workflows/${workflowId}/${action}`);
    await syncToggleToSupabase(workflowId, active, req.user.id);
    return res.json({ success: true, active, data });
  } catch (err) {
    console.log(`   ↳ /${action} failed: ${err.message}`);
  }

    // Strategy 2: PATCH/PUT { active } fallback for versions that do not allow PATCH
  try {
    // n8n requires the FULL workflow object when updating
    const existing = await n8nRequest(`/workflows/${workflowId}`);
    // Build minimal valid patch body
    const patchBody = buildPatchBody(existing, { active });
    const { data, method } = await updateWorkflowWithFallback(workflowId, patchBody);
    console.log(`✅ Toggle via ${method} active=${active}`);
    await syncToggleToSupabase(workflowId, active, req.user.id);
    return res.json({ success: true, active, data });
  } catch (err) {
    console.error(`   ↳ update failed: ${err.message}`);
    return res.status(502).json({
      error: err.message,
      hint: 'Check that N8N_API_KEY is correct and n8n is reachable. Some n8n deployments disable PATCH and require PUT.',
    });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/run
//
// Auto-injects Manual Trigger if missing.
// Handles the full PATCH → run flow correctly.
// ─────────────────────────────────────────────
router.post('/:id/run', async (req, res) => {
  const workflowId = req.params.id;
  const userId = req.user.id;

  if (process.env.DEMO_MODE === 'true') {
    return res.json({
      success: true,
      execution: { id: `exec-${Date.now()}`, workflow_id: workflowId, status: 'running' },
    });
  }

  // ── 1. Fetch workflow ──
  let wf;
  try {
    wf = await n8nRequest(`/workflows/${workflowId}`);
  } catch (err) {
    return res.status(502).json({ error: `Cannot read workflow: ${err.message}` });
  }

  // ── 2. Auto-inject manual trigger if needed ──
  const hasManual = hasManualTrigger(wf.nodes || []);
  if (!hasManual) {
    console.log(`🔧 Injecting Manual Trigger into workflow ${workflowId}`);
    try {
      wf = await patchInjectManualTrigger(workflowId, wf);
      console.log(`✅ Manual Trigger injected`);
    } catch (patchErr) {
      console.error(`❌ Trigger inject failed: ${patchErr.message}`);
      // surface the real error, don't silently continue
      return res.status(502).json({
        error: `Could not add Manual Trigger to workflow: ${patchErr.message}`,
        hint: 'Try opening the workflow in n8n and adding a Manual Trigger node manually, then click Run again.',
      });
    }
  }

  // ── 3. Try running ──
  let execution = null;
  let lastError = null;

  // Strategy A: POST /workflows/:id/run
  try {
    execution = await n8nRequest(`/workflows/${workflowId}/run`, 'POST', req.body || {});
    console.log(`✅ Run via /workflows/${workflowId}/run`);
  } catch (err) {
    lastError = err;
    console.log(`   ↳ /run: ${err.message}`);
  }

  // Strategy B: POST /executions { workflowId }
  if (!execution) {
    try {
      execution = await n8nRequest('/executions', 'POST', { workflowId, ...(req.body || {}) });
      console.log(`✅ Run via POST /executions`);
    } catch (err) {
      lastError = err;
      console.log(`   ↳ /executions: ${err.message}`);
    }
  }

  // Strategy C: POST /workflows/:id/execute
  if (!execution) {
    try {
      execution = await n8nRequest(`/workflows/${workflowId}/execute`, 'POST', req.body || {});
      console.log(`✅ Run via /workflows/${workflowId}/execute`);
    } catch (err) {
      lastError = err;
      console.log(`   ↳ /execute: ${err.message}`);
    }
  }

  if (!execution) {
    return res.status(502).json({
      error: lastError?.message || 'All run strategies failed',
      hint: 'The Manual Trigger was added to the workflow. Try clicking Run one more time — n8n sometimes needs a moment to register the update.',
    });
  }

  // Log to Supabase
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('executions').insert({
      user_id: userId,
      workflow_id: workflowId,
      n8n_execution_id: String(execution?.id || execution?.executionId || ''),
      status: 'running',
      started_at: new Date().toISOString(),
    });
  } catch (_) {}

  res.json({ success: true, execution });
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id/history
// ─────────────────────────────────────────────
router.get('/:id/history', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });
  }
  try {
    const limit = req.query.limit || 20;
    const data = await n8nRequest(`/executions?workflowId=${req.params.id}&limit=${limit}`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/:id/executions', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });
  }
  try {
    const limit = req.query.limit || 20;
    const data = await n8nRequest(`/executions?workflowId=${req.params.id}&limit=${limit}`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DIAGNOSTIC: GET /api/workflows/_debug
// Shows n8n connection info — remove in production
// ─────────────────────────────────────────────
router.get('/_debug', async (req, res) => {
  const results = {
    n8n_url: process.env.N8N_URL || 'http://localhost:5678',
    api_key_set: !!process.env.N8N_API_KEY,
    api_key_preview: process.env.N8N_API_KEY
      ? process.env.N8N_API_KEY.slice(0, 6) + '…'
      : '(not set)',
    tests: [],
  };

  const base = process.env.N8N_URL || 'http://localhost:5678';
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (process.env.N8N_API_KEY) headers['X-N8N-API-KEY'] = process.env.N8N_API_KEY;

  for (const path of ['/api/v1/workflows', '/rest/workflows']) {
    const url = `${base}${path}?limit=1`;
    try {
      const r = await fetch(url, { method: 'GET', headers });
      const text = await r.text().catch(() => '');
      let body = null;
      try { body = JSON.parse(text); } catch (_) {}
      results.tests.push({
        url,
        status: r.status,
        ok: r.ok,
        body_preview: text.slice(0, 200),
      });
    } catch (err) {
      results.tests.push({ url, error: err.message });
    }
  }

  res.json(results);
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function hasManualTrigger(nodes) {
  const MANUAL_TYPES = [
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.start',
    '@n8n/n8n-nodes-langchain.manualChatTrigger',
  ];
  return nodes.some(n =>
    MANUAL_TYPES.includes(n.type) ||
    (n.type || '').toLowerCase().includes('manualtrigger') ||
    (n.name || '').toLowerCase() === 'start' ||
    (n.name || '').toLowerCase() === 'manual trigger'
  );
}

/**
 * Build a valid PATCH body for n8n.
 * n8n requires the full workflow object — partial updates cause 400/500.
 * Strip fields n8n rejects on write (id, createdAt, updatedAt, versionId).
 */
function buildPatchBody(existing, overrides = {}, options = {}) {
  const { includeActive = true } = options;
  const body = {
    name: existing.name,
    nodes: existing.nodes || [],
    connections: existing.connections || {},
    settings: existing.settings || { executionOrder: 'v1' },
    staticData: existing.staticData || null,
    tags: (existing.tags || []).map(t => (typeof t === 'object' ? t : { name: t })),
    active: existing.active,
    ...overrides,
  };

  if (includeActive && !Object.prototype.hasOwnProperty.call(body, 'active')) {
    body.active = existing.active;
  }

  if (!includeActive) delete body.active;
  return body;
}

/**
 * Inject a Manual Trigger node into a live n8n workflow.
 *
 * n8n PATCH rules:
 *  - Must send the FULL workflow body
 *  - Cannot send: id, createdAt, updatedAt, versionId, meta.instanceId
 *  - Active workflows: some versions require deactivate → patch → reactivate
 *    Others allow patching while active. We try both.
 */
async function patchInjectManualTrigger(workflowId, wf) {
  const wasActive = wf.active;
  const nodes = wf.nodes || [];
  const connections = { ...(wf.connections || {}) };

  // Position trigger to the left of the leftmost node
  const minX = nodes.length > 0
    ? Math.min(...nodes.map(n => n.position?.[0] ?? 250))
    : 250;
  const avgY = nodes.length > 0
    ? nodes.reduce((s, n) => s + (n.position?.[1] ?? 300), 0) / nodes.length
    : 300;

  const triggerNode = {
    parameters: {},
    name: 'Manual Trigger',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [minX - 220, Math.round(avgY)],
  };

  const newNodes = [triggerNode, ...nodes];

  // Find the entry-point node (nothing connects TO it)
  const receivingNodes = new Set();
  for (const src of Object.values(connections)) {
    for (const outputs of Object.values(src)) {
      for (const branch of (Array.isArray(outputs) ? outputs : [])) {
        if (Array.isArray(branch)) {
          for (const conn of branch) receivingNodes.add(conn.node);
        }
      }
    }
  }
  const entryNode = nodes.find(n => !receivingNodes.has(n.name));
  if (entryNode) {
    connections['Manual Trigger'] = {
      main: [[{ node: entryNode.name, type: 'main', index: 0 }]],
    };
  }

  const patchBody = buildPatchBody(wf, { nodes: newNodes, connections, includeactive: false });

  // Try deactivate first (some n8n versions need it)
  if (wasActive) {
    try {
      await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST');
    } catch (_) {
      // Not fatal — some versions let you PATCH while active
    }
  }

  // PATCH the workflow
  const { data: updated } = await updateWorkflowWithFallback(workflowId, patchBody);
  // Re-activate if it was active
  if (wasActive) {
    try {
      await n8nRequest(`/workflows/${workflowId}/activate`, 'POST');
    } catch (_) {}
  }

  return updated;
}

async function syncToggleToSupabase(workflowId, active, userId) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows')
      .update({ is_active: active })
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId);
  } catch (_) {}
}
async function updateWorkflowWithFallback(workflowId, body) {
  try {
    const data = await n8nRequest(`/workflows/${workflowId}`, 'PATCH', body);
    return { data, method: 'PATCH' };
  } catch (patchErr) {
    if (!/method\s+not\s+allowed|405/i.test(patchErr.message || '')) throw patchErr;
  }

  try {
    const data = await n8nRequest(`/workflows/${workflowId}`, 'PUT', body);
    return { data, method: 'PUT' };
  } catch (putErr) {
    const msg = putErr.message || '';
    if (!/request\/body\/active is read-only/i.test(msg)) {
      throw putErr;
    }

    const { active: _ignore, ...bodyWithoutActive } = body;
    const data = await n8nRequest(`/workflows/${workflowId}`, 'PUT', bodyWithoutActive);
    return { data, method: 'PUT (without active)' };
  }
}

export default router;