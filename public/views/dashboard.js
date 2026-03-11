<<<<<<< HEAD
// public/views/dashboard.js - Workflow dashboard
import { api, escapeHtml, formatDate } from '../api.js';
import { showToast, setPageHeader, setTopActions } from '../ui.js';
import { runWithLivePanel } from './timeline.js';
=======
// public/views/dashboard.js - Workflow dashboard with onboarding
import { api, escapeHtml, formatDate } from '../api.js';
import { showToast, setPageHeader, setTopActions } from '../ui.js';
import { runWithLivePanel } from './timeline.js';
import { renderOnboardingChecklist, isOnboarded } from '../onboarding.js';
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

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
<<<<<<< HEAD
    // API now returns Supabase rows — field is workflow_name, is_active, etc.
=======
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
    _allWorkflows = data?.data || data?.workflows || [];
    updateStats(_allWorkflows);
    await renderDashboardContent(_allWorkflows);
    setupSearch();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-plug"></i>
<<<<<<< HEAD
        <h3>Could not load workflows</h3>
        <p>The automation service is temporarily unavailable. Please try again shortly.</p>
=======
        <h3>Cannot reach n8n</h3>
        <p>${escapeHtml(err.message)}</p>
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
        <button class="btn-create" onclick="window.location.hash='/dashboard'">
          <i class="fas fa-sync-alt"></i> Retry
        </button>
      </div>`;
    updateStatsError();
  }
}

async function renderDashboardContent(workflows) {
  const grid = document.getElementById('workflowsGrid');
<<<<<<< HEAD
  grid.innerHTML = '';

  if (!workflows.length) {
    const emptyEl = document.createElement('div');
    emptyEl.className       = 'empty-state';
=======

  // Create a container for onboarding checklist + workflow cards
  grid.innerHTML = '';

  // Onboarding checklist for new users
  const onboardingContainer = document.createElement('div');
  onboardingContainer.id = 'onboardingContainer';
  onboardingContainer.style.cssText = 'grid-column:1/-1';
  grid.appendChild(onboardingContainer);

  // Show onboarding checklist if not completed
  if (!isOnboarded()) {
    await renderOnboardingChecklist(onboardingContainer);
  }

  if (!workflows.length) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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
<<<<<<< HEAD
  const total  = workflows.length;
  // Supabase rows use is_active (boolean), not .active
  const active = workflows.filter(w => w.is_active).length;
  document.getElementById('totalWorkflows').textContent   = total;
  document.getElementById('activeWorkflows').textContent  = active;
  document.getElementById('inactiveWorkflows').textContent = total - active;
  document.getElementById('systemStatus').textContent     = 'Online';
  document.getElementById('lastSync').textContent         = `Synced ${new Date().toLocaleTimeString()}`;
=======
  const total = workflows.length;
  const active = workflows.filter(w => w.active).length;
  document.getElementById('totalWorkflows').textContent = total;
  document.getElementById('activeWorkflows').textContent = active;
  document.getElementById('inactiveWorkflows').textContent = total - active;
  document.getElementById('systemStatus').textContent = 'Online';
  document.getElementById('lastSync').textContent = `Synced ${new Date().toLocaleTimeString()}`;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
}

function updateStatsError() {
  document.getElementById('systemStatus').textContent = 'Offline';
<<<<<<< HEAD
  document.getElementById('lastSync').textContent     = 'Failed to sync';
}

function buildWorkflowCard(wf) {
  // Supabase rows: wf.id (UUID), wf.workflow_name, wf.is_active, wf.last_run_at
  const isActive     = wf.is_active || false;
  const displayName  = wf.workflow_name || wf.name || 'Untitled Workflow';
  const installFailed = wf.install_status === 'failed';
=======
  document.getElementById('lastSync').textContent = 'Failed to sync';
}

function buildWorkflowCard(wf) {
  const nodeCount = (wf.nodes || []).length;
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9

  return `
    <div class="wf-card" id="wfcard-${escapeHtml(wf.id)}">
      <div class="wf-header">
        <div class="wf-title-group">
<<<<<<< HEAD
          <h3 title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h3>
          <span class="wf-id">${escapeHtml(String(wf.id))}</span>
        </div>
        <label class="toggle-switch" title="${isActive ? 'Deactivate workflow' : 'Activate workflow'}">
          <input type="checkbox" ${isActive ? 'checked' : ''}
            ${installFailed ? 'disabled' : ''}
            onchange="window._toggleWorkflow('${escapeHtml(wf.id)}', this.checked, '${escapeHtml(displayName).replace(/'/g, "\\'")}', this)">
=======
          <h3 title="${escapeHtml(wf.name)}">${escapeHtml(wf.name)}</h3>
          <span class="wf-id">${escapeHtml(String(wf.id))}</span>
        </div>
        <label class="toggle-switch" title="${wf.active ? 'Deactivate workflow' : 'Activate workflow'}">
          <input type="checkbox" ${wf.active ? 'checked' : ''}
            onchange="window._toggleWorkflow('${escapeHtml(wf.id)}', this.checked, '${escapeHtml(wf.name).replace(/'/g, "\\'")}', this)">
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="wf-meta">
        <div class="meta-item">
          <i class="fas fa-clock"></i>
<<<<<<< HEAD
          <span>Last run ${wf.last_run_at ? formatDate(wf.last_run_at) : 'Never'}</span>
        </div>
        <div class="meta-item">
          <i class="fas fa-tag"></i>
          <span>${escapeHtml(wf.install_status || 'installed')}</span>
=======
          <span>Updated ${formatDate(wf.updatedAt)}</span>
        </div>
        <div class="meta-item">
          <i class="fas fa-cubes"></i>
          <span>${nodeCount} nodes</span>
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
        </div>
      </div>

      <div class="wf-status-row">
<<<<<<< HEAD
        <span class="status-badge ${isActive ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${isActive ? 'Active' : 'Inactive'}
        </span>
        ${installFailed ? `<span class="wf-node-pill" style="color:var(--accent)">Install failed</span>` : ''}
=======
        <span class="status-badge ${wf.active ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${wf.active ? 'Active' : 'Inactive'}
        </span>
        <span class="wf-node-pill">${nodeCount} node${nodeCount !== 1 ? 's' : ''}</span>
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
      </div>

      <div class="wf-actions">
        <button class="wf-btn primary" id="runbtn-${escapeHtml(wf.id)}"
<<<<<<< HEAD
          ${installFailed ? 'disabled' : ''}
          onclick="window._runWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(displayName).replace(/'/g, "\\'")}', this)">
=======
          onclick="window._runWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(wf.name).replace(/'/g, "\\'")}', this)">
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          <i class="fas fa-play"></i> Run
        </button>
        <button class="wf-btn secondary"
          onclick="window.location.hash='/execution/${escapeHtml(wf.id)}'">
          <i class="fas fa-history"></i> History
        </button>
        <button class="wf-btn danger" title="Delete workflow"
<<<<<<< HEAD
          onclick="window._deleteWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(displayName).replace(/'/g, "\\'")}')">
=======
          onclick="window._deleteWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(wf.name).replace(/'/g, "\\'")}')">
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function setupSearch() {
  window._dashboardSearch = (query) => {
<<<<<<< HEAD
    const q        = query.toLowerCase().trim();
    const filtered = q
      ? _allWorkflows.filter(wf =>
          (wf.workflow_name || wf.name || '').toLowerCase().includes(q) ||
          (wf.id  || '').toLowerCase().includes(q)
        )
      : _allWorkflows;

    const grid = document.getElementById('workflowsGrid');
=======
    const q = query.toLowerCase().trim();
    const filtered = q
      ? _allWorkflows.filter(wf =>
          (wf.name || '').toLowerCase().includes(q) ||
          (wf.id || '').toLowerCase().includes(q) ||
          (wf.tags || []).some(t => (t.name || t).toLowerCase().includes(q))
        )
      : _allWorkflows;

    // Re-render only workflow cards, keep onboarding
    const grid = document.getElementById('workflowsGrid');
    // Remove all workflow cards
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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
<<<<<<< HEAD
  const card  = document.getElementById(`wfcard-${id}`);
=======
  const card = document.getElementById(`wfcard-${id}`);
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
  const badge = card?.querySelector('.status-badge');
  if (badge) {
    badge.className = `status-badge ${active ? 'active' : 'inactive'}`;
    badge.innerHTML = `<span class="status-dot"></span>${active ? 'Active' : 'Inactive'}`;
  }

  try {
    await api.toggleWorkflow(id, active);
<<<<<<< HEAD
    // Update local state — Supabase field is is_active
    const wf = _allWorkflows.find(w => String(w.id) === String(id));
    if (wf) wf.is_active = active;
    updateStats(_allWorkflows);
    showToast(`${active ? '✅ Activated' : '⏸ Deactivated'}: ${name}`, active ? 'success' : 'info');
  } catch (err) {
    // Revert UI on failure
=======
    const wf = _allWorkflows.find(w => String(w.id) === String(id));
    if (wf) wf.active = active;
    updateStats(_allWorkflows);
    showToast(`${active ? '✅ Activated' : '⏸ Deactivated'}: ${name}`, active ? 'success' : 'info');
  } catch (err) {
>>>>>>> 46e3002dd9b705655805e515936d52e639fd47c9
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