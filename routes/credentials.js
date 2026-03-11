// routes/credentials.js - Secure credential vault with AES-256-GCM
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { encryptCredential, decryptCredential } from '../utils/encryption.js';
<<<<<<< HEAD
import { engineDeleteCredential } from '../utils/engine.js';
=======
import { n8nRequest } from '../utils/n8n.js';
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
import { DEMO_CREDENTIALS } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

<<<<<<< HEAD
=======
// n8n credential type mapping
const N8N_CRED_TYPE_MAP = {
  aws: 'aws',
  gcp: 'googleApi',
  azure: 'microsoftAzure',
  github: 'githubApi',
  slack: 'slackApi',
  openai: 'openAiApi',
};

>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
// GET /api/credentials - List (no secrets)
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ credentials: DEMO_CREDENTIALS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_credentials')
      .select('id, credential_type, credential_name, is_valid, last_validated_at, created_at')
      .eq('user_id', req.user.id)
      .eq('is_valid', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
<<<<<<< HEAD
    res.json({ credentials: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load credentials' });
=======

    res.json({ credentials: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// POST /api/credentials - Add credential
<<<<<<< HEAD
// Stores encrypted in Supabase only.
// Credentials are injected into the engine at workflow install time,
// not at save time. This keeps CloudPilot as the sole source of truth.
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { credential_type, credential_name, credentials } = req.body;

  if (!credential_type || !credential_name || !credentials) {
    return res.status(400).json({ error: 'credential_type, credential_name, and credentials are required' });
  }

  if (process.env.DEMO_MODE === 'true') {
    return res.json({
      success: true,
      credential: {
        id: `cred-${Date.now()}`,
        credential_type,
        credential_name,
        is_valid: true,
        created_at: new Date().toISOString(),
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const userId = req.user.id;

<<<<<<< HEAD
    // Encrypt credentials before storing
    const encrypted = encryptCredential(credentials);

    const { data, error } = await supabase
      .from('user_credentials')
      .insert({
        user_id:           userId,
        credential_type,
        credential_name,
        encrypted_data:    JSON.stringify(encrypted),
        is_valid:          true,
=======
    // Encrypt the credentials
    const encrypted = encryptCredential(credentials);

    // Store in Supabase
    const { data, error } = await supabase
      .from('user_credentials')
      .insert({
        user_id: userId,
        credential_type,
        credential_name,
        encrypted_data: JSON.stringify(encrypted),
        is_valid: true,
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
        last_validated_at: new Date().toISOString(),
      })
      .select('id, credential_type, credential_name, is_valid, created_at')
      .single();

    if (error) throw error;

<<<<<<< HEAD
    // Audit log (non-fatal)
    supabase.from('audit_logs').insert({
      user_id:       userId,
      action:        'credential_added',
      resource_type: 'credential',
      resource_id:   data.id,
      metadata:      { credential_type, credential_name },
    }).catch(() => {});

    res.json({ success: true, credential: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save credential' });
=======
    // Also create in n8n (best-effort, non-fatal)
    let n8nCredentialId = null;
    try {
      const n8nType = N8N_CRED_TYPE_MAP[credential_type] || credential_type;
      const n8nCred = await n8nRequest('/credentials', 'POST', {
        name: `${credential_name}_${userId.slice(0, 8)}_${Date.now()}`,
        type: n8nType,
        data: credentials,
      });
      n8nCredentialId = n8nCred?.id;

      // Store n8n credential ID if we have a column for it
      if (n8nCredentialId) {
        await supabase
          .from('user_credentials')
          .update({ n8n_credential_id: n8nCredentialId })
          .eq('id', data.id)
          .throwOnError()
          .catch(() => {}); // Column may not exist yet
      }
    } catch (n8nErr) {
      console.warn('Could not create credential in n8n (non-fatal):', n8nErr.message);
    }

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'credential_added',
        resource_type: 'credential',
        resource_id: data.id,
        metadata: { credential_type, credential_name },
      });
    } catch (_) {}

    res.json({
      success: true,
      credential: data,
      n8n_synced: !!n8nCredentialId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
<<<<<<< HEAD
// DELETE /api/credentials/:id
// Soft-deletes in Supabase and removes from engine if ref exists.
=======
// DELETE /api/credentials/:id - Delete credential
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const userId = req.user.id;

<<<<<<< HEAD
    // Fetch engine ref before deleting so we can clean up the engine too
    const { data: cred } = await supabase
      .from('user_credentials')
      .select('engine_credential_ref')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!cred) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Soft-delete in Supabase
=======
    // Soft-delete: mark is_valid = false
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const { error } = await supabase
      .from('user_credentials')
      .update({ is_valid: false })
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) throw error;

<<<<<<< HEAD
    // Remove from engine if we have the ref (non-fatal)
    if (cred.engine_credential_ref) {
      await engineDeleteCredential(cred.engine_credential_ref).catch(() => {});
    }

    // Audit log (non-fatal)
    supabase.from('audit_logs').insert({
      user_id:       userId,
      action:        'credential_deleted',
      resource_type: 'credential',
      resource_id:   req.params.id,
      metadata:      {},
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete credential' });
=======
    // Audit
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'credential_deleted',
        resource_type: 'credential',
        resource_id: req.params.id,
        metadata: {},
      });
    } catch (_) {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  }
});

// ─────────────────────────────────────────────
// Internal helper - get decrypted credential data
<<<<<<< HEAD
// Used by the template import pipeline to inject credentials into engine.
=======
// (used by template import pipeline)
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
export async function getDecryptedCredential(credentialId, userId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('user_credentials')
    .select('*')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .eq('is_valid', true)
    .single();

<<<<<<< HEAD
  if (error || !data) throw new Error('Credential not found or access denied');
=======
  if (error) throw new Error(`Credential not found: ${error.message}`);
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

  const parsed = JSON.parse(data.encrypted_data);
  const decrypted = decryptCredential(parsed);

  return {
<<<<<<< HEAD
    id:              data.id,
    credential_type: data.credential_type,
    credential_name: data.credential_name,
    data:            decrypted,
=======
    id: data.id,
    credential_type: data.credential_type,
    credential_name: data.credential_name,
    data: decrypted,
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  };
}

export default router;