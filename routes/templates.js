// routes/templates.js - Template marketplace + import pipeline
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
<<<<<<< HEAD
import { engineCreateWorkflow, engineCreateCredential } from '../utils/engine.js';
=======
import { n8nRequest } from '../utils/n8n.js';
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
import { getDecryptedCredential } from './credentials.js';
import { DEMO_TEMPLATES } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

<<<<<<< HEAD
const ENGINE_CRED_TYPE_MAP = {
  aws:    'aws',
  gcp:    'googleApi',
  azure:  'microsoftAzureOAuth2Api',
  github: 'githubApi',
  slack:  'slackApi',
  openai: 'openAiApi',
  smtp:   'smtp',
  http:   'httpBasicAuth',
=======
const N8N_CRED_TYPE_MAP = {
  aws: 'aws',
  gcp: 'googleApi',
  azure: 'microsoftAzureOAuth2Api',
  github: 'githubApi',
  slack: 'slackApi',
  openai: 'openAiApi',
  smtp: 'smtp',
  http: 'httpBasicAuth',
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
};

// ─────────────────────────────────────────────
// GET /api/templates - List templates
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ templates: DEMO_TEMPLATES });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workflow_templates')
      .select('id, template_id, name, description, category, required_credentials, tags, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ templates: data || [] });
  } catch (err) {
<<<<<<< HEAD
    res.status(500).json({ error: 'Failed to load templates' });
=======
    res.status(500).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// POST /api/templates/import
// ─────────────────────────────────────────────
router.post('/import', async (req, res) => {
  const { template_id, workflow_name, credential_mappings = {} } = req.body;

  if (!template_id) {
    return res.status(400).json({ error: 'template_id is required' });
  }

  // ── Demo mode ──
  if (process.env.DEMO_MODE === 'true') {
    const template = DEMO_TEMPLATES.find(
      t => t.id === template_id || t.template_id === template_id
    );
    return res.json({
      success: true,
      workflow: {
<<<<<<< HEAD
        id:   `demo-wf-${Date.now()}`,
=======
        id: `demo-wf-${Date.now()}`,
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
        name: workflow_name || template?.name || 'Imported Workflow',
      },
    });
  }

<<<<<<< HEAD
  const userId   = req.user.id;
  const orgId    = req.user.user_metadata?.org_id || userId;
  const supabase = getSupabaseAdmin();

  // ── 1. Fetch template ──
  let template = null;
  try {
=======
  const userId = req.user.id;
  const supabase = getSupabaseAdmin();

  try {
    // ── 1. Fetch template ──
    let template = null;

>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const { data: byId } = await supabase
      .from('workflow_templates')
      .select('*')
      .eq('id', template_id)
      .maybeSingle();

    if (byId) {
      template = byId;
    } else {
      const { data: byTemplateId, error: tErr } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('template_id', template_id)
        .maybeSingle();

      if (tErr) throw new Error(`Template lookup failed: ${tErr.message}`);
      template = byTemplateId;
    }

<<<<<<< HEAD
    if (!template) throw new Error(`Template not found: ${template_id}`);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }

  // ── 2. Pre-register the workflow row with install_status = 'installing' ──
  // This gives us a CloudPilot ID immediately and tracks partial failures.
  let pendingWorkflowId;
  try {
    const { data: pending, error: pendingErr } = await supabase
      .from('user_workflows')
      .insert({
        user_id:        userId,
        org_id:         orgId,
        workflow_name:  workflow_name || template.name,
        template_id:    template.id,
        is_active:      false,
        install_status: 'installing',
        settings:       {},
      })
      .select('id')
      .single();

    if (pendingErr) throw pendingErr;
    pendingWorkflowId = pending.id;
  } catch (err) {
    return res.status(500).json({ error: 'Failed to initialise workflow record' });
  }

  try {
    // ── 3. Decrypt credentials ──
=======
    if (!template) {
      throw new Error(`Template not found: ${template_id}`);
    }

    // ── 2. Decrypt credentials (skip if none mapped) ──
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const decryptedCreds = {};
    for (const [credType, credId] of Object.entries(credential_mappings)) {
      if (!credId) continue;
      try {
        decryptedCreds[credType] = await getDecryptedCredential(credId, userId);
      } catch (err) {
        console.warn(`Could not decrypt credential ${credType}:`, err.message);
      }
    }

<<<<<<< HEAD
    // ── 4. Inject credentials into engine + store engine refs ──
    const engineCredIds = {};
    for (const [credType, credInfo] of Object.entries(decryptedCreds)) {
      try {
        const engineType = ENGINE_CRED_TYPE_MAP[credType] || credType;
        const engineRef  = await engineCreateCredential(
          `${credInfo.credential_name}_${userId.slice(0, 8)}_${Date.now()}`,
          engineType,
          credInfo.data
        );
        engineCredIds[credType] = { id: engineRef, name: credInfo.credential_name };

        // Persist the engine ref so we can update/delete it later
        await supabase.from('user_credentials')
          .update({
            engine_credential_ref: engineRef,
            last_injected_at:      new Date().toISOString(),
          })
          .eq('id', credInfo.id)
          .catch(() => {}); // non-fatal if column doesn't exist yet
      } catch (err) {
        console.warn(`Engine credential creation failed for ${credType}:`, err.message);
      }
    }

    // ── 5. Sanitize + clone workflow JSON ──
    const rawJson      = template.template_json || {};
    const workflowJson = sanitizeWorkflowForImport(rawJson, workflow_name || template.name);

    // Inject engine credential IDs into nodes
    if (workflowJson.nodes && Object.keys(engineCredIds).length > 0) {
      workflowJson.nodes = workflowJson.nodes.map(node => {
        if (node.credentials) {
          for (const credKey of Object.keys(node.credentials)) {
            const match = Object.keys(engineCredIds).find(t =>
              credKey.toLowerCase().includes(t.toLowerCase()) ||
              t.toLowerCase().includes(credKey.toLowerCase())
            );
            if (match) node.credentials[credKey] = engineCredIds[match];
=======
    // ── 3. Create credentials in n8n ──
    const n8nCredIds = {};
    for (const [credType, credInfo] of Object.entries(decryptedCreds)) {
      try {
        const n8nType = N8N_CRED_TYPE_MAP[credType] || credType;
        const n8nCred = await n8nRequest('/credentials', 'POST', {
          name: `${credInfo.credential_name}_${Date.now()}`,
          type: n8nType,
          data: credInfo.data,
        });
        n8nCredIds[credType] = { id: n8nCred.id, name: credInfo.credential_name };
      } catch (err) {
        console.warn(`n8n credential creation failed for ${credType}:`, err.message);
      }
    }

    // ── 4. Sanitize + clone workflow JSON ──
    const rawJson = template.template_json || {};
    const workflowJson = sanitizeWorkflowForImport(rawJson, workflow_name || template.name);

    // Inject credential IDs into nodes
    if (workflowJson.nodes && Object.keys(n8nCredIds).length > 0) {
      workflowJson.nodes = workflowJson.nodes.map(node => {
        if (node.credentials) {
          for (const credKey of Object.keys(node.credentials)) {
            const match = Object.keys(n8nCredIds).find(t =>
              credKey.toLowerCase().includes(t.toLowerCase()) ||
              t.toLowerCase().includes(credKey.toLowerCase())
            );
            if (match) {
              node.credentials[credKey] = n8nCredIds[match];
            }
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          }
        }
        return node;
      });
    }

<<<<<<< HEAD
    // ── 6. Create workflow in engine ──
    const { engineRef: engineWorkflowRef, raw: engineRaw } = await engineCreateWorkflow(workflowJson);

    // Validate the ref returned by the engine is a numeric string.
    // n8n always returns a numeric ID — if it isn't, something went wrong upstream.
    if (!engineWorkflowRef || !/^\d+$/.test(String(engineWorkflowRef).trim())) {
      throw new Error(
        `Engine returned an invalid workflow ID: "${engineWorkflowRef}". ` +
        'Expected a numeric string. Check n8n API compatibility.'
      );
    }

    // Resolve the final display name — never fall back to a UUID.
    const resolvedName = workflow_name?.trim() || template.name?.trim() || 'Imported Workflow';

    // ── 7. Update user_workflows with engine ref + installed status ──
    const { error: updateErr } = await supabase.from('user_workflows').update({
      engine_workflow_ref: engineWorkflowRef,   // numeric string e.g. '42'
      workflow_name:       resolvedName,         // human-readable — never a UUID
      install_status:      'installed',
    }).eq('id', pendingWorkflowId);

    if (updateErr) {
      // Engine workflow was created but we couldn't persist the ref — this is fatal
      // because we'd lose the ability to manage it. Log the engine ID for manual recovery.
      console.error(
        `[install] CRITICAL: engine workflow created (ref=${engineWorkflowRef}) ` +
        `but Supabase update failed for pendingWorkflowId=${pendingWorkflowId}:`,
        updateErr.message
      );
      throw new Error(`Failed to save workflow reference: ${updateErr.message}`);
    }

    // ── 8. Audit log (non-fatal) ──
    supabase.from('audit_logs').insert({
      user_id:       userId,
      action:        'template_imported',
      resource_type: 'workflow',
      resource_id:   pendingWorkflowId,
      metadata:      { template_id, workflow_name },
      // No engine IDs in audit log
    }).catch(() => {});

    // Return only CloudPilot IDs — no engine IDs exposed
    res.json({
      success:  true,
      workflow: {
        id:   pendingWorkflowId,
        name: resolvedName,
      },
=======
    // ── 5. Create workflow in n8n ──
    const n8nWorkflow = await n8nRequest('/workflows', 'POST', workflowJson);

    if (!n8nWorkflow?.id) {
      throw new Error('n8n did not return a workflow ID after creation');
    }

    // ── 6. Save to user_workflows ──
    const { data: userWorkflow, error: uwErr } = await supabase
      .from('user_workflows')
      .insert({
        user_id: userId,
        workflow_id: String(n8nWorkflow.id),
        workflow_name: workflow_name || template.name,
        is_active: false,
        template_id: template.template_id,
        credentials: n8nCredIds,
        settings: {},
      })
      .select()
      .single();

    if (uwErr) throw new Error(`DB save failed: ${uwErr.message}`);

    // ── 7. Audit log (non-fatal) ──
    supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'template_imported',
      resource_type: 'workflow',
      resource_id: userWorkflow.id,
      metadata: { template_id, workflow_name, n8n_workflow_id: n8nWorkflow.id },
    }).catch(() => {});

    res.json({
      success: true,
      workflow: {
        id: userWorkflow.id,
        n8n_id: n8nWorkflow.id,
        name: userWorkflow.workflow_name,
      },
      // Tell the frontend if a manual trigger was injected
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      manual_trigger_injected: workflowJson._manualTriggerInjected || false,
    });

  } catch (err) {
    console.error('Template import error:', err);
<<<<<<< HEAD

    // Mark the pending row as failed so the UI can show the right state
    await supabase.from('user_workflows').update({
      install_status: 'failed',
      install_error:  err.message,
    }).eq('id', pendingWorkflowId).catch(() => {});

    res.status(500).json({ error: 'Template import failed. Please try again.' });
=======
    res.status(500).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
<<<<<<< HEAD
// Sanitize workflow JSON for import into engine.
//
//  • Injects a Manual Trigger node if none exists.
//  • Strips existing node IDs so the engine assigns fresh ones.
//  • Wires the trigger to the first unconnected entry node.
=======
// Sanitize workflow JSON for import into n8n.
//
// Key additions vs old version:
//  • Injects a Manual Trigger node if none exists — this is REQUIRED
//    for the "Run" button to work via the n8n API. Without it n8n
//    returns 404 on POST /workflows/:id/run.
//  • Ensures every node has a unique `id` field (UUID v4) — n8n
//    rejects nodes without IDs in newer versions.
//  • Wires the manual trigger into the first non-trigger node
//    automatically so the workflow graph is valid.
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
function sanitizeWorkflowForImport(raw, name) {
  const wf = JSON.parse(JSON.stringify(raw)); // deep clone

  const clean = {
<<<<<<< HEAD
    name:        name || wf.name || 'Imported Workflow',
    nodes:       wf.nodes || [],
    connections: wf.connections || {},
    settings:    wf.settings || { executionOrder: 'v1' },
    staticData:  wf.staticData || null,
    tags:        wf.tags || [],
  };

  // Strip node IDs — engine assigns fresh ones on creation
  clean.nodes = clean.nodes.map(node => {
    const n = { ...node };
    delete n.id;
=======
    name: name || wf.name || 'Imported Workflow',
    nodes: wf.nodes || [],
    connections: wf.connections || {},
    settings: wf.settings || { executionOrder: 'v1' },
    staticData: wf.staticData || null,
    tags: wf.tags || [],
  };

  // Assign new IDs to all nodes (avoids conflicts on reimport)
  clean.nodes = clean.nodes.map(node => {
    const n = { ...node };
    delete n.id; // n8n will assign new IDs
    // Ensure position exists
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    if (!n.position) n.position = [250, 300];
    return n;
  });

  // ── Check if a trigger node already exists ──
  const triggerTypes = [
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.start',
    '@n8n/n8n-nodes-langchain.manualChatTrigger',
  ];

  const hasManualTrigger = clean.nodes.some(n =>
    triggerTypes.includes(n.type) ||
    (n.type || '').toLowerCase().includes('manualtrigger') ||
    (n.name || '').toLowerCase() === 'start' ||
    (n.name || '').toLowerCase().includes('manual trigger')
  );

<<<<<<< HEAD
  if (!hasManualTrigger) {
    const manualTrigger = {
      parameters:  {},
      name:        'Manual Trigger',
      type:        'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position:    [40, 300],
    };

=======
  let manualTriggerNodeName = null;

  if (!hasManualTrigger) {
    // Inject a Manual Trigger node at the top-left
    const manualTrigger = {
      parameters: {},
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [40, 300],
    };

    // Find the leftmost existing node to position trigger before it
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    if (clean.nodes.length > 0) {
      const minX = Math.min(...clean.nodes.map(n => (n.position?.[0] || 250)));
      manualTrigger.position = [minX - 200, 300];
    }

    clean.nodes.unshift(manualTrigger);
<<<<<<< HEAD
    clean._manualTriggerInjected = true;

    // Wire the trigger to the first node with no incoming connections
=======
    manualTriggerNodeName = 'Manual Trigger';
    clean._manualTriggerInjected = true;

    // Wire Manual Trigger to the first non-trigger node
    // Find the node that currently has no incoming connections
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const connectedNodes = new Set();
    for (const conns of Object.values(clean.connections)) {
      for (const outputs of Object.values(conns)) {
        for (const branch of outputs) {
          if (Array.isArray(branch)) {
<<<<<<< HEAD
            for (const conn of branch) connectedNodes.add(conn.node);
=======
            for (const conn of branch) {
              connectedNodes.add(conn.node);
            }
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          }
        }
      }
    }

<<<<<<< HEAD
=======
    // The first node that nothing connects to is the entry point
    // (excluding our newly added trigger)
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const entryNode = clean.nodes.find(n =>
      n.name !== 'Manual Trigger' && !connectedNodes.has(n.name)
    );

    if (entryNode) {
      clean.connections['Manual Trigger'] = {
        main: [[{ node: entryNode.name, type: 'main', index: 0 }]],
      };
    }
<<<<<<< HEAD
=======
  } else {
    // Find the name of the existing manual trigger
    const triggerNode = clean.nodes.find(n =>
      triggerTypes.includes(n.type) ||
      (n.type || '').toLowerCase().includes('manualtrigger') ||
      (n.name || '').toLowerCase() === 'start'
    );
    manualTriggerNodeName = triggerNode?.name || null;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }

  return clean;
}

export default router;