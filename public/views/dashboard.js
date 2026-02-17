// public/views/dashboard.js - Workflow dashboard with live run panel
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
    _allWorkflows = data?.data || data?.workflows || [];
    updateStats(_allWorkflows);
    renderWorkflows(_allWorkflows);
    setupSearch();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-plug"></i>
        <h3>Cannot reach n8n</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn-create" onclick="window.location.hash='/dashboard'">
          <i class="fas fa-sync-alt"></i> Retry
        </button>
      </div>`;
    updateStatsError();
  }
}

function updateStats(workflows) {
  const total = workflows.length;
  const active = workflows.filter(w => w.active).length;
  document.getElementById('totalWorkflows').textContent = total;
  document.getElementById('activeWorkflows').textContent = active;
  document.getElementById('inactiveWorkflows').textContent = total - active;
  document.getElementById('systemStatus').textContent = 'Online';
  document.getElementById('lastSync').textContent = `Synced ${new Date().toLocaleTimeString()}`;
}

function updateStatsError() {
  document.getElementById('systemStatus').textContent = 'Offline';
  document.getElementById('lastSync').textContent = 'Failed to sync';
}

function renderWorkflows(workflows) {
  const grid = document.getElementById('workflowsGrid');

  if (!workflows.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-project-diagram"></i>
        <h3>No workflows yet</h3>
        <p>Import a template or create one in n8n to get started</p>
        <button class="btn-create" onclick="window.location.hash='/templates'">
          <i class="fas fa-boxes"></i> Browse Templates
        </button>
      </div>`;
    return;
  }

  grid.innerHTML = workflows.map(wf => `
    <div class="wf-card" id="wfcard-${escapeHtml(wf.id)}">
      <div class="wf-header">
        <div class="wf-title-group">
          <h3>${escapeHtml(wf.name)}</h3>
          <span class="wf-id">${escapeHtml(wf.id)}</span>
        </div>
        <span class="status-badge ${wf.active ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${wf.active ? 'Active' : 'Stopped'}
        </span>
      </div>
      <div class="wf-meta">
        <div class="meta-item">
          <i class="fas fa-clock"></i>
          <span>Updated ${formatDate(wf.updatedAt)}</span>
        </div>
        <div class="meta-item">
          <i class="fas fa-cubes"></i>
          <span>${(wf.nodes || []).length} nodes</span>
        </div>
      </div>
      <div class="wf-actions">
        <button class="wf-btn primary" id="runbtn-${escapeHtml(wf.id)}"
          onclick="window._runWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(wf.name).replace(/'/g, "\\'")}', this)">
          <i class="fas fa-play"></i> Run
        </button>
        <button class="wf-btn ${wf.active ? 'danger' : 'success'}"
          onclick="window._toggleWorkflow('${escapeHtml(wf.id)}', ${!wf.active}, '${escapeHtml(wf.name)}')">
          <i class="fas fa-${wf.active ? 'pause' : 'play-circle'}"></i>
          ${wf.active ? 'Deactivate' : 'Activate'}
        </button>
        <button class="wf-btn secondary"
          onclick="window.location.hash='/execution/${escapeHtml(wf.id)}'">
          <i class="fas fa-history"></i> History
        </button>
        <button class="wf-btn danger"
          onclick="window._deleteWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(wf.name)}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function setupSearch() {
  window._dashboardSearch = (query) => {
    const q = query.toLowerCase().trim();
    if (!q) return renderWorkflows(_allWorkflows);
    renderWorkflows(_allWorkflows.filter(wf =>
      (wf.name || '').toLowerCase().includes(q) ||
      (wf.id || '').toLowerCase().includes(q) ||
      (wf.tags || []).some(t => (t.name || t).toLowerCase().includes(q))
    ));
  };
}

// ─────────────────────────────────────────────
// Global action handlers
// ─────────────────────────────────────────────

// Run — opens live animated panel
window._runWorkflow = async (id, name, btnEl) => {
  const card = document.getElementById(`wfcard-${id}`);
  if (!card) return;
  await runWithLivePanel(id, name, card);
};

window._toggleWorkflow = async (id, active, name) => {
  try {
    await api.toggleWorkflow(id, active);
    showToast(`✅ Workflow ${active ? 'activated' : 'deactivated'}`, 'success');
    dashboardView();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
};

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