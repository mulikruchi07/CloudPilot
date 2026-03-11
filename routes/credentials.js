// routes/credentials.js - Secure credential vault with AES-256-GCM
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';
import { encryptCredential, decryptCredential } from '../utils/encryption.js';
import { engineDeleteCredential } from '../utils/engine.js';
import { DEMO_CREDENTIALS } from '../utils/demo.js';

const router = Router();
router.use(requireAuth);

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
    res.json({ credentials: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load credentials' });
  }
});

// ─────────────────────────────────────────────
// POST /api/credentials - Add credential
// Stores encrypted in Supabase only.
// Credentials are injected into the engine at workflow install time,
// not at save time. This keeps CloudPilot as the sole source of truth.
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
        last_validated_at: new Date().toISOString(),
      })
      .select('id, credential_type, credential_name, is_valid, created_at')
      .single();

    if (error) throw error;

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
  }
});

// ─────────────────────────────────────────────
// DELETE /api/credentials/:id
// Soft-deletes in Supabase and removes from engine if ref exists.
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const userId = req.user.id;

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
    const { error } = await supabase
      .from('user_credentials')
      .update({ is_valid: false })
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) throw error;

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
  }
});

// ─────────────────────────────────────────────
// Internal helper - get decrypted credential data
// Used by the template import pipeline to inject credentials into engine.
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

  if (error || !data) throw new Error('Credential not found or access denied');

  const parsed = JSON.parse(data.encrypted_data);
  const decrypted = decryptCredential(parsed);

  return {
    id:              data.id,
    credential_type: data.credential_type,
    credential_name: data.credential_name,
    data:            decrypted,
  };
}

export default router;