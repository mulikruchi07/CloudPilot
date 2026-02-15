// routes/templates.js
import { createClient } from '@supabase/supabase-js';
import { decryptCredential } from '../utils/encryption.js';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const N8N_URL = process.env.N8N_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

// 📋 List available templates
export async function listTemplates(req, res) {
  try {
    const { data, error } = await supabase
      .from('workflow_templates')
      .select('id, name, description, category, icon, required_credentials, tags')
      .eq('is_active', true);

    if (error) throw error;

    res.json({ templates: data });

  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
}

// 🚀 Import template and inject credentials
export async function importTemplate(req, res) {
  try {
    const { template_id, credential_mappings, workflow_name } = req.body;
    const userId = req.user.id;

    // 1. Get template from database
    const { data: template, error: templateError } = await supabase
      .from('workflow_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError) throw templateError;

    // 2. Get user's credentials
    const credentials = {};
    for (const [credType, credId] of Object.entries(credential_mappings)) {
      const { data: cred, error: credError } = await supabase
        .from('user_credentials')
        .select('*')
        .eq('id', credId)
        .eq('user_id', userId)
        .single();

      if (credError) throw credError;

      const decrypted = decryptCredential(JSON.parse(cred.encrypted_data));
      credentials[credType] = {
        id: cred.id,
        name: cred.credential_name,
        data: decrypted
      };
    }

    // 3. Clone workflow JSON and inject credentials
    const workflowData = JSON.parse(JSON.stringify(template.workflow_json));
    workflowData.name = workflow_name || template.name;

    // First create credentials in n8n
    const n8nCredentialIds = {};
    for (const [credType, credData] of Object.entries(credentials)) {
      const n8nCredId = await createN8nCredential(
        credType,
        credData.name,
        credData.data,
        userId
      );
      n8nCredentialIds[credType] = n8nCredId;
    }

    // Replace placeholder credentials in workflow
    workflowData.nodes = workflowData.nodes.map(node => {
      if (node.credentials) {
        for (const [credType, credInfo] of Object.entries(node.credentials)) {
          if (n8nCredentialIds[credType]) {
            node.credentials[credType] = {
              id: n8nCredentialIds[credType],
              name: credentials[credType].name
            };
          }
        }
      }
      return node;
    });

    // 4. Create workflow in n8n
    const n8nResponse = await fetch(`${N8N_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      },
      body: JSON.stringify(workflowData)
    });

    if (!n8nResponse.ok) {
      throw new Error('Failed to create workflow in n8n');
    }

    const n8nWorkflow = await n8nResponse.json();

    // 5. Store in user_workflows table
    const { data: userWorkflow, error: userWorkflowError } = await supabase
      .from('user_workflows')
      .insert({
        user_id: userId,
        template_id: template_id,
        n8n_workflow_id: n8nWorkflow.id,
        name: workflow_name || template.name,
        is_active: false
      })
      .select()
      .single();

    if (userWorkflowError) throw userWorkflowError;

    // 6. Log audit
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'workflow_imported',
      resource_type: 'workflow',
      resource_id: userWorkflow.id,
      metadata: { template_id, workflow_name }
    });

    res.json({
      success: true,
      workflow: {
        id: userWorkflow.id,
        n8n_id: n8nWorkflow.id,
        name: userWorkflow.name
      }
    });

  } catch (error) {
    console.error('Error importing template:', error);
    res.status(500).json({ error: error.message });
  }
}

// Helper: Create credential in n8n
async function createN8nCredential(type, name, data, userId) {
  const credentialTypeMap = {
    'aws': 'aws',
    'gcp': 'googleApi',
    'azure': 'microsoftAzure'
  };

  const response = await fetch(`${N8N_URL}/api/v1/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': N8N_API_KEY
    },
    body: JSON.stringify({
      name: `${name}_${userId}_${Date.now()}`,
      type: credentialTypeMap[type],
      data: data
    })
  });

  if (!response.ok) {
    throw new Error('Failed to create credential in n8n');
  }

  const credential = await response.json();
  return credential.id;
}