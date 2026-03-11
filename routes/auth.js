// routes/auth.js - Profile update endpoint
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../utils/supabase.js';

const router = Router();

// ─────────────────────────────────────────────
// PATCH /api/auth/me - Update user profile
// FIX: This is what settings.js calls to persist full_name
// ─────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  const { full_name } = req.body;

  if (!full_name?.trim()) {
    return res.status(400).json({ error: 'full_name is required' });
  }

  if (process.env.DEMO_MODE === 'true') {
    return res.json({ success: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const userId   = req.user.id;

    // Update the users profile table (this is the fix for the Settings bug)
    const { error } = await supabase
      .from('users')
      .update({ full_name: full_name.trim() })
      .eq('id', userId);

    // Non-fatal if users table doesn't have this column — auth metadata is already updated
    if (error) console.warn('[auth/me] Could not update users table (non-fatal):', error.message);

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/me] Error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/me - Return current user profile
// ─────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ id: 'demo-user', email: 'demo@cloudpilot.dev' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, created_at')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    res.json(data || { id: req.user.id, email: req.user.email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

export default router;