// utils/n8n.js - n8n API Adapter with auto-detection
import fetch from 'node-fetch';

// In-memory cache for the working base path
let _workingBasePath = null;
let _detectionPromise = null;

// ─────────────────────────────────────────────
// LAZY env readers — dotenv must run before these are called.
// Never use top-level const N8N_API_KEY = process.env.N8N_API_KEY
// because at module-load time dotenv hasn't injected the values yet.
// ─────────────────────────────────────────────
function getN8nUrl() {
  return process.env.N8N_URL || 'http://localhost:5678';
}

function getN8nApiKey() {
  return process.env.N8N_API_KEY || '';
}

/**
 * Returns correct headers for n8n API.
 * Always uses X-N8N-API-KEY — never Bearer JWT.
 */
export function getN8nHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const key = getN8nApiKey();
  if (key) {
    headers['X-N8N-API-KEY'] = key;
  }
  return headers;
}

/**
 * Auto-detects which base path works for this n8n instance.
 * Tries /api/v1 first, then falls back to /rest.
 * A 401 means the path EXISTS (auth required) — that's a valid detection.
 * Only 404 means the path doesn't exist.
 */
export async function detectBasePath() {
  if (_workingBasePath) return _workingBasePath;
  if (_detectionPromise) return _detectionPromise;

  _detectionPromise = (async () => {
    const candidates = ['/api/v1', '/rest'];
    const n8nUrl = getN8nUrl();

    for (const basePath of candidates) {
      try {
        const url = `${n8nUrl}${basePath}/workflows?limit=1`;
        console.log(`🔍 Testing n8n base path: ${url}`);

        const res = await fetch(url, {
          method: 'GET',
          headers: getN8nHeaders(),
        });

        console.log(`   ↳ Status: ${res.status}`);

        // 404 = path doesn't exist → try next candidate
        // 302 = redirect (old n8n) → try next candidate
        // 200, 401, 403, 500 etc = path EXISTS → use it
        if (res.status !== 404 && res.status !== 302) {
          if (res.status === 401) {
            console.log(`⚠️  n8n path ${basePath} exists but returned 401 — check your N8N_API_KEY`);
          } else {
            console.log(`✅ n8n base path confirmed: ${basePath} (status ${res.status})`);
          }
          _workingBasePath = basePath;
          _detectionPromise = null;
          return basePath;
        }

        console.log(`   ↳ Path ${basePath} returned ${res.status}, trying next...`);
      } catch (err) {
        console.log(`   ↳ Path ${basePath} unreachable: ${err.message}`);
      }
    }

    console.warn('⚠️  Could not detect n8n base path, defaulting to /api/v1');
    _workingBasePath = '/api/v1';
    _detectionPromise = null;
    return '/api/v1';
  })();

  return _detectionPromise;
}

/**
 * Reset cached base path (call after config changes)
 */
export function resetBasePath() {
  _workingBasePath = null;
  _detectionPromise = null;
}

/**
 * Core n8n request — uses auto-detected base path + correct auth header
 */
export async function n8nRequest(path, method = 'GET', body = null) {
  const basePath = await detectBasePath();
  const url = `${getN8nUrl()}${basePath}${path}`;

  console.log(`📡 n8n ${method} ${url}`);

  const options = {
    method,
    headers: getN8nHeaders(),
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);

    console.log(`   ↳ Status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`   ↳ Error: ${text}`);

      // On 404, reset path cache and retry once
      if (res.status === 404 && _workingBasePath) {
        console.log('   ↳ 404 on cached path — resetting and retrying...');
        resetBasePath();
        const newBasePath = await detectBasePath();
        const retryUrl = `${getN8nUrl()}${newBasePath}${path}`;
        const retryRes = await fetch(retryUrl, options);

        if (retryRes.ok) {
          const ct = retryRes.headers.get('content-type') || '';
          return ct.includes('application/json') ? retryRes.json() : { success: true };
        }

        const retryText = await retryRes.text();
        throw new Error(`n8n API Error (${retryRes.status}): ${retryText}`);
      }

      throw new Error(`n8n API Error (${res.status}): ${text}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return { success: true };

  } catch (err) {
    if (err.message.startsWith('n8n API Error')) throw err;
    throw new Error(`n8n connection failed: ${err.message}`);
  }
}

/**
 * Health check — returns connection status without throwing
 */
export async function checkN8nHealth() {
  try {
    const basePath = await detectBasePath();
    const url = `${getN8nUrl()}${basePath}/workflows?limit=1`;
    const res = await fetch(url, { method: 'GET', headers: getN8nHeaders() });
    return {
      connected: res.ok,
      status: res.status,
      basePath,
      url: getN8nUrl(),
      apiKeySet: !!getN8nApiKey(),
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      url: getN8nUrl(),
      apiKeySet: !!getN8nApiKey(),
    };
  }
}