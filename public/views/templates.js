// public/views/templates.js
import { api, escapeHtml } from '../api.js';
import { showModal, showToast, setPageHeader, setTopActions } from '../ui.js';

let _allTemplates = [];

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
    const data = await api.getTemplates();
    _allTemplates = data?.templates || [];
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

  const catColors = { AWS: '#f97316', GCP: '#3b82f6', Azure: '#8b5cf6', Default: '#6366f1' };
  const getCatColor = (cat) => {
    const key = Object.keys(catColors).find(k => (cat || '').toUpperCase().includes(k.toUpperCase())) || 'Default';
    return catColors[key];
  };

  grid.innerHTML = templates.map(t => {
    const creds = Array.isArray(t.required_credentials) ? t.required_credentials :
      (typeof t.required_credentials === 'string' ? JSON.parse(t.required_credentials || '[]') : []);
    const catColor = getCatColor(t.category);

    return `
      <div class="wf-card template-card">
        <div class="template-header">
          <div class="template-icon" style="background: linear-gradient(135deg, ${catColor}22, ${catColor}44); color: ${catColor}">
            <i class="fas fa-bolt"></i>
          </div>
          <div>
            <h3>${escapeHtml(t.name)}</h3>
            <div class="template-category" style="color: ${catColor}">${escapeHtml(t.category || 'General')}</div>
          </div>
        </div>
        <p class="template-desc">${escapeHtml(t.description || 'No description provided')}</p>
        <div class="template-tags">
          ${(t.tags || []).slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        ${creds.length ? `
          <div class="template-creds">
            <span class="creds-label">Requires:</span>
            ${creds.map(c => `<span class="cred-badge">${escapeHtml(String(c).toUpperCase())}</span>`).join('')}
          </div>
        ` : ''}
        <button class="wf-btn primary" style="width:100%;margin-top:1rem"
          onclick="window._importTemplate('${escapeHtml(t.id || t.template_id)}', ${JSON.stringify(escapeHtml(t.name))}, ${JSON.stringify(creds)})">
          <i class="fas fa-download"></i> Import Template
        </button>
      </div>
    `;
  }).join('');
}

function setupTemplateSearch() {
  window._templateSearch = (query) => {
    const q = query.toLowerCase();
    if (!q) return renderTemplates(_allTemplates);
    const filtered = _allTemplates.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
    renderTemplates(filtered);
  };
}

window._importTemplate = async (templateId, templateName, requiredCreds) => {
  const creds = Array.isArray(requiredCreds) ? requiredCreds : [];

  showModal('Import Template', `
    <div class="import-form">
      <div class="import-template-name">${escapeHtml(templateName)}</div>
      <div class="form-group">
        <label class="form-label">Workflow Name</label>
        <input type="text" id="importWfName" class="form-input" value="${escapeHtml(templateName)}" placeholder="Custom workflow name…">
      </div>
      ${creds.length ? `
        <div style="margin-bottom:1rem">
          <label class="form-label">Credential Mappings</label>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:0.5rem">
            You can leave these empty and configure later in n8n
          </p>
          ${creds.map(cred => `
            <div class="form-group">
              <label class="form-label">${escapeHtml(String(cred).toUpperCase())} Credential ID</label>
              <input type="text" id="cred_${escapeHtml(cred)}" class="form-input" placeholder="Leave blank to skip…">
            </div>
          `).join('')}
        </div>
      ` : ''}
      <button class="wf-btn primary" style="width:100%" onclick="window._doImport('${escapeHtml(templateId)}', ${JSON.stringify(creds)})">
        <i class="fas fa-download"></i> Import Now
      </button>
    </div>
  `);
};

window._doImport = async (templateId, credTypes) => {
  const name = document.getElementById('importWfName')?.value?.trim();
  const credMappings = {};

  for (const cred of (credTypes || [])) {
    const val = document.getElementById(`cred_${cred}`)?.value?.trim();
    if (val) credMappings[cred] = val;
  }

  try {
    const btn = document.querySelector('.modal .wf-btn.primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-small"></div> Importing…'; }

    const result = await api.importTemplate({
      template_id: templateId,
      workflow_name: name,
      credential_mappings: credMappings,
    });

    document.getElementById('modal').classList.remove('active');
    showToast('✅ Template imported successfully!', 'success');

    setTimeout(() => { window.location.hash = '/dashboard'; }, 800);
  } catch (err) {
    showToast('❌ Import failed: ' + err.message, 'error');
    const btn = document.querySelector('.modal .wf-btn.primary');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Import Now'; }
  }
};