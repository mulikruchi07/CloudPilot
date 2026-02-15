import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 4000;

// ===================================
// N8N CONFIGURATION
// ===================================
const N8N_URL = process.env.N8N_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_API_BASE = process.env.N8N_API_PATH || "/api/v1";

// ===================================
// SUPABASE CONFIGURATION
// ===================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`🔧 Server Configuration:`);
console.log(`   Port: ${PORT}`);
console.log(`   N8N URL: ${N8N_URL}`);
console.log(`   N8N API Path: ${N8N_API_BASE}`);
console.log(`   N8N API Key: ${N8N_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   Supabase URL: ${SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`   Supabase Anon Key: ${SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   Supabase Service Key: ${SUPABASE_SERVICE_ROLE_KEY ? '✅ Set (PROTECTED)' : '❌ Missing'}`);

// ===================================
// HELPER FUNCTIONS
// ===================================
const getAuthHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (N8N_API_KEY) {
    headers["X-N8N-API-KEY"] = N8N_API_KEY;
  }

  return headers;
};

const proxyN8nRequest = async (path, method = "GET", body = null) => {
  const url = `${N8N_URL}${N8N_API_BASE}${path}`;

  console.log(`📡 ${method} ${url}`);

  try {
    const options = {
      method,
      headers: getAuthHeaders(),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    console.log(`   ↳ Status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`   ↳ Error: ${text}`);
      throw new Error(`n8n API Error (${res.status}): ${text}`);
    }

    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }

    return { success: true };
  } catch (err) {
    console.error(`❌ Request failed:`, err.message);
    throw err;
  }
};

// ===================================
// 🔒 CONFIGURATION ENDPOINT (SECURE)
// ===================================
// This endpoint safely exposes ONLY public credentials to the frontend
app.get("/api/config", (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({
      error: "Server configuration incomplete",
      message: "SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file"
    });
  }

  res.json({
    supabase: {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY
      // ⚠️ NEVER send SUPABASE_SERVICE_ROLE_KEY to frontend!
    }
  });
});

// ===================================
// HEALTH CHECK
// ===================================
app.get("/api/health", async (req, res) => {
  try {
    // Test connection to n8n
    await proxyN8nRequest("/workflows?limit=1");
    res.json({
      status: "healthy",
      services: {
        n8n: "connected",
        supabase: SUPABASE_URL ? "configured" : "not configured"
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: "unhealthy",
      services: {
        n8n: "disconnected",
        supabase: SUPABASE_URL ? "configured" : "not configured"
      },
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ===================================
// WORKFLOWS ENDPOINTS
// ===================================

// 🟢 GET all workflows
app.get("/api/workflows", async (req, res) => {
  try {
    const data = await proxyN8nRequest("/workflows");
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching workflows:", err.message);
    res.status(500).json({
      error: "Failed to fetch workflows from n8n",
      details: err.message,
      troubleshooting: {
        apiKey: N8N_API_KEY ? "Set" : "Missing - Add N8N_API_KEY to .env",
        url: N8N_URL,
        apiPath: N8N_API_BASE,
        suggestion: "Try changing N8N_API_PATH to '/rest' if using older n8n version"
      }
    });
  }
});

// 🔵 GET single workflow
app.get("/api/workflows/:id", async (req, res) => {
  try {
    const data = await proxyN8nRequest(`/workflows/${req.params.id}`);
    res.json(data);
  } catch (err) {
    console.error(`❌ Error fetching workflow ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🟢 CREATE new workflow
app.post("/api/workflows", async (req, res) => {
  try {
    const workflowData = {
      name: req.body.name || "New Workflow",
      nodes: req.body.nodes || [],
      connections: req.body.connections || {},
      settings: req.body.settings || {},
      staticData: req.body.staticData || null,
      tags: req.body.tags || []
    };

    const data = await proxyN8nRequest("/workflows", "POST", workflowData);
    res.json(data);
  } catch (err) {
    console.error("❌ Error creating workflow:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔵 UPDATE workflow
app.patch("/api/workflows/:id", async (req, res) => {
  try {
    const data = await proxyN8nRequest(`/workflows/${req.params.id}`, "PATCH", req.body);
    res.json(data);
  } catch (err) {
    console.error(`❌ Error updating workflow ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔴 DELETE workflow
app.delete("/api/workflows/:id", async (req, res) => {
  try {
    await proxyN8nRequest(`/workflows/${req.params.id}`, "DELETE");
    res.json({ success: true, message: "Workflow deleted successfully" });
  } catch (err) {
    console.error(`❌ Error deleting workflow ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ▶️ RUN workflow
app.post("/api/workflows/:id/run", async (req, res) => {
  try {
    const data = await proxyN8nRequest(`/workflows/${req.params.id}/run`, "POST", req.body);
    res.json({
      success: true,
      message: "Workflow execution started",
      execution: data
    });
  } catch (err) {
    console.error(`❌ Error running workflow ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔄 TOGGLE workflow active status
app.post("/api/workflows/:id/toggle", async (req, res) => {
  try {
    const { active } = req.body;

    // First get the workflow
    const workflow = await proxyN8nRequest(`/workflows/${req.params.id}`);

    // Update with new active status
    workflow.active = active;

    const data = await proxyN8nRequest(`/workflows/${req.params.id}`, "PATCH", workflow);
    res.json(data);
  } catch (err) {
    console.error(`❌ Error toggling workflow ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===================================
// EXECUTIONS ENDPOINTS
// ===================================

// 📊 GET all executions for a workflow
app.get("/api/workflows/:id/executions", async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const data = await proxyN8nRequest(`/executions?workflowId=${req.params.id}&limit=${limit}`);
    res.json(data);
  } catch (err) {
    console.error(`❌ Error fetching executions for ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Alias for history endpoint (used by frontend)
app.get("/api/workflows/:id/history", async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const data = await proxyN8nRequest(`/executions?workflowId=${req.params.id}&limit=${limit}`);
    res.json(data);
  } catch (err) {
    console.error(`❌ Error fetching history for ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 📊 GET single execution details
app.get("/api/executions/:id", async (req, res) => {
  try {
    const data = await proxyN8nRequest(`/executions/${req.params.id}`);
    res.json(data);
  } catch (err) {
    console.error(`❌ Error fetching execution ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔴 DELETE execution
app.delete("/api/executions/:id", async (req, res) => {
  try {
    await proxyN8nRequest(`/executions/${req.params.id}`, "DELETE");
    res.json({ success: true, message: "Execution deleted successfully" });
  } catch (err) {
    console.error(`❌ Error deleting execution ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===================================
// CREDENTIALS ENDPOINTS (for future use)
// ===================================

// 🔑 GET all credentials
app.get("/api/credentials", async (req, res) => {
  try {
    const data = await proxyN8nRequest("/credentials");
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching credentials:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔑 CREATE credential
app.post("/api/credentials", async (req, res) => {
  try {
    const data = await proxyN8nRequest("/credentials", "POST", req.body);
    res.json(data);
  } catch (err) {
    console.error("❌ Error creating credential:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===================================
// TEMPLATE MANAGEMENT
// ===================================

// 📦 Import workflow template
app.post("/api/templates/import", async (req, res) => {
  try {
    const { template, userId, credentials } = req.body;

    // 1. Create workflow from template
    const workflow = await proxyN8nRequest("/workflows", "POST", template);

    // 2. If credentials provided, inject them
    if (credentials && workflow.id) {
      // Store mapping in your database here
      // user_workflows.insert({ user_id, workflow_id, settings: credentials })
    }

    res.json({
      success: true,
      workflow,
      message: "Template imported successfully"
    });
  } catch (err) {
    console.error("❌ Error importing template:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===================================
// ERROR HANDLER
// ===================================
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message
  });
});

// ===================================
// START SERVER
// ===================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║         CloudPilot Backend Server Running              ║
╠════════════════════════════════════════════════════════╣
║  🌐 Port:              ${PORT}                                ║
║  🔧 N8N URL:           ${N8N_URL}            ║
║  🔑 Supabase:          ${SUPABASE_URL ? '✅ Configured' : '❌ Not configured'}              ║
╠════════════════════════════════════════════════════════╣
║  📋 Key Endpoints:                                     ║
║     GET  /api/config                                   ║
║     GET  /api/health                                   ║
║     GET  /api/workflows                                ║
║     POST /api/workflows/:id/run                        ║
║     GET  /api/workflows/:id/history                    ║
╚════════════════════════════════════════════════════════╝

🔗 Test health: http://localhost:${PORT}/api/health
🔗 Test config:  http://localhost:${PORT}/api/config
  `);
});