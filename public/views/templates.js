// public/views/templates.js
import { api, escapeHtml } from '../api.js';
import { showModal, showToast, setPageHeader, setTopActions } from '../ui.js';

<<<<<<< HEAD
let _allTemplates    = [];
=======
let _allTemplates = [];
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
let _savedCredentials = []; // loaded once, reused

export async function templatesView() {
  setPageHeader('Template Marketplace', 'Browse and import pre-built automation templates');
  setTopActions(`
    <div class="search-wrapper">
      <i class="fas fa-search"></i>
      <input type="text" id="searchInput" placeholder="Search templates…" oninput="window._templateSearch(this.value)">
    </div>
  `);

  const grid = document.getElementById('workflowsGrid');
  grid.innerHTML = `<div class="loading-card"><div class="spinner-small"></div><span>Loading templates…</span></div>`;

  try {
<<<<<<< HEAD
=======
    // Load templates + saved credentials in parallel
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const [templateData, credData] = await Promise.all([
      api.getTemplates(),
      api.getCredentials().catch(() => ({ credentials: [] })),
    ]);
<<<<<<< HEAD
    _allTemplates    = templateData?.templates || [];
=======
    _allTemplates = templateData?.templates || [];
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    _savedCredentials = credData?.credentials || [];
    renderTemplates(_allTemplates);
    setupTemplateSearch();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-boxes"></i>
        <h3>Failed to load templates</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderTemplates(templates) {
  const grid = document.getElementById('workflowsGrid');

  if (!templates.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-boxes"></i>
        <h3>No templates yet</h3>
        <p>Templates will appear here once added to the database</p>
      </div>
    `;
    return;
  }

  const catColors = { AWS: '#f97316', GCP: '#3b82f6', AZURE: '#8b5cf6', DEFAULT: '#6366f1' };
  const getCatColor = (cat) => {
    const upper = (cat || '').toUpperCase();
    return catColors[Object.keys(catColors).find(k => upper.includes(k))] || catColors.DEFAULT;
  };

  grid.innerHTML = templates.map(t => {
<<<<<<< HEAD
    const creds    = normalizeCreds(t.required_credentials);
    const catColor = getCatColor(t.category);

=======
    const creds = normalizeCreds(t.required_credentials);
    const catColor = getCatColor(t.category);

    // For each required credential type, check if the user has one saved
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    const credStatus = creds.map(credType => {
      const match = _savedCredentials.filter(c => c.credential_type === credType);
      return { type: credType, saved: match };
    });
    const allCredsAvailable = credStatus.every(c => c.saved.length > 0);
<<<<<<< HEAD
=======
    const hasAnyCred = credStatus.some(c => c.saved.length > 0);
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

    return `
      <div class="wf-card template-card">
        <div class="template-header">
          <div class="template-icon" style="background:linear-gradient(135deg,${catColor}22,${catColor}44);color:${catColor}">
            <i class="fas fa-bolt"></i>
          </div>
          <div style="flex:1;min-width:0">
            <h3>${escapeHtml(t.name)}</h3>
            <div class="template-category" style="color:${catColor}">${escapeHtml(t.category || 'General')}</div>
          </div>
        </div>

        <p class="template-desc">${escapeHtml(t.description || 'No description provided')}</p>

        <div class="template-tags">
          ${(t.tags || []).slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>

        ${creds.length ? `
          <div class="template-creds-status">
            ${credStatus.map(c => `
              <div class="cred-status-row">
                <i class="fas fa-${c.saved.length > 0 ? 'check-circle' : 'times-circle'}"
                   style="color:${c.saved.length > 0 ? 'var(--success)' : 'var(--accent)'}"></i>
                <span class="cred-status-type">${escapeHtml(c.type.toUpperCase())}</span>
                <span class="cred-status-label" style="color:${c.saved.length > 0 ? 'var(--success)' : 'var(--accent)'}">
                  ${c.saved.length > 0 ? `${c.saved.length} credential${c.saved.length > 1 ? 's' : ''} available` : 'No credentials saved'}
                </span>
              </div>
            `).join('')}
            ${!allCredsAvailable ? `
              <a class="cred-add-link" onclick="window.location.hash='/credentials'">
                <i class="fas fa-plus-circle"></i> Add missing credentials first
              </a>
            ` : ''}
          </div>
        ` : ''}

        <button class="wf-btn primary" style="width:100%;margin-top:1rem"
          onclick="window._importTemplate(
            '${escapeHtml(t.id || t.template_id)}',
            ${JSON.stringify(escapeHtml(t.name))},
            ${JSON.stringify(creds)}
          )">
          <i class="fas fa-download"></i> Import Template
        </button>
      </div>
    `;
  }).join('');
}

function normalizeCreds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try { return JSON.parse(raw); } catch { return []; }
}

function setupTemplateSearch() {
  window._templateSearch = (query) => {
    const q = query.toLowerCase();
    if (!q) return renderTemplates(_allTemplates);
    renderTemplates(_allTemplates.filter(t =>
<<<<<<< HEAD
      (t.name        || '').toLowerCase().includes(q) ||
      (t.category    || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.tags        || []).some(tag => tag.toLowerCase().includes(q))
=======
      (t.name || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    ));
  };
}

// ─────────────────────────────────────────────
<<<<<<< HEAD
// Import modal
=======
// Import modal — shows credential DROPDOWNS
// populated from saved credentials, not text inputs
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
// ─────────────────────────────────────────────
window._importTemplate = async (templateId, templateName, requiredCredTypes) => {
  const creds = Array.isArray(requiredCredTypes) ? requiredCredTypes : [];

<<<<<<< HEAD
=======
  // Build credential selector for each required type
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  const credSelectors = creds.map(credType => {
    const matching = _savedCredentials.filter(c => c.credential_type === credType);

    if (matching.length === 0) {
      return `
        <div class="form-group">
          <label class="form-label">${escapeHtml(credType.toUpperCase())} Credential</label>
          <div class="cred-missing-warning">
            <i class="fas fa-exclamation-triangle"></i>
            No ${escapeHtml(credType.toUpperCase())} credentials saved.
            <a onclick="window.location.hash='/credentials';document.getElementById('modal').classList.remove('active')"
               style="color:var(--primary);cursor:pointer;text-decoration:underline;margin-left:4px">
              Add one first →
            </a>
          </div>
          <input type="hidden" id="cred_${escapeHtml(credType)}" value="">
        </div>`;
    }

    const options = matching.map(c =>
      `<option value="${escapeHtml(c.id)}">${escapeHtml(c.credential_name)}</option>`
    ).join('');

    return `
      <div class="form-group">
        <label class="form-label">${escapeHtml(credType.toUpperCase())} Credential</label>
        <select id="cred_${escapeHtml(credType)}" class="form-input">
          ${options}
        </select>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
          <i class="fas fa-lock" style="color:var(--success)"></i>
          Using your saved, encrypted credential
        </div>
      </div>`;
  }).join('');

  showModal('Import Template', `
    <div class="import-form">
      <div class="import-template-name">${escapeHtml(templateName)}</div>

      <div class="form-group">
        <label class="form-label">Workflow Name</label>
        <input type="text" id="importWfName" class="form-input"
          value="${escapeHtml(templateName)}" placeholder="Custom workflow name…">
      </div>

      ${creds.length ? `
        <div style="margin-bottom:1rem">
          <div class="form-label" style="margin-bottom:0.75rem">Credentials</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:0.875rem;line-height:1.5;background:var(--bg-secondary);padding:8px 12px;border-radius:var(--radius-md)">
            <i class="fas fa-info-circle" style="color:var(--primary)"></i>
<<<<<<< HEAD
            Select from your saved credentials below. They will be securely injected into the workflow automatically.
=======
            These are your saved credentials from the Credentials vault.
            They will be automatically injected into the workflow in n8n — you don't need to touch anything else.
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          </div>
          ${credSelectors}
        </div>
      ` : `
        <div style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.2);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:1rem;font-size:13px;color:var(--success)">
          <i class="fas fa-check-circle"></i> No credentials required for this template
        </div>
      `}

      <div style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:1rem;font-size:12px;color:var(--text-muted);line-height:1.5">
        <i class="fas fa-magic" style="color:var(--primary)"></i>
        <strong style="color:var(--text-main)">Auto-setup:</strong>
        A <em>Manual Trigger</em> node will be automatically added so you can run this workflow from CloudPilot immediately after import.
      </div>

      <button class="wf-btn primary" style="width:100%"
        onclick="window._doImport('${escapeHtml(templateId)}', ${JSON.stringify(creds)})">
        <i class="fas fa-download"></i> Import &amp; Set Up
      </button>
    </div>
  `);
};

window._doImport = async (templateId, credTypes) => {
<<<<<<< HEAD
  const name        = document.getElementById('importWfName')?.value?.trim();
=======
  const name = document.getElementById('importWfName')?.value?.trim();
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  const credMappings = {};

  for (const cred of (credTypes || [])) {
    const val = document.getElementById(`cred_${cred}`)?.value?.trim();
    if (val) credMappings[cred] = val;
  }

  try {
    const btn = document.querySelector('.modal .wf-btn.primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-small"></div> Importing…'; }

    const result = await api.importTemplate({
<<<<<<< HEAD
      template_id:         templateId,
      workflow_name:       name,
=======
      template_id: templateId,
      workflow_name: name,
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      credential_mappings: credMappings,
    });

    document.getElementById('modal').classList.remove('active');

    const triggerMsg = result.manual_trigger_injected
<<<<<<< HEAD
      ? ' A Manual Trigger node was added automatically.'
=======
      ? ' Manual Trigger node was added automatically.'
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      : '';
    showToast(`✅ Template imported!${triggerMsg}`, 'success');

    setTimeout(() => { window.location.hash = '/dashboard'; }, 800);
  } catch (err) {
    showToast('❌ Import failed: ' + err.message, 'error');
    const btn = document.querySelector('.modal .wf-btn.primary');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Import & Set Up'; }
  }
};