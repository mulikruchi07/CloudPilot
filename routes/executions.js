// routes/executions.js - Execution history + node-by-node timeline
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { engineGetExecution, engineDeleteExecution } from '../utils/engine.js';
import { DEMO_EXECUTIONS, DEMO_TIMELINE } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// GET /api/executions - List user's executions
// Reads from Supabase — no engine call.
// SELECT list is explicit to prevent engine fields leaking.
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ executions: DEMO_EXECUTIONS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('executions')
      .select('id, status, trigger_type, started_at, finished_at, duration_ms, error_message, user_workflow_id')
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ executions: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load executions' });
  }
});

// ─────────────────────────────────────────────
// GET /api/executions/:id - Single execution
// Reads from Supabase first. engine_execution_ref is stripped from response.
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const exec = DEMO_EXECUTIONS.find(e => e.id === req.params.id);
    return exec ? res.json(exec) : res.status(404).json({ error: 'Not found' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('executions')
      .select('id, status, trigger_type, started_at, finished_at, duration_ms, error_message, user_workflow_id, engine_execution_ref')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Execution not found' });

    // Strip engine field before sending to client
    const { engine_execution_ref, ...safe } = data;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load execution' });
  }
});

// ─────────────────────────────────────────────
// GET /api/executions/:id/timeline - Node-by-node breakdown
// Looks up the engine_execution_ref from Supabase,
// then fetches node-level data from the engine.
// ─────────────────────────────────────────────
router.get('/:id/timeline', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({
      timeline:     DEMO_TIMELINE,
      status:       'success',
      execution_id: req.params.id,
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Load our execution record — enforce ownership
    const { data: execRecord, error: recErr } = await supabase
      .from('executions')
      .select('id, status, started_at, finished_at, engine_execution_ref')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (recErr || !execRecord) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // If there's no engine ref (e.g. run failed before dispatch), return what we have
    if (!execRecord.engine_execution_ref) {
      return res.json({
        timeline:     [],
        status:       execRecord.status || 'unknown',
        execution_id: req.params.id,
        started_at:   execRecord.started_at,
        finished_at:  execRecord.finished_at,
      });
    }

    // Fetch full execution data from the engine
    const execution = await engineGetExecution(execRecord.engine_execution_ref);

    // ── Build node-by-node timeline ──
    const timeline = [];
    const runData  = execution?.data?.resultData?.runData || {};

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      const run        = nodeRuns?.[0] || {};
      const startTime  = run.startTime ? new Date(run.startTime) : null;
      const execTime   = run.executionTime || 0;
      const finishTime = startTime ? new Date(startTime.getTime() + execTime) : null;

      let outputPreview = null;
      try {
        const outputItems = run.data?.main?.[0];
        if (outputItems?.length > 0) {
          outputPreview = JSON.stringify(outputItems[0]?.json || {}, null, 2).slice(0, 500);
        }
      } catch (_) {}

      timeline.push({
        node_name:      nodeName,
        node_type:      run.source?.[0]?.previousNode ? 'action' : 'trigger',
        status:         run.error ? 'failed' : 'success',
        started_at:     startTime?.toISOString()  || null,
        finished_at:    finishTime?.toISOString() || null,
        duration_ms:    execTime,
        output_preview: outputPreview,
        error:          run.error?.message || null,
      });
    }

    // ── Update execution record with final state ──
    const finalStatus = execution.finished
      ? (execution.status === 'error' ? 'failed' : 'success')
      : 'running';

    const startedAt  = execution.startedAt  || null;
    const finishedAt = execution.stoppedAt  || null;
    const durationMs = startedAt && finishedAt
      ? new Date(finishedAt).getTime() - new Date(startedAt).getTime()
      : null;

    supabase.from('executions').update({
      status:         finalStatus,
      finished_at:    finishedAt,
      duration_ms:    durationMs,
      execution_data: scrubExecutionData(execution.data),
    }).eq('id', req.params.id).catch(() => {});

    res.json({
      timeline,
      status:       finalStatus,
      execution_id: req.params.id,   // CloudPilot ID, not engine ID
      started_at:   startedAt,
      finished_at:  finishedAt,
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not load execution details. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/executions/:id
// Verifies ownership before touching the engine.
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('executions')
      .select('engine_execution_ref')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !data) return res.status(404).json({ error: 'Execution not found' });

    // Remove from engine if we have the ref (non-fatal)
    if (data.engine_execution_ref) {
      await engineDeleteExecution(data.engine_execution_ref).catch(() => {});
    }

    await supabase.from('executions').delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete execution' });
  }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Strip anything from execution_data that references engine internals
// before persisting to Supabase.
function scrubExecutionData(data) {
  if (!data) return null;
  try {
    const clean = JSON.parse(JSON.stringify(data));
    // Remove fields that reference engine-internal node IDs or run IDs
    delete clean?.startData?.destinationNode;
    return clean;
  } catch (_) {
    return null;
  }
}

export default router;