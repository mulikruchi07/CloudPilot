// routes/credentials.js
import { createClient } from '@supabase/supabase-js';
import { encryptCredential, decryptCredential } from '../utils/encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ Add new credential
export async function addCredential(req, res) {
  try {
    const { credential_type, credential_name, credentials } = req.body;
    const userId = req.user.id; // From auth middleware

    // Encrypt the credentials
    const encrypted = encryptCredential(credentials);

    const { data, error } = await supabase
      .from('user_credentials')
      .insert({
        user_id: userId,
        credential_type,
        credential_name,
        encrypted_data: JSON.stringify(encrypted)
      })
      .select()
      .single();

    if (error) throw error;

    // Also create credential in n8n
    await createN8nCredential(credential_type, credential_name, credentials, userId);

    res.json({ success: true, credential: {
      id: data.id,
      name: credential_name,
      type: credential_type
    }});

  } catch (error) {
    console.error('Error adding credential:', error);
    res.status(500).json({ error: error.message });
  }
}

// 📋 List user credentials (without secrets)
export async function listCredentials(req, res) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('user_credentials')
      .select('id, credential_type, credential_name, is_active, last_used_at, created_at')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    res.json({ credentials: data });

  } catch (error) {
    console.error('Error listing credentials:', error);
    res.status(500).json({ error: error.message });
  }
}

// 🗑️ Delete credential
export async function deleteCredential(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { error } = await supabase
      .from('user_credentials')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true });

  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: error.message });
  }
}