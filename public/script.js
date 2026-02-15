import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ============================================================
// IMPORTANT: CONFIGURE YOUR SUPABASE CREDENTIALS HERE
// ============================================================
// Get these from: https://app.supabase.com/project/_/settings/api
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
// ============================================================

// Validate Supabase configuration
if (!SUPABASE_URL || SUPABASE_URL === 'https://pzrvxyhxfwagexrbisfa.supabase.co' ||
    !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6cnZ4eWh4ZndhZ2V4cmJpc2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDE4NTUsImV4cCI6MjA4NjUxNzg1NX0.egQt4OZ7qKzXepeSM0pf3LZ8N_Qh4AhT8Mu00NSYEA0') {
    console.error('❌ Supabase configuration missing!');
    console.error('📝 Please update SUPABASE_URL and SUPABASE_ANON_KEY in script.js');
    console.error('🔗 Get your credentials from: https://app.supabase.com/project/_/settings/api');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authToken = null;

// PROTECT DASHBOARD & INITIALIZE
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

            // Load workflows
            loadWorkflows();
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

// AUTHENTICATED FETCH HELPER
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

// LOAD WORKFLOWS INTO GRID
async function loadWorkflows() {
    const grid = document.getElementById("workflowsGrid");

    if (!grid) {
        console.error('workflowsGrid element not found');
        return;
    }

    try {
        const data = await apiRequest("/api/workflows");
        const workflows = data.data || [];

        // Update stats
        const totalCount = workflows.length;
        const activeCount = workflows.filter(wf => wf.active).length;
        const inactiveCount = totalCount - activeCount;

        document.getElementById('totalWorkflows').textContent = totalCount;
        document.getElementById('activeWorkflows').textContent = activeCount;
        document.getElementById('inactiveWorkflows').textContent = inactiveCount;
        document.getElementById('systemStatus').textContent = totalCount > 0 ? 'Online' : 'Offline';
        document.getElementById('lastSync').textContent = `Last sync: ${new Date().toLocaleTimeString()}`;

        if (workflows.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-project-diagram"></i>
                    <h3>No workflows found</h3>
                    <p>Start by creating your first automation workflow or sync with the server</p>
                    <button class="btn-create" onclick="loadWorkflows()">
                        <i class="fas fa-sync-alt"></i>
                        Sync Workflows
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
                    <button class="wf-btn primary" onclick="runWorkflow('${escapeHtml(wf.id)}')">
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
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// TRIGGER RUN
window.runWorkflow = async (id) => {
    try {
        const res = await apiRequest(`/api/workflows/${id}/run`, "POST");
        if (res.success) {
            alert("Workflow Started Successfully!");
            loadWorkflows(); // Refresh the list
        }
    } catch (err) {
        console.error('Run workflow error:', err);
        alert("Error starting workflow. Please try again.");
    }
};

// VIEW HISTORY
window.viewTimeline = async (id) => {
    try {
        const data = await apiRequest(`/api/workflows/${id}/history`);
        const history = data.data || [];

        const timelineHtml = history.length > 0 ? history.map(exec => `
            <div class="timeline-item ${exec.finished ? 'success' : 'failed'}">
                <p>Status: ${exec.finished ? '✅ Finished' : '❌ Failed'}</p>
                <p><small>${new Date(exec.startedAt).toLocaleString()}</small></p>
            </div>
        `).join('') : '<p class="empty-timeline">No execution history found.</p>';

        const modalTitle = document.getElementById("modalTitle");
        const modalBody = document.getElementById("modalBody");
        const modal = document.getElementById('modal');

        if (modalTitle) modalTitle.innerText = "Execution History";
        if (modalBody) modalBody.innerHTML = timelineHtml;
        if (modal) modal.classList.add('active');
    } catch (err) {
        console.error('View timeline error:', err);
        alert("Error loading history. Please try again.");
    }
};

window.closeModal = () => {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('active');
};

window.logout = async () => {
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.error('Logout error:', err);
        // Force redirect even on error
        window.location.href = "login.html";
    }
};

// Placeholder for new workflow creation
window.openNewWorkflow = () => {
    alert('New workflow creation coming soon! This will open a workflow builder interface.');
};

// Initialize on page load
init();