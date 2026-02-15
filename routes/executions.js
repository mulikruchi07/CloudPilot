// routes/executions.js

// 📊 Get execution timeline
export async function getExecutionTimeline(req, res) {
  try {
    const { execution_id } = req.params;
    const userId = req.user.id;

    // Get execution from n8n
    const response = await fetch(`${N8N_URL}/api/v1/executions/${execution_id}`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY
      }
    });

    const execution = await response.json();

    // Parse node-by-node execution
    const timeline = [];
    if (execution.data && execution.data.resultData) {
      const runData = execution.data.resultData.runData;

      for (const [nodeName, nodeData] of Object.entries(runData)) {
        timeline.push({
          node_name: nodeName,
          node_type: nodeData[0]?.source?.[0]?.previousNode || 'trigger',
          status: nodeData[0]?.error ? 'failed' : 'success',
          started_at: nodeData[0]?.startTime,
          finished_at: nodeData[0]?.executionTime ?
            new Date(new Date(nodeData[0].startTime).getTime() + nodeData[0].executionTime) : null,
          output_data: nodeData[0]?.data,
          error: nodeData[0]?.error?.message
        });
      }
    }

    // Update execution status in database
    await supabase
      .from('executions')
      .update({
        status: execution.finished ? 'success' : 'running',
        finished_at: execution.stoppedAt,
        execution_data: execution.data
      })
      .eq('n8n_execution_id', execution_id);

    res.json({ timeline, status: execution.finished ? 'complete' : 'running' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}