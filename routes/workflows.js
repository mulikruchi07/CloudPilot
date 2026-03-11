<<<<<<< HEAD
// routes/workflows.js - CloudPilot (hardened v3.0)
=======
// routes/workflows.js - CloudPilot (hardened v2.1)
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
//
// Ownership model:
//   user_workflows table is the source of truth for who owns what.
//   Every mutating action (run / toggle / delete) MUST pass
<<<<<<< HEAD
//   assertOwnership(workflowId, userId) before touching the engine.
//   engine_workflow_ref is the internal n8n ID — never exposed in API responses.
=======
//   assertOwnership(workflowId, userId) before touching n8n.
//   n8n IDs are never exposed raw — always scoped to (user_id, workflow_id).
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
//
// Organisation scope:
//   org_id is threaded through all writes so multi-tenant org support
//   can be enabled later without schema changes.

import { Router } from 'express';
<<<<<<< HEAD
import {
  engineGetWorkflow,
  engineCreateWorkflow,
  engineDeleteWorkflow,
  engineActivateWorkflow,
  engineDeactivateWorkflow,
  engineUpdateWorkflow,
  engineListExecutions,
} from '../utils/engine.js';
=======
import { n8nRequest, getN8nHeaders } from '../utils/n8n.js';
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
import { getSupabaseAdmin } from '../utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DEMO_WORKFLOWS, DEMO_EXECUTIONS } from '../utils/demo.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// OWNERSHIP ENFORCEMENT
<<<<<<< HEAD
// Returns the full user_workflows row or throws 403.
// Call this before EVERY write that touches the engine.
=======
// Returns the user_workflows row or throws 403.
// Call this before EVERY write that touches n8n.
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
async function assertOwnership(workflowId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_workflows')
<<<<<<< HEAD
    .select('id, settings, org_id, engine_workflow_ref, is_active, install_status')
    .eq('id', workflowId)
=======
    .select('id, settings, org_id')
    .eq('workflow_id', String(workflowId))
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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

<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id
<<<<<<< HEAD
// Reads from Supabase — strips engine fields.
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const wf = DEMO_WORKFLOWS.find(w => String(w.id) === req.params.id);
    return wf ? res.json(wf) : res.status(404).json({ error: 'Not found' });
  }
<<<<<<< HEAD

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
=======
  try {
    // Ownership is advisory for reads — only enforce on writes
    res.json(await n8nRequest(`/workflows/${req.params.id}`));
  } catch (err) { res.status(502).json({ error: err.message }); }
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
});

// ─────────────────────────────────────────────
// POST /api/workflows  — create + register ownership
<<<<<<< HEAD
// Creates the workflow in the engine, stores only the ref.
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true')
    return res.json({ id: `demo-wf-${Date.now()}`, active: false, ...req.body });

=======
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ id: `demo-wf-${Date.now()}`, active: false, ...req.body });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  try {
    const payload = {
      name:        req.body.name || 'New Automation',
      nodes:       req.body.nodes || [],
      connections: req.body.connections || {},
      settings:    req.body.settings || {},
      staticData:  req.body.staticData || null,
      tags:        req.body.tags || [],
    };
<<<<<<< HEAD

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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
});

// ─────────────────────────────────────────────
// DELETE /api/workflows/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') return res.json({ success: true });
<<<<<<< HEAD

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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/toggle
// ─────────────────────────────────────────────
router.post('/:id/toggle', async (req, res) => {
<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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
<<<<<<< HEAD
      execution: { id: `exec-${Date.now()}`, status: 'running' },
    });
  }

  // ── Step 1: Verify ownership + get engine ref ──
  let ownership;
  try {
    ownership = await assertOwnership(workflowId, userId);
=======
      execution: { id: `exec-${Date.now()}`, workflow_id: workflowId, status: 'running' },
    });
  }

  const n8nBase = getN8nBaseUrl();

  // ── Step 1: Verify ownership ──
  let ownershipRow;
  try {
    ownershipRow = await assertOwnership(workflowId, userId);
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      await delay(1000);
      const r2 = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    },
  });
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id/history
<<<<<<< HEAD
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
=======
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

>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
async function storeWebhookUrl(workflowId, userId, webhookUrl) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('user_workflows')
      .select('id, settings')
<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
}

async function clearStoredWebhookUrl(workflowId, userId) {
  try {
<<<<<<< HEAD
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .maybeSingle();

=======
    const supabase  = getSupabaseAdmin();
    const { data }  = await supabase
      .from('user_workflows')
      .select('id, settings')
      .eq('workflow_id', String(workflowId))
      .eq('user_id', userId)
      .maybeSingle();
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    if (data) {
      const settings = { ...(data.settings || {}) };
      delete settings.webhook_url;
      await supabase.from('user_workflows')
        .update({ settings })
<<<<<<< HEAD
        .eq('id', workflowId)
=======
        .eq('workflow_id', String(workflowId))
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
        .eq('user_id', userId);
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────
<<<<<<< HEAD
// WORKFLOW HELPERS
=======
// SHARED HELPERS
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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

<<<<<<< HEAD
async function injectWebhookTrigger(engineRef, wf, n8nBase) {
=======
async function injectWebhookTrigger(workflowId, wf, n8nBase) {
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  const nodes       = [...(wf.nodes || [])];
  const connections = { ...(wf.connections || {}) };
  const webhookPath = generateWebhookPath();
  const webhookUrl  = `${n8nBase}/webhook/${webhookPath}`;

  const minX = nodes.length > 0 ? Math.min(...nodes.map(n => n.position?.[0] ?? 250)) : 250;
  const avgY = nodes.length > 0
<<<<<<< HEAD
    ? nodes.reduce((s, n) => s + (n.position?.[1] ?? 300), 0) / nodes.length
    : 300;
=======
    ? nodes.reduce((s, n) => s + (n.position?.[1] ?? 300), 0) / nodes.length : 300;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

  const webhookNode = {
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'onReceived', options: {} },
    name:        'CloudPilot Trigger',
    type:        'n8n-nodes-base.webhook',
    typeVersion: 1,
    position:    [minX - 220, Math.round(avgY)],
    webhookId:   webhookPath,
  };

  const newNodes = [webhookNode, ...nodes];
<<<<<<< HEAD

  // Find the entry node (one with no incoming connections)
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  const receivingNodes = new Set();
  for (const src of Object.values(connections)) {
    for (const outputs of Object.values(src)) {
      for (const branch of (Array.isArray(outputs) ? outputs : [])) {
        if (Array.isArray(branch)) for (const conn of branch) receivingNodes.add(conn.node);
      }
    }
  }
  const entryNode = nodes.find(n => !receivingNodes.has(n.name));
<<<<<<< HEAD
  if (entryNode) {
    connections['CloudPilot Trigger'] = { main: [[{ node: entryNode.name, type: 'main', index: 0 }]] };
  }
=======
  if (entryNode) connections['CloudPilot Trigger'] = { main: [[{ node: entryNode.name, type: 'main', index: 0 }]] };
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

  const updatedSettings = {
    ...(wf.settings || {}),
    saveManualExecutions:     true,
    saveDataSuccessExecution: 'all',
    saveDataErrorExecution:   'all',
    executionOrder:           (wf.settings || {}).executionOrder || 'v1',
  };

  if (wf.active) {
<<<<<<< HEAD
    await engineDeactivateWorkflow(engineRef).catch(() => {});
  }

  const updatedWf = await engineUpdateWorkflow(
    engineRef,
    buildFullBody(wf, { nodes: newNodes, connections, settings: updatedSettings })
  );

=======
    try { await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST'); } catch (_) {}
  }

  const updatedWf = await putWorkflow(workflowId, buildFullBody(wf, {
    nodes: newNodes, connections, settings: updatedSettings,
  }));
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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
<<<<<<< HEAD
  ['active', 'tags', 'versionId', 'meta', 'id', 'createdAt', 'updatedAt'].forEach(k => delete body[k]);
  return body;
}

=======
  ['active','tags','versionId','meta','id','createdAt','updatedAt'].forEach(k => delete body[k]);
  return body;
}

async function putWorkflow(workflowId, body) {
  return n8nRequest(`/workflows/${workflowId}`, 'PUT', body);
}

>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
async function syncToggleToSupabase(workflowId, active, userId) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows')
      .update({ is_active: active })
<<<<<<< HEAD
      .eq('id', workflowId)
=======
      .eq('workflow_id', String(workflowId))
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      .eq('user_id', userId);
  } catch (_) {}
}

<<<<<<< HEAD
export default router;
=======
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export default router;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
