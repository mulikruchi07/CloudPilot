// routes/workflows.js
import { Router } from 'express';
import { n8nRequest, getN8nHeaders } from '../utils/n8n.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DEMO_WORKFLOWS, DEMO_EXECUTIONS } from '../utils/demo.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

function getN8nBaseUrl() {
  return (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
}

// ─────────────────────────────────────────────
// GET /api/workflows
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ data: DEMO_WORKFLOWS, count: DEMO_WORKFLOWS.length });
  try { res.json(await n8nRequest('/workflows')); }
  catch (err) { res.status(502).json({ error: err.message, source: 'n8n' }); }
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const wf = DEMO_WORKFLOWS.find(w => String(w.id) === req.params.id);
    return wf ? res.json(wf) : res.status(404).json({ error: 'Not found' });
  }
  try { res.json(await n8nRequest(`/workflows/${req.params.id}`)); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// POST /api/workflows
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ id: `demo-wf-${Date.now()}`, active: false, ...req.body });
  try {
    const payload = {
      name: req.body.name || 'New Workflow',
      nodes: req.body.nodes || [],
      connections: req.body.connections || {},
      settings: req.body.settings || {},
      staticData: req.body.staticData || null,
      tags: req.body.tags || [],
    };
    res.json(await n8nRequest('/workflows', 'POST', payload));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// DELETE /api/workflows/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ success: true });
  try {
    await n8nRequest(`/workflows/${req.params.id}`, 'DELETE');
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('user_workflows').delete()
        .eq('workflow_id', req.params.id).eq('user_id', req.user.id);
    } catch (_) {}
    res.json({ success: true });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/toggle
// Uses PUT (not PATCH) since your n8n returns 405 on PATCH
// ─────────────────────────────────────────────
router.post('/:id/toggle', async (req, res) => {
  const { active } = req.body;
  const workflowId = req.params.id;
  if (process.env.DEMO_MODE === 'true') return res.json({ success: true, id: workflowId, active });

  // Strategy 1: dedicated activate/deactivate endpoints
  try {
    const action = active ? 'activate' : 'deactivate';
    const data = await n8nRequest(`/workflows/${workflowId}/${action}`, 'POST');
    await syncToggleToSupabase(workflowId, active, req.user.id);
    return res.json({ success: true, active, data });
  } catch (err) {
    console.log(`   ↳ activate/deactivate failed: ${err.message}`);
  }

  // Strategy 2: PUT with full workflow body (PATCH is blocked on your n8n)
  try {
    const existing = await n8nRequest(`/workflows/${workflowId}`);
    const body = buildFullBody(existing, { active });
    const data = await putWorkflow(workflowId, body);
    await syncToggleToSupabase(workflowId, active, req.user.id);
    return res.json({ success: true, active, data });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/run
//
// n8n community edition has NO public API run endpoint.
// /rest/* requires browser session cookies, not API keys.
//
// WORKING APPROACH for your setup:
//  1. Ensure workflow has a Manual Trigger (inject via PUT if missing)
//  2. Activate the workflow so its trigger is registered
//  3. Call POST /api/v1/workflows/:id/run — this works when the
//     workflow is ACTIVE in n8n 1.x community edition
//  4. Deactivate again if it was originally inactive
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

  const n8nBase = getN8nBaseUrl();
  const headers = getN8nHeaders();

  // ── 1. Fetch the workflow ──
  let wf;
  try {
    wf = await n8nRequest(`/workflows/${workflowId}`);
  } catch (err) {
    return res.status(502).json({ error: `Cannot read workflow: ${err.message}` });
  }

  const wasActive = wf.active;

  // ── 2. Inject Manual Trigger via PUT if missing ──
  if (!hasManualTrigger(wf.nodes || [])) {
    console.log(`🔧 Injecting Manual Trigger into ${workflowId}`);
    try {
      wf = await injectTriggerViaPut(workflowId, wf);
      console.log(`✅ Manual Trigger injected via PUT`);
    } catch (err) {
      return res.status(502).json({
        error: `Failed to inject trigger: ${err.message}`,
        hint: 'Open the workflow in n8n, add a Manual Trigger node manually, then try Run again.',
      });
    }
  }

  // ── 3. Activate workflow if inactive (required for run API) ──
  if (!wf.active) {
    try {
      await n8nRequest(`/workflows/${workflowId}/activate`, 'POST');
      console.log(`✅ Activated workflow ${workflowId} for execution`);
      // small pause so n8n registers the activation
      await delay(500);
    } catch (err) {
      console.warn(`⚠ Could not activate workflow: ${err.message}`);
    }
  }

  // ── 4. Try run endpoints ──
  let execution = null;
  const attempts = [];

  // 4A: POST /api/v1/workflows/:id/run  (works when workflow is active)
  try {
    const url = `${n8nBase}/api/v1/workflows/${workflowId}/run`;
    console.log(`📡 Run attempt A: POST ${url}`);
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch (_) {}
    attempts.push({ attempt: 'A: /api/v1/run', status: r.status, response: text.slice(0, 300) });

    if (r.ok) {
      execution = {
        id: body?.data?.executionId || body?.executionId || body?.id || `A-${Date.now()}`,
        workflowId,
        status: 'running',
      };
      console.log(`✅ Run via /api/v1/workflows/${workflowId}/run`);
    } else {
      console.log(`   ↳ A failed: ${r.status} — ${text.slice(0, 150)}`);
    }
  } catch (err) {
    attempts.push({ attempt: 'A: /api/v1/run', error: err.message });
    console.log(`   ↳ A error: ${err.message}`);
  }

  // 4B: POST /api/v1/executions  (alternate endpoint)
  if (!execution) {
    try {
      const url = `${n8nBase}/api/v1/executions`;
      console.log(`📡 Run attempt B: POST ${url}`);
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workflowId }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await r.text();
      let body; try { body = JSON.parse(text); } catch (_) {}
      attempts.push({ attempt: 'B: /api/v1/executions', status: r.status, response: text.slice(0, 300) });

      if (r.ok) {
        execution = {
          id: body?.data?.id || body?.id || `B-${Date.now()}`,
          workflowId,
          status: 'running',
        };
        console.log(`✅ Run via POST /api/v1/executions`);
      } else {
        console.log(`   ↳ B failed: ${r.status} — ${text.slice(0, 150)}`);
      }
    } catch (err) {
      attempts.push({ attempt: 'B: /api/v1/executions', error: err.message });
    }
  }

  // ── 5. Restore original active state if we changed it ──
  if (!wasActive) {
    try {
      await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST');
      console.log(`✅ Restored workflow ${workflowId} to inactive`);
    } catch (_) {}
  }

  // ── 6. Handle failure ──
  if (!execution) {
    console.error(`❌ All run attempts failed:`, JSON.stringify(attempts, null, 2));
    return res.status(502).json({
      error: 'Could not trigger workflow execution',
      attempts,
      hint: [
        'Your n8n setup may need N8N_EXECUTIONS_MODE=regular in Docker environment.',
        'Check your n8n Docker compose file and ensure the workflow has a Manual Trigger node.',
        'Also confirm N8N_API_KEY is set and correct in both .env and n8n Docker env.',
      ],
    });
  }

  // ── 7. Log to Supabase ──
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('executions').insert({
      user_id: userId,
      workflow_id: workflowId,
      n8n_execution_id: String(execution.id),
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
  if (process.env.DEMO_MODE === 'true') return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });
  try {
    res.json(await n8nRequest(`/executions?workflowId=${req.params.id}&limit=${req.query.limit || 20}`));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.get('/:id/executions', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });
  try {
    res.json(await n8nRequest(`/executions?workflowId=${req.params.id}&limit=${req.query.limit || 20}`));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function hasManualTrigger(nodes) {
  return nodes.some(n =>
    ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.start'].includes(n.type) ||
    (n.type || '').toLowerCase().includes('manualtrigger') ||
    ['start', 'manual trigger'].includes((n.name || '').toLowerCase())
  );
}

// Build a full workflow body suitable for PUT
// n8n PUT rejects these fields as read-only: active, tags, versionId, meta
function buildFullBody(existing, overrides = {}) {
  const body = {
    name: existing.name,
    nodes: existing.nodes || [],
    connections: existing.connections || {},
    settings: existing.settings || { executionOrder: 'v1' },
    staticData: existing.staticData || null,
    ...overrides,
  };
  // Strip all read-only fields n8n rejects on PUT
  delete body.active;
  delete body.tags;
  delete body.versionId;
  delete body.meta;
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  return body;
}

// PUT the workflow — the only update method your n8n allows
async function putWorkflow(workflowId, body) {
  return n8nRequest(`/workflows/${workflowId}`, 'PUT', body);
}

// Inject a Manual Trigger node via PUT (since PATCH is blocked)
async function injectTriggerViaPut(workflowId, wf) {
  const nodes = wf.nodes || [];
  const connections = { ...(wf.connections || {}) };

  const minX = nodes.length > 0 ? Math.min(...nodes.map(n => n.position?.[0] ?? 250)) : 250;
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

  // Find the entry node (nothing connects to it) and wire trigger → it
  const receivingNodes = new Set();
  for (const src of Object.values(connections)) {
    for (const outputs of Object.values(src)) {
      for (const branch of (Array.isArray(outputs) ? outputs : [])) {
        if (Array.isArray(branch)) for (const conn of branch) receivingNodes.add(conn.node);
      }
    }
  }
  const entryNode = nodes.find(n => !receivingNodes.has(n.name));
  if (entryNode) {
    connections['Manual Trigger'] = { main: [[{ node: entryNode.name, type: 'main', index: 0 }]] };
  }

  // Deactivate first so n8n allows the update
  const wasActive = wf.active;
  if (wasActive) {
    try { await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST'); } catch (_) {}
  }

  const updatedWf = await putWorkflow(workflowId, buildFullBody(wf, { nodes: newNodes, connections }));

  // Re-activate if it was active (we'll activate again anyway in run, but be consistent)
  if (wasActive) {
    try { await n8nRequest(`/workflows/${workflowId}/activate`, 'POST'); } catch (_) {}
  }

  return updatedWf;
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

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export default router;