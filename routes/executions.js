// routes/executions.js - Execution history + node-by-node timeline
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
<<<<<<< HEAD
import { engineGetExecution, engineDeleteExecution } from '../utils/engine.js';
=======
import { n8nRequest } from '../utils/n8n.js';
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
import { DEMO_EXECUTIONS, DEMO_TIMELINE } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────
// GET /api/executions - List user's executions
<<<<<<< HEAD
// Reads from Supabase — no engine call.
// SELECT list is explicit to prevent engine fields leaking.
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ executions: DEMO_EXECUTIONS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('executions')
<<<<<<< HEAD
      .select('id, status, trigger_type, started_at, finished_at, duration_ms, error_message, user_workflow_id')
=======
      .select('*')
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ executions: data });
  } catch (err) {
<<<<<<< HEAD
    res.status(500).json({ error: 'Failed to load executions' });
=======
    res.status(500).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// GET /api/executions/:id - Single execution
<<<<<<< HEAD
// Reads from Supabase first. engine_execution_ref is stripped from response.
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    const exec = DEMO_EXECUTIONS.find(e => e.id === req.params.id);
    return exec ? res.json(exec) : res.status(404).json({ error: 'Not found' });
  }

  try {
<<<<<<< HEAD
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
=======
    const data = await n8nRequest(`/executions/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
<<<<<<< HEAD
// GET /api/executions/:id/timeline - Node-by-node breakdown
// Looks up the engine_execution_ref from Supabase,
// then fetches node-level data from the engine.
=======
// GET /api/executions/:id/timeline - Node-by-node
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.get('/:id/timeline', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({
<<<<<<< HEAD
      timeline:     DEMO_TIMELINE,
      status:       'success',
=======
      timeline: DEMO_TIMELINE,
      status: 'success',
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      execution_id: req.params.id,
    });
  }

  try {
    const supabase = getSupabaseAdmin();

<<<<<<< HEAD
    // Load our execution record — enforce ownership
    const { data: execRecord, error: recErr } = await supabase
      .from('executions')
      .select('id, status, started_at, finished_at, engine_execution_ref')
=======
    // Find the n8n_execution_id from our DB
    const { data: execRecord } = await supabase
      .from('executions')
      .select('*')
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      const finishTime = startTime ? new Date(startTime.getTime() + execTime) : null;

      let outputPreview = null;
      try {
        const outputItems = run.data?.main?.[0];
<<<<<<< HEAD
        if (outputItems?.length > 0) {
=======
        if (outputItems && outputItems.length > 0) {
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          outputPreview = JSON.stringify(outputItems[0]?.json || {}, null, 2).slice(0, 500);
        }
      } catch (_) {}

      timeline.push({
<<<<<<< HEAD
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
=======
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
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// DELETE /api/executions/:id
<<<<<<< HEAD
// Verifies ownership before touching the engine.
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }

  try {
<<<<<<< HEAD
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

=======
    await n8nRequest(`/executions/${req.params.id}`, 'DELETE');
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
export default router;