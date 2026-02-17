// routes/executions.js - Execution history + node-by-node timeline
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { n8nRequest } from '../utils/n8n.js';
import { DEMO_EXECUTIONS, DEMO_TIMELINE } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// GET /api/executions - List user's executions
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ executions: DEMO_EXECUTIONS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('executions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ executions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/executions/:id - Single execution
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const exec = DEMO_EXECUTIONS.find(e => e.id === req.params.id);
    return exec ? res.json(exec) : res.status(404).json({ error: 'Not found' });
  }

  try {
    const data = await n8nRequest(`/executions/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/executions/:id/timeline - Node-by-node
// ─────────────────────────────────────────────
router.get('/:id/timeline', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({
      timeline: DEMO_TIMELINE,
      status: 'success',
      execution_id: req.params.id,
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find the n8n_execution_id from our DB
    const { data: execRecord } = await supabase
      .from('executions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    const n8nId = execRecord?.n8n_execution_id || req.params.id;

    // Fetch from n8n with full execution data
    const execution = await n8nRequest(`/executions/${n8nId}?includeData=true`);

    // Parse node-by-node timeline
    const timeline = [];

    const runData = execution?.data?.resultData?.runData || {};

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      const run = nodeRuns?.[0] || {};
      const startTime = run.startTime ? new Date(run.startTime) : null;
      const execTime = run.executionTime || 0;
      const finishTime = startTime ? new Date(startTime.getTime() + execTime) : null;

      let outputPreview = null;
      try {
        const outputItems = run.data?.main?.[0];
        if (outputItems && outputItems.length > 0) {
          outputPreview = JSON.stringify(outputItems[0]?.json || {}, null, 2).slice(0, 500);
        }
      } catch (_) {}

      timeline.push({
        node_name: nodeName,
        node_type: run.source?.[0]?.previousNode ? 'action' : 'trigger',
        status: run.error ? 'failed' : 'success',
        started_at: startTime?.toISOString() || null,
        finished_at: finishTime?.toISOString() || null,
        duration_ms: execTime,
        output_preview: outputPreview,
        error: run.error?.message || null,
      });
    }

    // Update execution status in DB
    try {
      const status = execution.finished
        ? (execution.status === 'error' ? 'error' : 'success')
        : 'running';

      await supabase.from('executions').upsert({
        n8n_execution_id: String(n8nId),
        user_id: req.user.id,
        workflow_id: String(execution.workflowId || ''),
        status,
        finished_at: execution.stoppedAt || null,
        execution_data: execution.data || null,
        duration_ms: execution.data?.startData ? null : null,
      }, { onConflict: 'n8n_execution_id' });
    } catch (_) { /* Non-fatal */ }

    res.json({
      timeline,
      status: execution.finished ? (execution.status || 'success') : 'running',
      execution_id: n8nId,
      workflow_id: execution.workflowId,
      started_at: execution.startedAt,
      finished_at: execution.stoppedAt,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/executions/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }

  try {
    await n8nRequest(`/executions/${req.params.id}`, 'DELETE');
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;