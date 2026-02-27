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

  // Strategy 2: PUT with full workflow body
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
// Silent webhook-based execution strategy:
//  1. Check Supabase for a stored webhook URL for this workflow
//  2. If none, inject a Webhook trigger node into the workflow via PUT,
//     activate the workflow, derive + store the webhook URL
//  3. POST to the webhook URL silently — user just sees success/failure
//  4. No URL is ever shown to the user
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

  // ── 1. Check for stored webhook URL ──
  let webhookUrl = await getStoredWebhookUrl(workflowId, userId);

  if (!webhookUrl) {
    // ── 2. Fetch the workflow and ensure it has a Webhook trigger ──
    let wf;
    try {
      wf = await n8nRequest(`/workflows/${workflowId}`);
    } catch (err) {
      return res.status(502).json({ error: `Cannot read workflow: ${err.message}` });
    }

    const webhookNode = findWebhookTriggerNode(wf.nodes || []);

    if (webhookNode) {
      // Already has a webhook node — derive its URL
      webhookUrl = deriveWebhookUrl(n8nBase, webhookNode);
    } else {
      // Inject a Webhook trigger node
      console.log(`🔧 Injecting Webhook Trigger into workflow ${workflowId}`);
      try {
        const result = await injectWebhookTrigger(workflowId, wf, n8nBase);
        wf = result.wf;
        webhookUrl = result.webhookUrl;
        console.log(`✅ Webhook Trigger injected: ${webhookUrl}`);
      } catch (err) {
        return res.status(502).json({
          error: `Could not set up workflow for execution: ${err.message}`,
        });
      }
    }

    // ── 3. Activate the workflow so the webhook is live ──
    try {
      await n8nRequest(`/workflows/${workflowId}/activate`, 'POST');
      console.log(`✅ Activated workflow ${workflowId}`);
      await delay(600); // give n8n a moment to register the webhook
    } catch (err) {
      console.warn(`⚠ Could not activate workflow: ${err.message}`);
    }

    // ── 4. Store the webhook URL for future runs ──
    await storeWebhookUrl(workflowId, userId, webhookUrl);
  }

  // ── 5. Call the webhook silently ──
  console.log(`📡 Calling webhook: ${webhookUrl}`);
  let execution;
  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'cloudpilot', workflowId }),
      signal: AbortSignal.timeout(15000),
    });

    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch (_) {}

    if (!r.ok && r.status !== 404) {
      // 404 can happen briefly after activation — retry once
      console.warn(`Webhook returned ${r.status}, retrying after 1s…`);
      await delay(1000);
      const r2 = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'cloudpilot', workflowId }),
        signal: AbortSignal.timeout(15000),
      });
      const text2 = await r2.text();
      try { body = JSON.parse(text2); } catch (_) {}
      if (!r2.ok) {
        // Clear stored URL so next run re-derives it
        await clearStoredWebhookUrl(workflowId, userId);
        throw new Error(`Webhook returned ${r2.status}: ${text2.slice(0, 200)}`);
      }
    }

    execution = {
      id: body?.executionId || body?.data?.executionId || body?.id || `wh-${Date.now()}`,
      workflowId,
      status: 'running',
    };
    console.log(`✅ Workflow triggered via webhook`);
  } catch (err) {
    // Clear stored URL so next run re-derives/re-injects
    await clearStoredWebhookUrl(workflowId, userId);
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  // ── 6. Log to Supabase ──
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
// WEBHOOK URL STORAGE HELPERS
// ─────────────────────────────────────────────

async function getStoredWebhookUrl(workflowId, userId) {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_workflows')
      .select('settings')
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId)
      .maybeSingle();
    return data?.settings?.webhook_url || null;
  } catch (_) { return null; }
}

async function storeWebhookUrl(workflowId, userId, webhookUrl) {
  try {
    const supabase = getSupabaseAdmin();
    // Upsert so it works for workflows not imported through templates
    const { data: existing } = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('user_workflows')
        .update({ settings: { ...(existing.settings || {}), webhook_url: webhookUrl } })
        .eq('workflow_id', String(workflowId))
        .eq('user_id', userId);
    } else {
      await supabase.from('user_workflows').insert({
        user_id: userId,
        workflow_id: String(workflowId),
        workflow_name: `Workflow ${workflowId}`,
        is_active: true,
        settings: { webhook_url: webhookUrl },
      });
    }
    console.log(`💾 Stored webhook URL for workflow ${workflowId}`);
  } catch (err) {
    console.warn('Could not store webhook URL:', err.message);
  }
}

async function clearStoredWebhookUrl(workflowId, userId) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      const settings = { ...(existing.settings || {}) };
      delete settings.webhook_url;
      await supabase
        .from('user_workflows')
        .update({ settings })
        .eq('workflow_id', String(workflowId))
        .eq('user_id', userId);
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────
// WEBHOOK NODE HELPERS
// ─────────────────────────────────────────────

function findWebhookTriggerNode(nodes) {
  return nodes.find(n =>
    (n.type || '').toLowerCase().includes('webhook') &&
    !(n.type || '').toLowerCase().includes('respond')
  ) || null;
}

function generateWebhookPath() {
  // Generate a stable-looking random path
  return 'cp-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function deriveWebhookUrl(n8nBase, webhookNode) {
  const path = webhookNode?.parameters?.path || webhookNode?.parameters?.webhookId;
  if (!path) return null;
  return `${n8nBase}/webhook/${path}`;
}

async function injectWebhookTrigger(workflowId, wf, n8nBase) {
  const nodes = [...(wf.nodes || [])];
  const connections = { ...(wf.connections || {}) };

  const webhookPath = generateWebhookPath();
  const webhookUrl = `${n8nBase}/webhook/${webhookPath}`;

  // Position the webhook node to the left of existing nodes
  const minX = nodes.length > 0 ? Math.min(...nodes.map(n => n.position?.[0] ?? 250)) : 250;
  const avgY = nodes.length > 0
    ? nodes.reduce((s, n) => s + (n.position?.[1] ?? 300), 0) / nodes.length
    : 300;

  const webhookNode = {
    parameters: {
      httpMethod: 'POST',
      path: webhookPath,
      responseMode: 'onReceived',
      options: {},
    },
    name: 'CloudPilot Trigger',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    position: [minX - 220, Math.round(avgY)],
    webhookId: webhookPath,
  };

  const newNodes = [webhookNode, ...nodes];

  // Wire webhook → first unconnected node
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
    connections['CloudPilot Trigger'] = { main: [[{ node: entryNode.name, type: 'main', index: 0 }]] };
  }

  // Deactivate before PUT (n8n rejects updates to active workflows)
  const wasActive = wf.active;
  if (wasActive) {
    try { await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST'); } catch (_) {}
  }

  const updatedWf = await putWorkflow(workflowId, buildFullBody(wf, { nodes: newNodes, connections }));

  return { wf: updatedWf, webhookUrl };
}

// ─────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────

function buildFullBody(existing, overrides = {}) {
  const body = {
    name: existing.name,
    nodes: existing.nodes || [],
    connections: existing.connections || {},
    settings: existing.settings || { executionOrder: 'v1' },
    staticData: existing.staticData || null,
    ...overrides,
  };
  // Strip read-only fields n8n rejects on PUT
  delete body.active;
  delete body.tags;
  delete body.versionId;
  delete body.meta;
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  return body;
}

async function putWorkflow(workflowId, body) {
  return n8nRequest(`/workflows/${workflowId}`, 'PUT', body);
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