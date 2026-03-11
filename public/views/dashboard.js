// public/views/dashboard.js - Workflow dashboard
import { api, escapeHtml, formatDate } from '../api.js';
import { showToast, setPageHeader, setTopActions } from '../ui.js';
import { runWithLivePanel } from './timeline.js';

let _allWorkflows = [];

export async function dashboardView() {
  setPageHeader('Workflow Dashboard', 'Manage and monitor your automation workflows');
  setTopActions(`
    <div class="search-wrapper">
      <i class="fas fa-search"></i>
      <input type="text" id="searchInput" placeholder="Search workflows…" oninput="window._dashboardSearch(this.value)">
    </div>
    <button class="btn-create" onclick="window.location.hash='/templates'">
      <i class="fas fa-plus"></i> New Workflow
    </button>
  `);

  const grid = document.getElementById('workflowsGrid');
  grid.innerHTML = `<div class="loading-card"><div class="spinner-small"></div><span>Loading workflows…</span></div>`;

  try {
    const data = await api.getWorkflows();
    // API now returns Supabase rows — field is workflow_name, is_active, etc.
    _allWorkflows = data?.data || data?.workflows || [];
    updateStats(_allWorkflows);
    await renderDashboardContent(_allWorkflows);
    setupSearch();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-plug"></i>
        <h3>Could not load workflows</h3>
        <p>The automation service is temporarily unavailable. Please try again shortly.</p>
        <button class="btn-create" onclick="window.location.hash='/dashboard'">
          <i class="fas fa-sync-alt"></i> Retry
        </button>
      </div>`;
    updateStatsError();
  }
}

async function renderDashboardContent(workflows) {
  const grid = document.getElementById('workflowsGrid');
  grid.innerHTML = '';

  if (!workflows.length) {
    const emptyEl = document.createElement('div');
    emptyEl.className       = 'empty-state';
    emptyEl.style.gridColumn = '1 / -1';
    emptyEl.innerHTML = `
      <i class="fas fa-project-diagram"></i>
      <h3>No workflows yet</h3>
      <p>Import a template to get started with your first automation</p>
      <button class="btn-create" onclick="window.location.hash='/templates'">
        <i class="fas fa-boxes"></i> Browse Templates
      </button>`;
    grid.appendChild(emptyEl);
    return;
  }

  workflows.forEach(wf => {
    const cardEl = document.createElement('div');
    cardEl.innerHTML = buildWorkflowCard(wf);
    const card = cardEl.firstElementChild;
    grid.appendChild(card);
  });
}

function updateStats(workflows) {
  const total  = workflows.length;
  // Supabase rows use is_active (boolean), not .active
  const active = workflows.filter(w => w.is_active).length;
  document.getElementById('totalWorkflows').textContent   = total;
  document.getElementById('activeWorkflows').textContent  = active;
  document.getElementById('inactiveWorkflows').textContent = total - active;
  document.getElementById('systemStatus').textContent     = 'Online';
  document.getElementById('lastSync').textContent         = `Synced ${new Date().toLocaleTimeString()}`;
}

function updateStatsError() {
  document.getElementById('systemStatus').textContent = 'Offline';
  document.getElementById('lastSync').textContent     = 'Failed to sync';
}

function buildWorkflowCard(wf) {
  // Supabase rows: wf.id (UUID), wf.workflow_name, wf.is_active, wf.last_run_at
  const isActive     = wf.is_active || false;
  const displayName  = wf.workflow_name || wf.name || 'Untitled Workflow';
  const installFailed = wf.install_status === 'failed';

  return `
    <div class="wf-card" id="wfcard-${escapeHtml(wf.id)}">
      <div class="wf-header">
        <div class="wf-title-group">
          <h3 title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h3>
          <span class="wf-id">${escapeHtml(String(wf.id))}</span>
        </div>
        <label class="toggle-switch" title="${isActive ? 'Deactivate workflow' : 'Activate workflow'}">
          <input type="checkbox" ${isActive ? 'checked' : ''}
            ${installFailed ? 'disabled' : ''}
            onchange="window._toggleWorkflow('${escapeHtml(wf.id)}', this.checked, '${escapeHtml(displayName).replace(/'/g, "\\'")}', this)">
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="wf-meta">
        <div class="meta-item">
          <i class="fas fa-clock"></i>
          <span>Last run ${wf.last_run_at ? formatDate(wf.last_run_at) : 'Never'}</span>
        </div>
        <div class="meta-item">
          <i class="fas fa-tag"></i>
          <span>${escapeHtml(wf.install_status || 'installed')}</span>
        </div>
      </div>

      <div class="wf-status-row">
        <span class="status-badge ${isActive ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${isActive ? 'Active' : 'Inactive'}
        </span>
        ${installFailed ? `<span class="wf-node-pill" style="color:var(--accent)">Install failed</span>` : ''}
      </div>

      <div class="wf-actions">
        <button class="wf-btn primary" id="runbtn-${escapeHtml(wf.id)}"
          ${installFailed ? 'disabled' : ''}
          onclick="window._runWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(displayName).replace(/'/g, "\\'")}', this)">
          <i class="fas fa-play"></i> Run
        </button>
        <button class="wf-btn secondary"
          onclick="window.location.hash='/execution/${escapeHtml(wf.id)}'">
          <i class="fas fa-history"></i> History
        </button>
        <button class="wf-btn danger" title="Delete workflow"
          onclick="window._deleteWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(displayName).replace(/'/g, "\\'")}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function setupSearch() {
  window._dashboardSearch = (query) => {
    const q        = query.toLowerCase().trim();
    const filtered = q
      ? _allWorkflows.filter(wf =>
          (wf.workflow_name || wf.name || '').toLowerCase().includes(q) ||
          (wf.id  || '').toLowerCase().includes(q)
        )
      : _allWorkflows;

    const grid = document.getElementById('workflowsGrid');
    grid.querySelectorAll('.wf-card').forEach(c => c.remove());

    if (!filtered.length) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      emptyEl.style.gridColumn = '1 / -1';
      emptyEl.innerHTML = `
        <i class="fas fa-search"></i>
        <h3>No workflows match "${escapeHtml(q)}"</h3>
        <p>Try a different search term</p>`;
      grid.appendChild(emptyEl);
      return;
    }

    filtered.forEach(wf => {
      const cardEl = document.createElement('div');
      cardEl.innerHTML = buildWorkflowCard(wf);
      grid.appendChild(cardEl.firstElementChild);
    });
  };
}

// ─────────────────────────────────────────────
// Run workflow
// ─────────────────────────────────────────────
window._runWorkflow = async (id, name, btnEl) => {
  const card = document.getElementById(`wfcard-${id}`);
  if (!card) return;
  await runWithLivePanel(id, name, card);
};

// ─────────────────────────────────────────────
// Toggle workflow active state
// ─────────────────────────────────────────────
window._toggleWorkflow = async (id, active, name, checkboxEl) => {
  const card  = document.getElementById(`wfcard-${id}`);
  const badge = card?.querySelector('.status-badge');
  if (badge) {
    badge.className = `status-badge ${active ? 'active' : 'inactive'}`;
    badge.innerHTML = `<span class="status-dot"></span>${active ? 'Active' : 'Inactive'}`;
  }

  try {
    await api.toggleWorkflow(id, active);
    // Update local state — Supabase field is is_active
    const wf = _allWorkflows.find(w => String(w.id) === String(id));
    if (wf) wf.is_active = active;
    updateStats(_allWorkflows);
    showToast(`${active ? '✅ Activated' : '⏸ Deactivated'}: ${name}`, active ? 'success' : 'info');
  } catch (err) {
    // Revert UI on failure
    if (checkboxEl) checkboxEl.checked = !active;
    if (badge) {
      badge.className = `status-badge ${!active ? 'active' : 'inactive'}`;
      badge.innerHTML = `<span class="status-dot"></span>${!active ? 'Active' : 'Inactive'}`;
    }
    showToast('❌ ' + err.message, 'error');
  }
};

// ─────────────────────────────────────────────
// Delete workflow
// ─────────────────────────────────────────────
window._deleteWorkflow = async (id, name) => {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await api.deleteWorkflow(id);
    showToast('🗑️ Workflow deleted', 'success');
    dashboardView();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
};