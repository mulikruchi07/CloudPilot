// routes/workflows.js - Full workflow CRUD + run/toggle
import { Router } from 'express';
import { n8nRequest } from '../utils/n8n.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { DEMO_WORKFLOWS, DEMO_EXECUTIONS } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// GET /api/workflows - List all workflows
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
// GET /api/workflows/:id - Single workflow
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const wf = DEMO_WORKFLOWS.find(w => w.id === req.params.id);
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
// POST /api/workflows - Create workflow
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
// PATCH /api/workflows/:id - Update workflow
// ─────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true, id: req.params.id, ...req.body });
  }

  try {
    const data = await n8nRequest(`/workflows/${req.params.id}`, 'PATCH', req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/workflows/:id - Delete workflow
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
    } catch (_) { /* Non-fatal */ }

    res.json({ success: true, message: 'Workflow deleted' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/workflows/:id/run - Execute workflow
//
// n8n endpoint map (tried in order):
//  Public API  ≥1.0:  POST /api/v1/workflows/:id/run          ← primary
//  Public API  ≥1.0:  POST /api/v1/executions { workflowId }  ← fallback A
//  Legacy REST:        POST /rest/workflows/:id/run             ← fallback B
//  Legacy REST:        POST /rest/workflows/:id/execute         ← fallback C
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

  const runData = req.body || {};
  let execution = null;
  let lastError = null;

  // Strategy 1: POST /workflows/:id/run  (works on most n8n public API versions)
  try {
    execution = await n8nRequest(`/workflows/${workflowId}/run`, 'POST', runData);
    console.log(`✅ Ran workflow via /workflows/${workflowId}/run`);
  } catch (err) {
    lastError = err;
    console.log(`   ↳ /workflows/:id/run failed: ${err.message}`);
  }

  // Strategy 2: POST /executions { workflowId }  (newer public API)
  if (!execution) {
    try {
      execution = await n8nRequest('/executions', 'POST', { workflowId, ...runData });
      console.log(`✅ Ran workflow via /executions`);
    } catch (err) {
      lastError = err;
      console.log(`   ↳ /executions failed: ${err.message}`);
    }
  }

  // Strategy 3: POST /workflows/:id/execute  (some versions)
  if (!execution) {
    try {
      execution = await n8nRequest(`/workflows/${workflowId}/execute`, 'POST', runData);
      console.log(`✅ Ran workflow via /workflows/${workflowId}/execute`);
    } catch (err) {
      lastError = err;
      console.log(`   ↳ /workflows/:id/execute failed: ${err.message}`);
    }
  }

  if (!execution) {
    console.error(`❌ All run strategies failed for workflow ${workflowId}`);
    return res.status(502).json({
      error: lastError?.message || 'All execution strategies failed',
      hint: 'Make sure the workflow has a Manual Trigger node and n8n is running',
    });
  }

  // Log to Supabase (non-fatal)
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
// POST /api/workflows/:id/toggle - Activate / Deactivate
//
// Public API ≥1.0: POST /workflows/:id/activate  or  /deactivate
// Fallback:        PATCH /workflows/:id  with { active: true/false }
// ─────────────────────────────────────────────
router.post('/:id/toggle', async (req, res) => {
  const { active } = req.body;
  const workflowId = req.params.id;

  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true, id: workflowId, active });
  }

  let data = null;
  let lastError = null;

  // Strategy 1: dedicated activate/deactivate endpoints
  const action = active ? 'activate' : 'deactivate';
  try {
    data = await n8nRequest(`/workflows/${workflowId}/${action}`, 'POST');
    console.log(`✅ Toggled workflow via /workflows/${workflowId}/${action}`);
  } catch (err) {
    lastError = err;
    console.log(`   ↳ /${action} endpoint failed: ${err.message}`);
  }

  // Strategy 2: PATCH active field
  if (!data) {
    try {
      const workflow = await n8nRequest(`/workflows/${workflowId}`);
      data = await n8nRequest(`/workflows/${workflowId}`, 'PATCH', {
        ...workflow,
        active,
      });
      console.log(`✅ Toggled workflow via PATCH active=${active}`);
    } catch (err) {
      lastError = err;
      console.log(`   ↳ PATCH active failed: ${err.message}`);
    }
  }

  if (!data) {
    return res.status(502).json({ error: lastError?.message || 'Toggle failed' });
  }

  // Update Supabase (non-fatal)
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('user_workflows')
      .update({ is_active: active })
      .eq('workflow_id', workflowId)
      .eq('user_id', req.user.id);
  } catch (_) {}

  res.json({ success: true, active, data });
});

// ─────────────────────────────────────────────
// GET /api/workflows/:id/executions  (+ /history alias)
// ─────────────────────────────────────────────
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

export default router;