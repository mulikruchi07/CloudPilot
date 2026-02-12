import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // Serves your HTML files

// Initialize Firebase Admin with your Service Account
import serviceAccount from "./firebase-config.json" assert { type: "json" };
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Middleware to verify user token
const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).send("Unauthorized");
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).send("Invalid Token");
  }
};

// 1. Log Workflow Execution to Firestore
app.post("/api/workflows/:id/run", checkAuth, async (req, res) => {
  const workflowId = req.params.id;
  try {
    // Trigger n8n
    const n8nRes = await fetch(`${process.env.N8N_URL}/api/v1/workflows/${workflowId}/run`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" }
    });
    const n8nData = await n8nRes.json();

    // SAVE LOG TO FIRESTORE (Collection: executions)
    await db.collection("executions").add({
      userId: req.user.uid,
      workflowId: workflowId,
      status: "triggered",
      executionId: n8nData.id || "manual-run",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, n8nData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Fetch History from Firestore for Timeline
app.get("/api/workflows/:id/timeline", checkAuth, async (req, res) => {
  try {
    const snapshot = await db.collection("executions")
      .where("userId", "==", req.user.uid)
      .where("workflowId", "==", req.params.id)
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(4000, () => console.log("🚀 Server with Firestore ready on port 4000"));

const n8nApiUrl = `${process.env.N8N_URL}/api/v1`;
const getAuthHeaders = () => ({
  "X-N8N-API-KEY": process.env.N8N_API_KEY,
  "Content-Type": "application/json",
});

// GET WORKFLOWS
app.get("/api/workflows", checkAuth, async (req, res) => {
  try {
    const response = await fetch(`${n8nApiUrl}/workflows`, { headers: getAuthHeaders() });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RUN WORKFLOW + LOG TO DB
app.post("/api/workflows/:id/run", checkAuth, async (req, res) => {
  const workflowId = req.params.id;
  try {
    // 1. Trigger n8n
    const n8nRes = await fetch(`${n8nApiUrl}/workflows/${workflowId}/run`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    const n8nData = await n8nRes.json();

    // 2. Log Execution to Firestore for Timeline
    await db.collection("executions").add({
      userId: req.user.uid,
      workflowId: workflowId,
      status: "triggered",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, n8nData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET TIMELINE (From n8n + DB logs)
app.get("/api/workflows/:id/history", checkAuth, async (req, res) => {
  try {
    const response = await fetch(`${n8nApiUrl}/executions?filter[workflowId]=${req.params.id}`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(4000, () => console.log("🚀 CloudPilot Backend at http://localhost:4000"));