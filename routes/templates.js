// routes/templates.js - Template marketplace + import pipeline
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { n8nRequest } from '../utils/n8n.js';
import { getDecryptedCredential } from './credentials.js';
import { DEMO_TEMPLATES } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

const N8N_CRED_TYPE_MAP = {
  aws: 'aws',
  gcp: 'googleApi',
  azure: 'microsoftAzureOAuth2Api',
  github: 'githubApi',
  slack: 'slackApi',
  openai: 'openAiApi',
  smtp: 'smtp',
  http: 'httpBasicAuth',
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
    res.status(500).json({ error: err.message });
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
        id: `demo-wf-${Date.now()}`,
        name: workflow_name || template?.name || 'Imported Workflow',
      },
    });
  }

  const userId = req.user.id;
  const supabase = getSupabaseAdmin();

  try {
    // ── 1. Fetch template ──
    // Use two separate queries instead of .or() to avoid Supabase PostgREST syntax issues
    let template = null;

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

    if (!template) {
      throw new Error(`Template not found: ${template_id}`);
    }

    // ── 2. Decrypt credentials (skip if none mapped) ──
    const decryptedCreds = {};
    for (const [credType, credId] of Object.entries(credential_mappings)) {
      if (!credId) continue;
      try {
        decryptedCreds[credType] = await getDecryptedCredential(credId, userId);
      } catch (err) {
        console.warn(`Could not decrypt credential ${credType}:`, err.message);
      }
    }

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
          }
        }
        return node;
      });
    }

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
    });

  } catch (err) {
    console.error('Template import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Strip n8n-internal fields that cause 400 on POST /workflows
// n8n rejects: id, meta.instanceId, versionId, updatedAt, createdAt, active
// ─────────────────────────────────────────────
function sanitizeWorkflowForImport(raw, name) {
  const wf = JSON.parse(JSON.stringify(raw)); // deep clone

  // Required fields with safe defaults
  const clean = {
    name: name || wf.name || 'Imported Workflow',
    nodes: wf.nodes || [],
    connections: wf.connections || {},
    settings: wf.settings || { executionOrder: 'v1' },
    staticData: wf.staticData || null,
    tags: wf.tags || [],
  };

  // Strip node IDs that will conflict (n8n re-assigns them)
  clean.nodes = clean.nodes.map(node => {
    const n = { ...node };
    // Keep: type, name, parameters, credentials, position, typeVersion
    // Remove: id (n8n will assign new IDs)
    delete n.id;
    return n;
  });

  return clean;
}

export default router;