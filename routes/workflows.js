// routes/workflows.js

// ▶️ Start Workflow
export async function startWorkflow(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get workflow
    const { data: workflow, error } = await supabase
      .from('user_workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    // Activate in n8n
    await fetch(`${N8N_URL}/api/v1/workflows/${workflow.n8n_workflow_id}/activate`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY
      }
    });

    // Update database
    await supabase
      .from('user_workflows')
      .update({ is_active: true })
      .eq('id', id);

    res.json({ success: true, message: 'Workflow started' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ⏸️ Stop Workflow
export async function stopWorkflow(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: workflow } = await supabase
      .from('user_workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    await fetch(`${N8N_URL}/api/v1/workflows/${workflow.n8n_workflow_id}/deactivate`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY
      }
    });

    await supabase
      .from('user_workflows')
      .update({ is_active: false })
      .eq('id', id);

    res.json({ success: true, message: 'Workflow stopped' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ▶️ Run Workflow Manually
export async function runWorkflow(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: workflow } = await supabase
      .from('user_workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    // Trigger execution in n8n
    const response = await fetch(`${N8N_URL}/api/v1/workflows/${workflow.n8n_workflow_id}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(req.body || {})
    });

    const execution = await response.json();

    // Store execution in database
    await supabase.from('executions').insert({
      user_workflow_id: workflow.id,
      n8n_execution_id: execution.id,
      status: 'running',
      started_at: new Date().toISOString()
    });

    res.json({ success: true, execution_id: execution.id });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}