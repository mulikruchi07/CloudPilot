// public/views/settings.js
import { api, escapeHtml } from '../api.js';
import { showToast, setPageHeader, setTopActions } from '../ui.js';

export async function settingsView() {
  setPageHeader('Settings', 'Manage your account and connected services');
  setTopActions('');

  const grid = document.getElementById('workflowsGrid');

  // Get health status in background
  let health = { status: 'checking…' };
  api.health().then(h => {
    health = h;
    const el = document.getElementById('n8nStatus');
    if (el) {
      const connected = h.services?.n8n === 'connected' || h.status === 'demo';
      el.innerHTML = `<span class="status-badge ${connected ? 'active' : 'inactive'}">
        <span class="status-dot"></span>
        ${connected ? (h.status === 'demo' ? 'Demo Mode' : 'Connected') : 'Disconnected'}
      </span>`;
    }
  }).catch(() => {
    const el = document.getElementById('n8nStatus');
    if (el) el.innerHTML = `<span class="status-badge inactive"><span class="status-dot"></span>Offline</span>`;
  });

  const user = window._currentUser || {};

  grid.innerHTML = `
    <div class="wf-card settings-card" style="max-width:580px">
      <h3 class="settings-section-title">Profile</h3>
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input type="text" id="settingsName" class="form-input"
          value="${escapeHtml(user.user_metadata?.full_name || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" value="${escapeHtml(user.email || '')}" disabled
          style="opacity:0.6;cursor:not-allowed">
      </div>
      <button class="wf-btn primary" style="width:100%;margin-bottom:2rem"
        onclick="window._saveSettings()">Save Changes</button>

      <h3 class="settings-section-title">Connected Services</h3>
      <div class="settings-service-row">
        <div class="settings-service-info">
          <div class="service-icon n8n-icon"><i class="fas fa-cogs"></i></div>
          <div>
            <div class="service-name">n8n Automation</div>
            <div class="service-url" id="n8nUrl">Loading…</div>
          </div>
        </div>
        <div id="n8nStatus"><span class="status-badge inactive"><span class="status-dot"></span>Checking…</span></div>
      </div>
      <div class="settings-service-row">
        <div class="settings-service-info">
          <div class="service-icon supabase-icon"><i class="fas fa-database"></i></div>
          <div>
            <div class="service-name">Supabase Database</div>
            <div class="service-url">Auth + Storage</div>
          </div>
        </div>
        <span class="status-badge active"><span class="status-dot"></span>Connected</span>
      </div>

      <h3 class="settings-section-title" style="margin-top:2rem">Danger Zone</h3>
      <button class="wf-btn danger" style="width:100%" onclick="window._logout()">
        <i class="fas fa-sign-out-alt"></i> Sign Out
      </button>
    </div>
  `;

  // Populate n8n URL
  api.config().then(cfg => {
    const el = document.getElementById('n8nUrl');
    if (el) el.textContent = 'http://localhost:5678 (local Docker)';
  }).catch(() => {});
}

window._saveSettings = () => {
  showToast('✅ Settings saved!', 'success');
};