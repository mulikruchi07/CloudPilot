// script.js - Enhanced with dynamic views
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Get config from backend
const configResponse = await fetch('/api/config');
const config = await configResponse.json();
let currentViewMode = "grid"; // grid or list

let currentWorkflowFilter = "all";
// all | active | inactive | recent

let currentTemplateFilter = "all";
// all | aws | gcp | azure

const supabase = createClient(config.supabase.url, config.supabase.anonKey);
window.supabase = supabase;

let authToken = null;
let currentUser = null;
let allWorkflowsData = [];
let allTemplatesData = [];


// ============================================================
// AUTHENTICATION & INITIALIZATION
// ============================================================
async function init() {
    const loadingOverlay = document.getElementById('loadingOverlay');

    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Session error:', error);
            window.location.href = "login.html";
            return;
        }

        if (!session) {
            window.location.href = "login.html";
        } else {
            authToken = session.access_token;
            currentUser = session.user;

            // Update user profile UI
            const user = session.user;
            if (user) {
                const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
                const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

                document.getElementById('userName').textContent = fullName;
                document.getElementById('userEmail').textContent = user.email;
                document.getElementById('userAvatar').textContent = initials;
            }

            // Hide loading overlay
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }

            // Load initial view based on hash or default to dashboard
            const hash = window.location.hash.slice(1) || 'dashboard';
            switchView(hash);
        }
    } catch (err) {
        console.error('Initialization error:', err);
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
    }
}

// Global Auth Listener
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = "login.html";
    } else if (session) {
        authToken = session.access_token;
    }
});

// ============================================================
// VIEW MANAGEMENT
// ============================================================
function switchView(viewName) {
    // Update URL hash
    window.location.hash = viewName;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Find and activate the clicked nav item
    const activeNav = Array.from(document.querySelectorAll('.nav-item')).find(item => {
        const span = item.querySelector('span');
        return span && span.textContent.toLowerCase().includes(viewName.toLowerCase());
    });
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // Update page header
    const headers = {
        'dashboard': { title: 'Workflow Dashboard', subtitle: 'Manage and monitor your automation workflows' },
        'templates': { title: '📦 Templates', subtitle: 'Browse and import pre-built automation templates' },
        'credentials': { title: '🔐 Credentials', subtitle: 'Manage your cloud credentials securely' },
        'workflows': { title: 'My Workflows', subtitle: 'All your automation workflows in one place' },
        'settings': { title: '⚙️ Settings', subtitle: 'Manage your account and preferences' }
    };

    const header = headers[viewName] || headers['dashboard'];
    document.querySelector('.page-header h1').textContent = header.title;
    document.querySelector('.page-header p').textContent = header.subtitle;

    // Update top actions
    updateTopActions(viewName);

    // Load content
    loadViewContent(viewName);
    setupSearch(viewName);

}

function updateTopActions(viewName) {
    const topActions = document.querySelector('.top-actions');

    if (viewName === 'credentials') {
        topActions.innerHTML = `
            <button class="btn-create" onclick="showAddCredentialModal()">
                <i class="fas fa-plus"></i>
                Add Credential
            </button>
        `;
    } else if (viewName === 'templates') {
        topActions.innerHTML = `
            <div class="search-wrapper">
                <i class="fas fa-search"></i>
                <input type="text" id="searchInput" placeholder="Search templates...">
            </div>
        `;
    } else {
        topActions.innerHTML = `
            <div class="search-wrapper">
                <i class="fas fa-search"></i>
                <input type="text" id="searchInput" placeholder="Search workflows...">
            </div>
            <button class="filter-btn">
                <i class="fas fa-filter"></i>
                Filters
            </button>
            <button class="btn-create" onclick="showNewWorkflowModal()">
                <i class="fas fa-plus"></i>
                New Workflow
            </button>
        `;
    }
}

function loadViewContent(viewName) {
    switch(viewName) {
        case 'dashboard':
        case 'workflows':
            loadWorkflows();
            break;
        case 'templates':
            loadTemplates();
            break;
        case 'credentials':
            loadCredentials();
            break;
        case 'settings':
            showSettings();
            break;
        default:
            loadWorkflows();
    }
}

// ============================================================
// NAVIGATION SETUP
// ============================================================
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        const span = this.querySelector('span');
        if (!span) return;

        const text = span.textContent.trim().toLowerCase();

        // Handle special cases
        if (text.includes('sync')) {
            syncData();
            return;
        }

        // Map text to view names
        const viewMap = {
            'dashboard': 'dashboard',
            'templates': 'templates',
            'credentials': 'credentials',
            'workflows': 'workflows',
            'my workflows': 'workflows',
            'settings': 'settings',
            'data sources': 'datasources'
        };

        const viewName = viewMap[text] || 'dashboard';
        switchView(viewName);
    });
});

function syncData() {
    const btn = document.querySelector('.nav-item:has(span:contains("Sync"))');
    const icon = btn?.querySelector('i');
    if (icon) icon.classList.add('fa-spin');

    loadWorkflows().then(() => {
        setTimeout(() => {
            if (icon) icon.classList.remove('fa-spin');
            showNotification('✅ Data synced successfully!');
        }, 1000);
    });
}

// ============================================================
// API HELPER
// ============================================================
async function apiRequest(url, method = "GET", body = null) {
    const options = {
        method,
        headers: {
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
        }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API Request Failed: ${res.status} - ${errorText}`);
        }
        return res.json();
    } catch (err) {
        console.error('API Request Error:', err);
        throw err;
    }
}

// ============================================================
// LOAD WORKFLOWS
// ============================================================
window.loadWorkflows = async function() {
    const grid = document.getElementById("workflowsGrid");

    if (!grid) {
        console.error('workflowsGrid element not found');
        return;
    }

    try {
        const data = await apiRequest("/api/workflows");
        const workflows = data.data || [];
        allWorkflowsData = workflows;


        // Update stats
        const totalCount = workflows.length;
        const activeCount = workflows.filter(wf => wf.active).length;
        const inactiveCount = totalCount - activeCount;

        document.getElementById('totalWorkflows').textContent = totalCount;
        document.getElementById('activeWorkflows').textContent = activeCount;
        document.getElementById('inactiveWorkflows').textContent = inactiveCount;
        document.getElementById('systemStatus').textContent = totalCount > 0 ? 'Online' : 'Offline';
        document.getElementById('lastSync').textContent = `Last sync: ${new Date().toLocaleTimeString()}`;

        displayWorkflows(workflows);
        setupSearch("dashboard");

    } catch (err) {
        console.error('Load workflows error:', err);
        document.getElementById('systemStatus').textContent = 'Error';
        document.getElementById('lastSync').textContent = 'Failed to sync';
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load workflows</h3>
                <p>Please check your connection and try again</p>
                <button class="btn-create" onclick="loadWorkflows()">
                    <i class="fas fa-sync-alt"></i>
                    Retry
                </button>
            </div>
        `;
    }
};

function displayWorkflows(workflows) {
    const grid = document.getElementById("workflowsGrid");

    if (workflows.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-project-diagram"></i>
                <h3>No workflows found</h3>
                <p>Import a template to get started</p>
                <button class="btn-create" onclick="switchView('templates')">
                    <i class="fas fa-boxes"></i>
                    Browse Templates
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = workflows.map(wf => `
        <div class="wf-card">
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
                    <span>Last run: ${wf.lastRun ? new Date(wf.lastRun).toLocaleDateString() : 'Never'}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-check-circle"></i>
                    <span>${wf.executions || 0} executions</span>
                </div>
            </div>
            <div class="wf-actions">
                <button class="wf-btn primary" onclick="runWorkflow('${escapeHtml(wf.id)}', '${escapeHtml(wf.name)}')">
                    <i class="fas fa-play"></i>
                    Run
                </button>
                <button class="wf-btn secondary" onclick="viewTimeline('${escapeHtml(wf.id)}')">
                    <i class="fas fa-history"></i>
                    History
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// TEMPLATES
// ============================================================
async function loadTemplates() {
    const grid = document.getElementById('workflowsGrid');

    try {
        const { data: templates, error } = await supabase
            .from('workflow_templates')
            .select('*')
            .eq('is_active', true)
            .order('popularity', { ascending: false });

        if (error) throw error;

        allTemplatesData = templates || [];
displayTemplates(allTemplatesData);
setupSearch("templates");

    } catch (error) {
        console.error('Load templates error:', error);
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load templates</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function displayTemplates(templates) {
    const grid = document.getElementById('workflowsGrid');

    if (templates.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-boxes"></i>
                <h3>No templates available</h3>
                <p>Templates will appear here once added</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = templates.map(t => `
        <div class="wf-card">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 1rem;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, var(--primary), #818cf8); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">
                    <i class="${t.icon || 'fas fa-cog'}"></i>
                </div>
                <div>
                    <h3 style="font-weight: 700; font-size: 17px; margin-bottom: 4px;">${escapeHtml(t.name)}</h3>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">
                        ${escapeHtml(t.category || 'General')}
                    </div>
                </div>
            </div>

            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">
                ${escapeHtml(t.description || 'No description')}
            </p>

            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 1rem;">
                ${(t.tags || []).slice(0, 3).map(tag => `
                    <span style="font-size: 11px; padding: 4px 10px; background: var(--bg-secondary); border-radius: 6px; color: var(--text-muted); font-weight: 600;">
                        ${escapeHtml(tag)}
                    </span>
                `).join('')}
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 1rem; font-size: 13px;">
                <strong>Required:</strong>
                ${parseCredentials(t.required_credentials).map(c => `
                    <span style="display: inline-block; margin-left: 8px; padding: 3px 8px; background: var(--primary); color: white; border-radius: 4px; font-size: 11px; font-weight: 700;">
                        ${c.toUpperCase()}
                    </span>
                `).join('')}
            </div>

            <button class="wf-btn primary" onclick="importTemplate('${t.id}', '${escapeHtml(t.name)}')" style="width: 100%;">
                <i class="fas fa-download"></i> Import Template
            </button>
        </div>
    `).join('');
}

function parseCredentials(creds) {
    if (Array.isArray(creds)) return creds;
    if (typeof creds === 'string') {
        try { return JSON.parse(creds); } catch { return [creds]; }
    }
    return [];
}

window.importTemplate = async function(templateId, templateName) {
    if (!confirm(`Import "${templateName}"?`)) return;

    try {
        const response = await fetch('/api/templates/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                template_id: templateId,
                workflow_name: templateName,
                credential_mappings: {}
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('✅ Template imported successfully!');
            switchView('dashboard');
        } else {
            throw new Error(result.error || 'Import failed');
        }
    } catch (error) {
        showNotification('❌ Error: ' + error.message);
    }
};

// ============================================================
// CREDENTIALS
// ============================================================
async function loadCredentials() {
    const grid = document.getElementById('workflowsGrid');

    try {
        const { data, error } = await supabase
            .from('user_credentials')
            .select('*')
            .eq('is_valid', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        displayCredentials(data || []);
    } catch (error) {
        console.error('Load credentials error:', error);
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load credentials</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function displayCredentials(creds) {
    const grid = document.getElementById('workflowsGrid');

    if (creds.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-key"></i>
                <h3>No credentials yet</h3>
                <p>Add your first credential to get started</p>
                <button class="btn-create" onclick="showAddCredentialModal()">
                    <i class="fas fa-plus"></i> Add Credential
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = creds.map(c => `
        <div class="wf-card">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 1rem;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, var(--primary), #818cf8); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">
                    <i class="fab fa-${getCredIcon(c.credential_type)}"></i>
                </div>
                <div>
                    <h3 style="font-weight: 700; font-size: 17px; margin-bottom: 4px;">${escapeHtml(c.credential_name)}</h3>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">
                        ${c.credential_type.toUpperCase()}
                    </div>
                </div>
            </div>

            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 1rem;">
                Added: ${new Date(c.created_at).toLocaleDateString()}
            </div>

            <button class="wf-btn primary" onclick="deleteCredential('${c.id}', '${escapeHtml(c.credential_name)}')" style="width: 100%; background: rgba(239, 68, 68, 0.1); color: var(--accent);">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `).join('');
}

function getCredIcon(type) {
    const icons = { aws: 'aws', gcp: 'google', azure: 'microsoft' };
    return icons[type] || 'key';
}

// ============================================================
// SETTINGS
// ============================================================
function showSettings() {
    const grid = document.getElementById('workflowsGrid');
    grid.innerHTML = `
        <div class="wf-card" style="max-width: 600px;">
            <h3 style="margin-bottom: 1rem; font-size: 20px;">Account Settings</h3>
            <div style="margin-bottom: 1rem;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Full Name</label>
                <input type="text" id="settingsName" value="${currentUser?.user_metadata?.full_name || ''}" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--border); font-family: inherit;">
            </div>
            <div style="margin-bottom: 1rem;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Email</label>
                <input type="email" value="${currentUser?.email || ''}" disabled style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--border); font-family: inherit; background: var(--bg-secondary);">
            </div>
            <button class="wf-btn primary" onclick="showNotification('✅ Settings saved!')" style="width: 100%;">
                Save Changes
            </button>
        </div>
    `;
}

// ============================================================
// MODALS & HELPERS
// ============================================================
window.showNewWorkflowModal = function() {
    showModal('New Workflow', `
        <p style="margin-bottom: 1rem;">Choose how you want to create your workflow:</p>
        <button class="wf-btn primary" onclick="switchView('templates'); closeModal()" style="width: 100%; margin-bottom: 8px;">
            <i class="fas fa-boxes"></i> Import from Template
        </button>
        <button class="wf-btn secondary" onclick="window.open('http://localhost:5678', '_blank'); closeModal()" style="width: 100%;">
            <i class="fas fa-file"></i> Create Blank Workflow
        </button>
    `);
};

window.showAddCredentialModal = function() {
    showModal('Add Credential', `
        <p style="margin-bottom: 1rem; color: var(--text-muted);">Feature coming soon! Credentials management will be available here.</p>
        <button class="wf-btn primary" onclick="closeModal()" style="width: 100%;">Close</button>
    `);
};

function showModal(title, content) {
    const modal = document.getElementById('modal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    modal.classList.add('active');
}

window.closeModal = function() {
    document.getElementById('modal').classList.remove('active');
};

window.viewTimeline = async function(id) {
    try {
        const data = await apiRequest(`/api/workflows/${id}/history`);
        const history = data.data || [];

        const timelineHtml = history.length > 0 ? history.map(exec => `
            <div class="timeline-item ${exec.finished ? 'success' : 'failed'}">
                <p><strong>Status:</strong> ${exec.finished ? '✅ Finished' : '❌ Failed'}</p>
                <p><small>${new Date(exec.startedAt).toLocaleString()}</small></p>
            </div>
        `).join('') : '<p class="empty-timeline">No execution history found.</p>';

        showModal('Execution History', timelineHtml);
    } catch (err) {
        showNotification('❌ Error loading history');
    }
};

window.runWorkflow = async function(id, name) {
    if (!confirm(`Run workflow: ${name}?`)) return;

    try {
        const res = await apiRequest(`/api/workflows/${id}/run`, "POST");
        if (res.success) {
            showNotification('✅ Workflow started successfully!');
            loadWorkflows();
        }
    } catch (err) {
        showNotification('❌ Error: ' + err.message);
    }
};

window.logout = async function() {
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.error('Logout error:', err);
        window.location.href = "login.html";
    }
};

window.openNewWorkflow = function() {
    showNewWorkflowModal();
};

function showNotification(message) {
    alert(message); // Replace with toast notification if you prefer
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on page load
init();

// Handle browser back/forward
window.addEventListener('hashchange', () => {
    const view = window.location.hash.slice(1) || 'dashboard';
    switchView(view);
});
function setupSearch(viewName) {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  // Reset old listener
  searchInput.oninput = null;

  // Helper: Expand workflow keywords
  function getWorkflowSearchText(wf) {
    return `
      ${wf.name || ""}
      ${wf.id || ""}
      ${wf.category || ""}
      ${wf.description || ""}
      ${wf.tags?.join(" ") || ""}
      ${wf.provider || ""}
    `.toLowerCase();
  }

  // Helper: Expand template keywords
  function getTemplateSearchText(t) {
    return `
      ${t.name || ""}
      ${t.category || ""}
      ${t.description || ""}
      ${(t.tags || []).join(" ")}
      ${(t.required_credentials || []).join(" ")}
    `.toLowerCase();
  }

  // Keyword Mapping (AWS = Amazon etc.)
  const aliasMap = {
    amazon: "aws",
    google: "gcp",
    microsoft: "azure",
    storage: "s3 bucket gcs",
    security: "iam audit",
    compute: "ec2 vm",
    backup: "s3 sync",
    monitoring: "cloudwatch alerts"
  };

  searchInput.oninput = () => {
    let query = searchInput.value.toLowerCase().trim();

    // Expand aliases
    if (aliasMap[query]) {
      query += " " + aliasMap[query];
    }

    // WORKFLOWS SEARCH
    if (viewName === "dashboard" || viewName === "workflows") {
      const filtered = allWorkflowsData.filter(wf =>
        getWorkflowSearchText(wf).includes(query)
      );

      displayWorkflows(filtered);
    }

    // TEMPLATES SEARCH
    if (viewName === "templates") {
      const filtered = allTemplatesData.filter(t =>
        getTemplateSearchText(t).includes(query)
      );

      displayTemplates(filtered);
    }
  };
}
