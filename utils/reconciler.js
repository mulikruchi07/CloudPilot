// utils/reconciler.js
import { engineGetExecution } from './engine.js';
import { getSupabaseAdmin } from './supabase.js';

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function reconcileStaleExecutions() {
  const supabase = getSupabaseAdmin();
  const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: stale } = await supabase
    .from('executions')
    .select('id, engine_execution_ref')
    .eq('status', 'running')
    .lt('started_at', staleTime)
    .not('engine_execution_ref', 'is', null)
    .limit(20);

  for (const exec of stale || []) {
    try {
      const engineData = await engineGetExecution(exec.engine_execution_ref);
      if (!engineData.finished) continue;

      await supabase.from('executions').update({
        status:      engineData.status === 'error' ? 'failed' : 'success',
        finished_at: engineData.stoppedAt,
        duration_ms: calcDuration(engineData.startedAt, engineData.stoppedAt),
      }).eq('id', exec.id);
    } catch (_) { /* Engine record may be gone — mark as unknown */ }
  }
}

// In server.js, start the reconciler:
// setInterval(reconcileStaleExecutions, 5 * 60 * 1000);
