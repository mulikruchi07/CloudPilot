// routes/workflows.js - CloudPilot (hardened v3.0)
//
// Ownership model:
//   user_workflows table is the source of truth for who owns what.
//   Every mutating action (run / toggle / delete) MUST pass
//   assertOwnership(workflowId, userId) before touching the engine.
//   engine_workflow_ref is the internal n8n ID — never exposed in API responses.
//
// Organisation scope:
//   org_id is threaded through all writes so multi-tenant org support
//   can be enabled later without schema changes.

import { Router } from 'express';
import {
  engineGetWorkflow,
  engineCreateWorkflow,
  engineDeleteWorkflow,
  engineActivateWorkflow,
  engineDeactivateWorkflow,
  engineUpdateWorkflow,
  engineListExecutions,
} from '../utils/engine.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DEMO_WORKFLOWS, DEMO_EXECUTIONS } from '../utils/demo.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// OWNERSHIP ENFORCEMENT
// Returns the full user_workflows row or throws 403.
// Call this before EVERY write that touches the engine.
// ─────────────────────────────────────────────
async function assertOwnership(workflowId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_workflows')
    .select('id, settings, org_id, engine_workflow_ref, is_active, install_status')
    .eq('id', workflowId)
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

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
// GET /api/workflows  — list workflows owned by user
// Reads entirely from Supabase — no engine call.
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true')
    return res.json({ data: DEMO_WORKFLOWS, count: DEMO_WORKFLOWS.length });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_workflows')
      .select('id, workflow_name, is_active, install_status, created_at, last_run_at, settings, template_id')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = data || [];
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    // Never expose err.message — it may contain engine details
    res.status(500).json({ error: 'Failed to load workflows' });
  }
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id
// Reads from Supabase — strips engine fields.
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const wf = DEMO_WORKFLOWS.find(w => String(w.id) === req.params.id);
    return wf ? res.json(wf) : res.status(404).json({ error: 'Not found' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_workflows')
      .select('id, workflow_name, is_active, install_status, created_at, last_run_at, settings, template_id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Workflow not found' });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workflow' });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows  — create + register ownership
// Creates the workflow in the engine, stores only the ref.
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true')
    return res.json({ id: `demo-wf-${Date.now()}`, active: false, ...req.body });

  try {
    const payload = {
      name:        req.body.name || 'New Automation',
      nodes:       req.body.nodes || [],
      connections: req.body.connections || {},
      settings:    req.body.settings || {},
      staticData:  req.body.staticData || null,
      tags:        req.body.tags || [],
    };

    const { engineRef } = await engineCreateWorkflow(payload);
    const orgId = resolveOrgId(req.user);

    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from('user_workflows')
      .insert({
        user_id:             req.user.id,
        org_id:              orgId,
        engine_workflow_ref: engineRef,   // internal — never in API response
        workflow_name:       payload.name,
        is_active:           false,
        install_status:      'installed',
        settings:            {},
      })
      .select('id, workflow_name, is_active, install_status, created_at')
      .single();

    if (error) throw error;

    // No engine fields in response
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/workflows/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ success: true });

  try {
    const ownership = await assertOwnership(req.params.id, req.user.id);

    if (ownership.engine_workflow_ref) {
      await engineDeleteWorkflow(ownership.engine_workflow_ref).catch(() => {});
    }

    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows').delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.status === 403 ? err.message : 'Failed to delete workflow' });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/toggle
// ─────────────────────────────────────────────
router.post('/:id/toggle', async (req, res) => {
  const { active } = req.body;
  const workflowId = req.params.id;

  if (process.env.DEMO_MODE === 'true')
    return res.json({ success: true, id: workflowId, active });

  try {
    const ownership = await assertOwnership(workflowId, req.user.id);

    if (!ownership.engine_workflow_ref) {
      return res.status(400).json({ error: 'Workflow is not installed in the engine yet' });
    }

    const engineFn = active ? engineActivateWorkflow : engineDeactivateWorkflow;

    try {
      await engineFn(ownership.engine_workflow_ref);
    } catch (engineErr) {
      // Fallback: update via full PUT if activate/deactivate endpoint fails
      try {
        const existing = await engineGetWorkflow(ownership.engine_workflow_ref);
        const body = buildFullBody(existing, { active });
        await engineUpdateWorkflow(ownership.engine_workflow_ref, body);
      } catch (_) {
        throw engineErr; // rethrow original if fallback also fails
      }
    }

    await syncToggleToSupabase(workflowId, active, req.user.id);
    return res.json({ success: true, active });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.status === 403 ? err.message : 'Failed to toggle workflow' });
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
      execution: { id: `exec-${Date.now()}`, status: 'running' },
    });
  }

  // ── Step 1: Verify ownership + get engine ref ──
  let ownership;
  try {
    ownership = await assertOwnership(workflowId, userId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  // Guard: engine ref must exist
  if (!ownership.engine_workflow_ref) {
    return res.status(400).json({ error: 'Workflow is not installed. Please reinstall from templates.' });
  }

  const engineRef = ownership.engine_workflow_ref;

  // Guard: engine ref must be a numeric string — n8n rejects anything else
  if (!/^\d+$/.test(String(engineRef).trim())) {
    console.error(`[run] Invalid engine_workflow_ref for workflow ${workflowId}:`, engineRef);
    return res.status(400).json({
      error: 'Workflow engine reference is corrupt. Please delete and reinstall this workflow from templates.',
    });
  }

  const n8nBase  = getN8nBaseUrl();
  const supabase = getSupabaseAdmin();

  // ── Pre-flight: verify n8n is reachable before touching Supabase ──
  try {
    const { checkN8nHealth } = await import('../utils/n8n.js');
    const health = await checkN8nHealth();
    if (!health.connected) {
      console.error('[run] n8n health check failed:', health.error || `HTTP ${health.status}`);
      return res.status(503).json({ error: 'Automation engine is not reachable. Please try again later.' });
    }
  } catch (healthErr) {
    console.error('[run] n8n health check threw:', healthErr.message);
    return res.status(503).json({ error: 'Automation engine is not reachable. Please try again later.' });
  }

  // ── Step 2: Pre-register execution in Supabase ──
  // Source of truth — created before the engine fires.
  let cloudpilotExecId;
  try {
    const { data: execRow, error: execErr } = await supabase
      .from('executions')
      .insert({
        user_id:          userId,
        org_id:           orgId,
        user_workflow_id: ownership.id,
        status:           'running',
        trigger_type:     'manual',
        started_at:       new Date().toISOString(),
      })
      .select('id')
      .single();

    if (execErr) throw execErr;
    cloudpilotExecId = execRow.id;
    console.log(`[run] Pre-registered execution: ${cloudpilotExecId}`);
  } catch (err) {
    // Non-fatal — log the real reason so schema issues are visible in the console
    console.warn('[run] Could not pre-register execution (non-fatal):', err.message);
  }

  // ── Step 3: Ensure workflow has a webhook trigger + is active ──
  let webhookUrl = ownership.settings?.webhook_url || null;
  console.log(`[run] Cached webhookUrl: ${webhookUrl}`);

  if (!webhookUrl) {
    try {
      console.log(`[run] Step 3 — fetching workflow from engine: ref=${engineRef}`);
      const wf = await engineGetWorkflow(engineRef);

      // Patch settings so executions are persisted in n8n
      const currentSettings = wf.settings || {};
      const needsPatch =
        currentSettings.saveManualExecutions !== true ||
        currentSettings.saveDataSuccessExecution !== 'all' ||
        currentSettings.saveDataErrorExecution !== 'all';

      let patchedWf = wf;
      if (needsPatch) {
        try {
          const patched = buildFullBody(wf, {
            settings: {
              ...currentSettings,
              saveManualExecutions:     true,
              saveDataSuccessExecution: 'all',
              saveDataErrorExecution:   'all',
              executionOrder:           currentSettings.executionOrder || 'v1',
            },
          });
          patchedWf = await engineUpdateWorkflow(engineRef, patched);
          console.log('[run] Workflow settings patched.');
        } catch (patchErr) {
          // Non-fatal — warn and continue with existing settings
          console.warn('[run] Could not patch workflow settings (non-fatal):', patchErr.message);
        }
      }

      const webhookNode = findWebhookTriggerNode(patchedWf.nodes || []);
      if (webhookNode) {
        webhookUrl = deriveWebhookUrl(n8nBase, webhookNode);
        console.log(`[run] Found existing webhook node → ${webhookUrl}`);
      } else {
        console.log('[run] No webhook node found — injecting CloudPilot trigger...');
        const result = await injectWebhookTrigger(engineRef, patchedWf, n8nBase);
        webhookUrl = result.webhookUrl;
        console.log(`[run] Injected webhook → ${webhookUrl}`);
      }

      await engineActivateWorkflow(engineRef).catch(activateErr =>
        console.warn('[run] Could not activate workflow (non-fatal):', activateErr.message)
      );
      await delay(800);
      await storeWebhookUrl(workflowId, userId, webhookUrl);
    } catch (err) {
      console.error('[run] Step 3 engine error:', err.message);
      await markExecutionFailed(cloudpilotExecId, 'Workflow setup failed');
      return res.status(502).json({ error: 'Could not set up workflow trigger. Check engine connectivity.' });
    }
  }

  // ── Step 4: Fire webhook ──
  // Pass cloudpilotExecId so the engine callback can update the right record.
  try {
    const body = JSON.stringify({
      source:       'cloudpilot',
      execution_id: cloudpilotExecId,
    });

    console.log(`[run] Step 4 — POSTing to webhook: ${webhookUrl}`);
    const r = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(15000),
    });
    console.log(`[run] Webhook response: ${r.status}`);

    if (!r.ok && r.status !== 404) {
      // One retry after a short pause
      console.warn(`[run] Webhook returned ${r.status} — retrying in 1s...`);
      await delay(1000);
      const r2 = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal:  AbortSignal.timeout(15000),
      });
      console.log(`[run] Retry webhook response: ${r2.status}`);

      if (!r2.ok) {
        await clearStoredWebhookUrl(workflowId, userId);
        await markExecutionFailed(cloudpilotExecId, `Webhook trigger returned HTTP ${r2.status}`);
        return res.status(502).json({ error: 'Execution trigger failed. Please try again.' });
      }
    }
  } catch (err) {
    console.error('[run] Step 4 webhook error:', err.message);
    await clearStoredWebhookUrl(workflowId, userId);
    await markExecutionFailed(cloudpilotExecId, 'Webhook trigger failed');
    return res.status(502).json({ error: 'Execution trigger failed. Please try again.' });
  }

  // ── Step 5: Update last_run_at on the workflow record ──
  supabase.from('user_workflows')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', workflowId)
    .catch(err => console.warn('[run] Could not update last_run_at (non-fatal):', err.message));

  console.log(`[run] Done — execution ${cloudpilotExecId || '(no id)'} dispatched.`);

  // Return the CloudPilot execution ID — NOT the engine ID
  res.json({
    success:   true,
    execution: {
      id:     cloudpilotExecId || `wh-${Date.now()}`,
      status: 'running',
    },
  });
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id/history
// Reads from Supabase — CloudPilot is source of truth.
// ─────────────────────────────────────────────
router.get('/:id/history', async (req, res) => {
  if (process.env.DEMO_MODE === 'true')
    return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });

  try {
    const ownership = await assertOwnership(req.params.id, req.user.id);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('executions')
      .select('id, status, trigger_type, started_at, finished_at, duration_ms, error_message')
      .eq('user_workflow_id', ownership.id)
      .order('started_at', { ascending: false })
      .limit(Number(req.query.limit) || 50);

    if (error) throw error;
    res.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.status === 403 ? err.message : 'Failed to load history' });
  }
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id/executions
// Alias for /history — same Supabase-backed response.
// ─────────────────────────────────────────────
router.get('/:id/executions', async (req, res) => {
  if (process.env.DEMO_MODE === 'true')
    return res.json({ data: DEMO_EXECUTIONS, count: DEMO_EXECUTIONS.length });

  try {
    const ownership = await assertOwnership(req.params.id, req.user.id);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('executions')
      .select('id, status, trigger_type, started_at, finished_at, duration_ms, error_message')
      .eq('user_workflow_id', ownership.id)
      .order('started_at', { ascending: false })
      .limit(Number(req.query.limit) || 20);

    if (error) throw error;
    res.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.status === 403 ? err.message : 'Failed to load executions' });
  }
});

// ─────────────────────────────────────────────
// EXECUTION HELPERS
// ─────────────────────────────────────────────
async function markExecutionFailed(execId, message) {
  if (!execId) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('executions').update({
      status:        'failed',
      error_message: message,
      finished_at:   new Date().toISOString(),
    }).eq('id', execId);
  } catch (_) {}
}

// ─────────────────────────────────────────────
// WEBHOOK URL STORAGE  (uses ownership record, keyed by CloudPilot id)
// ─────────────────────────────────────────────
async function storeWebhookUrl(workflowId, userId, webhookUrl) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) return;

    const settings = { ...(existing.settings || {}), webhook_url: webhookUrl };
    await supabase.from('user_workflows')
      .update({ settings })
      .eq('id', workflowId)
      .eq('user_id', userId);
  } catch (err) {
    console.warn('Could not store webhook URL:', err.message);
  }
}

async function clearStoredWebhookUrl(workflowId, userId) {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      const settings = { ...(data.settings || {}) };
      delete settings.webhook_url;
      await supabase.from('user_workflows')
        .update({ settings })
        .eq('id', workflowId)
        .eq('user_id', userId);
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────
// WORKFLOW HELPERS
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

async function injectWebhookTrigger(engineRef, wf, n8nBase) {
  const nodes       = [...(wf.nodes || [])];
  const connections = { ...(wf.connections || {}) };
  const webhookPath = generateWebhookPath();
  const webhookUrl  = `${n8nBase}/webhook/${webhookPath}`;

  const minX = nodes.length > 0 ? Math.min(...nodes.map(n => n.position?.[0] ?? 250)) : 250;
  const avgY = nodes.length > 0
    ? nodes.reduce((s, n) => s + (n.position?.[1] ?? 300), 0) / nodes.length
    : 300;

  const webhookNode = {
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'onReceived', options: {} },
    name:        'CloudPilot Trigger',
    type:        'n8n-nodes-base.webhook',
    typeVersion: 1,
    position:    [minX - 220, Math.round(avgY)],
    webhookId:   webhookPath,
  };

  const newNodes = [webhookNode, ...nodes];

  // Find the entry node (one with no incoming connections)
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

  const updatedSettings = {
    ...(wf.settings || {}),
    saveManualExecutions:     true,
    saveDataSuccessExecution: 'all',
    saveDataErrorExecution:   'all',
    executionOrder:           (wf.settings || {}).executionOrder || 'v1',
  };

  if (wf.active) {
    await engineDeactivateWorkflow(engineRef).catch(() => {});
  }

  const updatedWf = await engineUpdateWorkflow(
    engineRef,
    buildFullBody(wf, { nodes: newNodes, connections, settings: updatedSettings })
  );

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
  ['active', 'tags', 'versionId', 'meta', 'id', 'createdAt', 'updatedAt'].forEach(k => delete body[k]);
  return body;
}

async function syncToggleToSupabase(workflowId, active, userId) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows')
      .update({ is_active: active })
      .eq('id', workflowId)
      .eq('user_id', userId);
  } catch (_) {}
}

export default router;