import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = { /* YOUR WEB CONFIG HERE */ };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let authToken = null;

// PROTECT DASHBOARD: Redirect if not logged in
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        authToken = await user.getIdToken();
        loadWorkflows();
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
    const res = await fetch(url, options);
    return res.json();
}

// LOAD WORKFLOWS INTO GRID
async function loadWorkflows() {
    const data = await apiRequest("/api/workflows");
    const grid = document.getElementById("workflowsGrid");
    const workflows = data.data || [];

    grid.innerHTML = workflows.map(wf => `
        <div class="wf-card">
            <div class="wf-info">
                <h3>${wf.name}</h3>
                <span class="status ${wf.active ? 'active' : 'inactive'}">${wf.active ? 'Active' : 'Stopped'}</span>
            </div>
            <div class="wf-actions">
                <button onclick="runWorkflow('${wf.id}')">▶ Run</button>
                <button onclick="viewTimeline('${wf.id}')">🕓 History</button>
            </div>
        </div>
    `).join('');
}

// TRIGGER RUN
window.runWorkflow = async (id) => {
    const res = await apiRequest(`/api/workflows/${id}/run`, "POST");
    if (res.success) alert("Workflow Started!");
};

// VIEW TIMELINE (Using Modal)
window.viewTimeline = async (id) => {
    const data = await apiRequest(`/api/workflows/${id}/history`);
    const history = data.data || [];

    const timelineHtml = history.map(exec => `
        <div class="timeline-item ${exec.finished ? 'success' : 'failed'}">
            <p><strong>Status:</strong> ${exec.finished ? '✅ Finished' : '❌ Failed'}</p>
            <p><small>${new Date(exec.startedAt).toLocaleString()}</small></p>
        </div>
    `).join('');

    // Open your existing premium modal
    document.getElementById("modalTitle").innerText = "Execution History";
    document.getElementById("modalBody").innerHTML = timelineHtml;
    openModal();
};