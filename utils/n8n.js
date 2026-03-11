// utils/n8n.js - n8n API Adapter with robust error handling + diagnostics
import fetch from 'node-fetch';

let _workingBasePath = null;
let _detectionPromise = null;

function getN8nUrl() {
  return (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
}
function getN8nApiKey() {
  return process.env.N8N_API_KEY || '';
}

export function getN8nHeaders() {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const key = getN8nApiKey();
  if (key) h['X-N8N-API-KEY'] = key;
  return h;
}

// ─────────────────────────────────────────────
// Auto-detect which base path n8n uses
// /api/v1  →  n8n ≥ 0.166 (public API)
// /rest    →  older n8n or self-hosted without public API enabled
// ─────────────────────────────────────────────
export async function detectBasePath() {
  if (_workingBasePath) return _workingBasePath;
  if (_detectionPromise) return _detectionPromise;

  _detectionPromise = (async () => {
    const candidates = ['/api/v1', '/rest'];
    const n8nUrl = getN8nUrl();

    for (const basePath of candidates) {
      try {
        const url = `${n8nUrl}${basePath}/workflows?limit=1`;
        console.log(`🔍 Testing n8n path: ${url}`);
        const res = await fetch(url, { method: 'GET', headers: getN8nHeaders() });
        console.log(`   ↳ ${res.status}`);

        if (res.status !== 404 && res.status !== 302) {
          if (res.status === 401) {
            console.warn(`⚠️  n8n at ${basePath}: 401 — check N8N_API_KEY`);
          } else {
            console.log(`✅ n8n base path: ${basePath} (${res.status})`);
          }
          _workingBasePath = basePath;
          _detectionPromise = null;
          return basePath;
        }
      } catch (err) {
        console.log(`   ↳ ${basePath} unreachable: ${err.message}`);
      }
    }

    console.warn('⚠️  Defaulting to /api/v1');
    _workingBasePath = '/api/v1';
    _detectionPromise = null;
    return '/api/v1';
  })();

  return _detectionPromise;
}

export function resetBasePath() {
  _workingBasePath = null;
  _detectionPromise = null;
}

// ─────────────────────────────────────────────
// Core request — surfaces the REAL n8n error message
// instead of wrapping it in a generic 502
// ─────────────────────────────────────────────
export async function n8nRequest(path, method = 'GET', body = null) {
  const basePath = await detectBasePath();
  const url = `${getN8nUrl()}${basePath}${path}`;

  console.log(`📡 n8n ${method} ${url}`);

  const options = {
    method,
    headers: getN8nHeaders(),
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`n8n unreachable at ${getN8nUrl()} — ${err.message}`);
  }

  console.log(`   ↳ ${res.status}`);

  if (!res.ok) {
    let errorText = '';
    let errorJson = null;
    try {
      errorText = await res.text();
      errorJson = JSON.parse(errorText);
    } catch (_) {}

    const message = errorJson?.message || errorJson?.error || errorText || `HTTP ${res.status}`;
    console.error(`   ↳ Error body: ${errorText}`);

    // On 404 with a cached base path, retry with fresh detection
    if (res.status === 404 && _workingBasePath) {
      console.log('   ↳ 404 — resetting base path and retrying...');
      resetBasePath();
      const newBase = await detectBasePath();
      const retryUrl = `${getN8nUrl()}${newBase}${path}`;
      let retryRes;
      try {
        retryRes = await fetch(retryUrl, options);
      } catch (err) {
        throw new Error(`n8n unreachable: ${err.message}`);
      }
      if (retryRes.ok) {
        const ct = retryRes.headers.get('content-type') || '';
        return ct.includes('json') ? retryRes.json() : { success: true };
      }
      const retryText = await retryRes.text().catch(() => '');
      let retryJson = null;
      try { retryJson = JSON.parse(retryText); } catch (_) {}
      throw new Error(retryJson?.message || retryJson?.error || retryText || `HTTP ${retryRes.status}`);
    }

    throw new Error(message);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return { success: true };
}

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
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