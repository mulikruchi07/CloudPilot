// middleware/auth.js
import { createClient } from '@supabase/supabase-js';

// Lazy initialization - only create client when needed
let supabase = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  if (process.env.DEMO_MODE === 'true') {
    return null;
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return supabase;
}

/**
 * Authentication Middleware
 * Extracts and validates Supabase JWT token from Authorization header
 * Attaches user info to req.user for downstream use
 */
export async function authenticateUser(req, res, next) {
  try {
    const supabase = getSupabaseClient();

    // Check if Supabase is initialized
    if (!supabase) {
      return res.status(500).json({
        error: 'Authentication not configured',
        message: 'Supabase credentials missing. Set DEMO_MODE=true or configure Supabase.'
      });
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    // Check if user profile exists and is active
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User profile not found'
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User account is inactive'
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      profile: profile
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Demo Mode Bypass Middleware
 * If DEMO_MODE is enabled, creates a fake user without authentication
 */
export function demoModeBypass(req, res, next) {
  if (process.env.DEMO_MODE === 'true') {
    req.user = {
      id: 'demo-user-id',
      email: 'demo@cloudpilot.dev',
      profile: {
        id: 'demo-user-id',
        email: 'demo@cloudpilot.dev',
        full_name: 'Demo User',
        role: 'user',
        is_active: true
      }
    };
    return next();
  }

  // If not demo mode, use regular authentication
  return authenticateUser(req, res, next);
}