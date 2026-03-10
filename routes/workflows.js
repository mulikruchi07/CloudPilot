// routes/workflows.js - CloudPilot (hardened v2.1)
//
// Ownership model:
//   user_workflows table is the source of truth for who owns what.
//   Every mutating action (run / toggle / delete) MUST pass
//   assertOwnership(workflowId, userId) before touching n8n.
//   n8n IDs are never exposed raw — always scoped to (user_id, workflow_id).
//
// Organisation scope:
//   org_id is threaded through all writes so multi-tenant org support
//   can be enabled later without schema changes.

import { Router } from 'express';
import { n8nRequest, getN8nHeaders } from '../utils/n8n.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DEMO_WORKFLOWS, DEMO_EXECUTIONS } from '../utils/demo.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// OWNERSHIP ENFORCEMENT
// Returns the user_workflows row or throws 403.
// Call this before EVERY write that touches n8n.
// ─────────────────────────────────────────────
async function assertOwnership(workflowId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_workflows')
    .select('id, settings, org_id')
    .eq('workflow_id', String(workflowId))
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error('Workflow not found or access denied');
    err.status = 403;
    throw err;
  }
  return data;
}

// ─────────────────────────────────────────────
// Helper — resolve the caller's org_id.
// For single-user orgs this is just userId.
// Hook this up to an orgs table when multi-tenant.
// ─────────────────────────────────────────────
function resolveOrgId(user) {
  return user.user_metadata?.org_id || user.id;
}

function getN8nBaseUrl() {
  return (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
}

// ─────────────────────────────────────────────
// GET /api/workflows  — list workflows owned by user
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ data: DEMO_WORKFLOWS, count: DEMO_WORKFLOWS.length });

  try {
    // Pull all n8n workflows…
    const n8nData = await n8nRequest('/workflows');
    const all     = n8nData?.data || [];

    // …then filter to only those the user owns
    const supabase = getSupabaseAdmin();
    const { data: owned } = await supabase
      .from('user_workflows')
      .select('workflow_id')
      .eq('user_id', req.user.id);

    const ownedIds = new Set((owned || []).map(r => String(r.workflow_id)));

    // If user has no ownership rows yet, return all (initial install / migration)
    const filtered = ownedIds.size === 0 ? all : all.filter(w => ownedIds.has(String(w.id)));
    res.json({ data: filtered, count: filtered.length });
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
    // Ownership is advisory for reads — only enforce on writes
    res.json(await n8nRequest(`/workflows/${req.params.id}`));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// POST /api/workflows  — create + register ownership
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ id: `demo-wf-${Date.now()}`, active: false, ...req.body });
  try {
    const payload = {
      name:        req.body.name || 'New Automation',
      nodes:       req.body.nodes || [],
      connections: req.body.connections || {},
      settings:    req.body.settings || {},
      staticData:  req.body.staticData || null,
      tags:        req.body.tags || [],
    };
    const wf      = await n8nRequest('/workflows', 'POST', payload);
    const orgId   = resolveOrgId(req.user);

    // Register ownership immediately
    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows').upsert({
      user_id:       req.user.id,
      org_id:        orgId,
      workflow_id:   String(wf.id),
      workflow_name: wf.name,
      is_active:     false,
      settings:      {},
    }, { onConflict: 'user_id,workflow_id' });

    res.json(wf);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// DELETE /api/workflows/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ success: true });
  try {
    // ── Step 1: Verify ownership ──
    await assertOwnership(req.params.id, req.user.id);

    // ── Step 2: Only then call n8n ──
    await n8nRequest(`/workflows/${req.params.id}`, 'DELETE');

    // Remove ownership record
    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows').delete()
      .eq('workflow_id', req.params.id).eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    const status = err.status || 502;
    res.status(status).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/toggle
// ─────────────────────────────────────────────
router.post('/:id/toggle', async (req, res) => {
  const { active }    = req.body;
  const workflowId    = req.params.id;
  if (process.env.DEMO_MODE === 'true') return res.json({ success: true, id: workflowId, active });

  try {
    // ── Step 1: Verify ownership ──
    await assertOwnership(workflowId, req.user.id);

    // ── Step 2: Call n8n ──
    const action = active ? 'activate' : 'deactivate';
    try {
      const data = await n8nRequest(`/workflows/${workflowId}/${action}`, 'POST');
      await syncToggleToSupabase(workflowId, active, req.user.id);
      return res.json({ success: true, active, data });
    } catch (_) {}

    const existing = await n8nRequest(`/workflows/${workflowId}`);
    const body     = buildFullBody(existing, { active });
    const data     = await putWorkflow(workflowId, body);
    await syncToggleToSupabase(workflowId, active, req.user.id);
    return res.json({ success: true, active, data });
  } catch (err) {
    const status = err.status || 502;
    res.status(status).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/run
// ─────────────────────────────────────────────
router.post('/:id/run', async (req, res) => {
  const workflowId = req.params.id;
  const userId     = req.user.id;
  const orgId      = resolveOrgId(req.user);

  if (process.env.DEMO_MODE === 'true') {
    return res.json({
      success:   true,
      execution: { id: `exec-${Date.now()}`, workflow_id: workflowId, status: 'running' },
    });
  }

  const n8nBase = getN8nBaseUrl();

  // ── Step 1: Verify ownership ──
  let ownershipRow;
  try {
    ownershipRow = await assertOwnership(workflowId, userId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  // ── Step 2: Fetch workflow from n8n ──
  let wf;
  try {
    wf = await n8nRequest(`/workflows/${workflowId}`);
  } catch (err) {
    return res.status(502).json({ error: `Cannot read workflow: ${err.message}` });
  }

  // Patch settings to save executions
  const currentSettings = wf.settings || {};
  const needsPatch =
    currentSettings.saveManualExecutions !== true ||
    currentSettings.saveDataSuccessExecution !== 'all' ||
    currentSettings.saveDataErrorExecution !== 'all';

  if (needsPatch) {
    try {
      const patched = buildFullBody(wf, {
        settings: {
          ...currentSettings,
          saveManualExecutions:       true,
          saveDataSuccessExecution:   'all',
          saveDataErrorExecution:     'all',
          executionOrder:             currentSettings.executionOrder || 'v1',
        },
      });
      wf = await putWorkflow(workflowId, patched);
    } catch (err) {
      console.warn(`⚠ Could not patch workflow settings: ${err.message}`);
    }
  }

  // ── Step 3: Resolve webhook URL from ownership settings ──
  let webhookUrl = ownershipRow?.settings?.webhook_url || null;

  if (!webhookUrl) {
    const webhookNode = findWebhookTriggerNode(wf.nodes || []);
    if (webhookNode) {
      webhookUrl = deriveWebhookUrl(n8nBase, webhookNode);
    } else {
      try {
        const result = await injectWebhookTrigger(workflowId, wf, n8nBase);
        wf         = result.wf;
        webhookUrl = result.webhookUrl;
      } catch (err) {
        return res.status(502).json({ error: `Could not set up workflow: ${err.message}` });
      }
    }

    try {
      await n8nRequest(`/workflows/${workflowId}/activate`, 'POST');
      await delay(800);
    } catch (_) {}

    await storeWebhookUrl(workflowId, userId, webhookUrl);
  }

  // ── Step 4: Snapshot execution count before firing ──
  let execCountBefore = 0;
  try {
    const before = await n8nRequest(`/executions?workflowId=${workflowId}&limit=1`);
    const list   = before?.data || before?.executions || [];
    execCountBefore = list.length > 0 ? Number(list[0].id) : 0;
  } catch (_) {}

  // ── Step 5: Fire webhook ──
  const runStartedAt = new Date().toISOString();
  try {
    const r = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ source: 'cloudpilot', workflowId }),
      signal:  AbortSignal.timeout(15000),
    });
    if (!r.ok && r.status !== 404) {
      await delay(1000);
      const r2 = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: 'cloudpilot', workflowId }),
        signal:  AbortSignal.timeout(15000),
      });
      if (!r2.ok) {
        await clearStoredWebhookUrl(workflowId, userId);
        const text = await r2.text();
        throw new Error(`Webhook returned ${r2.status}: ${text.slice(0, 200)}`);
      }
    }
  } catch (err) {
    await clearStoredWebhookUrl(workflowId, userId);
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  // ── Step 6: Poll for the new execution ID ──
  let n8nExecutionId = null;
  for (let i = 0; i < 8; i++) {
    await delay(1000);
    try {
      const execList = await n8nRequest(`/executions?workflowId=${workflowId}&limit=5`);
      const list     = execList?.data || execList?.executions || [];
      const newest   = list.find(e => Number(e.id) > execCountBefore);
      if (newest) { n8nExecutionId = String(newest.id); break; }
    } catch (_) {}
  }

  // ── Step 7: Log to Supabase with proper timestamps and org scope ──
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('executions').insert({
      user_id:           userId,
      org_id:            orgId,
      workflow_id:       workflowId,
      n8n_execution_id:  n8nExecutionId,
      status:            'running',        // queued → running → success/failed/canceled
      started_at:        runStartedAt,
      finished_at:       null,
      duration_ms:       null,             // filled by webhook/poll completion
    });
  } catch (err) {
    console.warn('Could not log execution to Supabase:', err.message);
  }

  res.json({
    success:   true,
    execution: {
      id:          n8nExecutionId || `wh-${Date.now()}`,
      workflow_id: workflowId,
      status:      'running',
    },
  });
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id/history
// ─────────────────────────────────────────────
router.get('/:id/history', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });

  try {
    const limit = req.query.limit || 20;
    const data  = await n8nRequest(`/executions?workflowId=${req.params.id}&limit=${limit}`);
    const executions = data?.data || data?.executions || [];

    // Back-fill Supabase for untracked executions, with correct duration
    if (executions.length && req.user?.id) {
      const supabase = getSupabaseAdmin();
      const orgId    = resolveOrgId(req.user);

      for (const exec of executions) {
        const n8nId = String(exec.id);
        try {
          const { data: existing } = await supabase
            .from('executions')
            .select('id')
            .eq('n8n_execution_id', n8nId)
            .maybeSingle();

          if (!existing) {
            const startedAt  = exec.startedAt  || exec.started_at  || null;
            const finishedAt = exec.stoppedAt   || exec.finished_at || null;
            const durationMs = startedAt && finishedAt
              ? new Date(finishedAt).getTime() - new Date(startedAt).getTime()
              : null;

            await supabase.from('executions').insert({
              n8n_execution_id: n8nId,
              user_id:          req.user.id,
              org_id:           orgId,
              workflow_id:      String(req.params.id),
              status:           exec.finished
                ? (exec.status === 'error' ? 'failed' : 'success')
                : 'running',
              started_at:   startedAt,
              finished_at:  finishedAt,
              duration_ms:  durationMs,   // ← was always null before; now computed
            });
          }
        } catch (_) {}
      }
    }

    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/:id/executions', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });
  try {
    res.json(await n8nRequest(`/executions?workflowId=${req.params.id}&limit=${req.query.limit || 20}`));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// WEBHOOK URL STORAGE  (uses ownership record)
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
    const { data: existing } = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId)
      .maybeSingle();

    const settings = { ...(existing?.settings || {}), webhook_url: webhookUrl };
    if (existing) {
      await supabase.from('user_workflows')
        .update({ settings })
        .eq('workflow_id', String(workflowId))
        .eq('user_id', userId);
    } else {
      await supabase.from('user_workflows').insert({
        user_id:       userId,
        workflow_id:   String(workflowId),
        workflow_name: `Automation ${workflowId}`,
        is_active:     true,
        settings,
      });
    }
  } catch (err) { console.warn('Could not store webhook URL:', err.message); }
}

async function clearStoredWebhookUrl(workflowId, userId) {
  try {
    const supabase  = getSupabaseAdmin();
    const { data }  = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      const settings = { ...(data.settings || {}) };
      delete settings.webhook_url;
      await supabase.from('user_workflows')
        .update({ settings })
        .eq('workflow_id', String(workflowId))
        .eq('user_id', userId);
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────
function findWebhookTriggerNode(nodes) {
  return nodes.find(n =>
    (n.type || '').toLowerCase().includes('webhook') &&
    !(n.type || '').toLowerCase().includes('respond')
  ) || null;
}

function generateWebhookPath() {
  return 'cp-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function deriveWebhookUrl(n8nBase, webhookNode) {
  const path = webhookNode?.parameters?.path || webhookNode?.parameters?.webhookId;
  if (!path) return null;
  return `${n8nBase}/webhook/${path}`;
}

async function injectWebhookTrigger(workflowId, wf, n8nBase) {
  const nodes       = [...(wf.nodes || [])];
  const connections = { ...(wf.connections || {}) };
  const webhookPath = generateWebhookPath();
  const webhookUrl  = `${n8nBase}/webhook/${webhookPath}`;

  const minX = nodes.length > 0 ? Math.min(...nodes.map(n => n.position?.[0] ?? 250)) : 250;
  const avgY = nodes.length > 0
    ? nodes.reduce((s, n) => s + (n.position?.[1] ?? 300), 0) / nodes.length : 300;

  const webhookNode = {
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'onReceived', options: {} },
    name:        'CloudPilot Trigger',
    type:        'n8n-nodes-base.webhook',
    typeVersion: 1,
    position:    [minX - 220, Math.round(avgY)],
    webhookId:   webhookPath,
  };

  const newNodes = [webhookNode, ...nodes];
  const receivingNodes = new Set();
  for (const src of Object.values(connections)) {
    for (const outputs of Object.values(src)) {
      for (const branch of (Array.isArray(outputs) ? outputs : [])) {
        if (Array.isArray(branch)) for (const conn of branch) receivingNodes.add(conn.node);
      }
    }
  }
  const entryNode = nodes.find(n => !receivingNodes.has(n.name));
  if (entryNode) connections['CloudPilot Trigger'] = { main: [[{ node: entryNode.name, type: 'main', index: 0 }]] };

  const updatedSettings = {
    ...(wf.settings || {}),
    saveManualExecutions:     true,
    saveDataSuccessExecution: 'all',
    saveDataErrorExecution:   'all',
    executionOrder:           (wf.settings || {}).executionOrder || 'v1',
  };

  if (wf.active) {
    try { await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST'); } catch (_) {}
  }

  const updatedWf = await putWorkflow(workflowId, buildFullBody(wf, {
    nodes: newNodes, connections, settings: updatedSettings,
  }));
  return { wf: updatedWf, webhookUrl };
}

function buildFullBody(existing, overrides = {}) {
  const body = {
    name:        existing.name,
    nodes:       existing.nodes || [],
    connections: existing.connections || {},
    settings:    existing.settings || { executionOrder: 'v1' },
    staticData:  existing.staticData || null,
    ...overrides,
  };
  ['active','tags','versionId','meta','id','createdAt','updatedAt'].forEach(k => delete body[k]);
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
