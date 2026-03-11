// middleware/auth.js - Supabase JWT verification middleware
import { getSupabase } from '../utils/supabase.js';

/**
 * Middleware that verifies the Supabase JWT from Authorization header
 * Sets req.user = { id, email, ... } on success
 */
export async function requireAuth(req, res, next) {
  // Skip auth in demo mode
  if (process.env.DEMO_MODE === 'true') {
    req.user = { id: 'demo-user-id', email: 'demo@cloudpilot.dev', role: 'user' };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional auth - sets req.user if token present, continues anyway
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      req.user = user;
      req.token = token;
    }
  } catch (_) {
    // Silently continue
  }

  next();
}