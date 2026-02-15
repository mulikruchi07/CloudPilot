# ⚡ CloudPilot Dashboard

CloudPilot is an intelligent cloud automation SaaS platform that allows users to deploy, manage, and monitor pre-built automation workflows across cloud providers like **AWS, GCP, and Azure**.

The platform integrates **n8n workflow automation** with a secure **Supabase backend**, enabling users to:

- Browse workflow templates
- Import automations instantly
- Store cloud credentials securely
- Start/stop workflows
- Monitor real-time execution history

---

## 🚀 Features

### 📦 Workflow Template Marketplace
- Predefined JSON workflow templates stored in Supabase
- Categories like AWS Storage, IAM Security, Monitoring, Backups
- One-click import into user workspace

### 🔐 Credential Vault System
- Users can securely store cloud credentials (AWS/GCP/Azure)
- Credential encryption support
- Credentials can be selected during workflow creation

### ⚙ Workflow Lifecycle Management
- Create workflows from templates
- Start / Stop workflow execution
- Track workflow status (Active / Inactive)

### 📊 Execution Monitoring + Timeline
- Execution logs stored in Supabase
- Real-time execution timeline UI (like automation platforms)
- Tracks node execution progress, failures, duration

### 🧩 Supabase Powered SaaS Backend
- Authentication (Login/Signup)
- User profile management
- Database tables for templates, workflows, executions, credentials

---

## 🏗 Tech Stack

| Layer        | Technology |
|-------------|------------|
| Frontend     | HTML, CSS, Vanilla JavaScript |
| Backend      | Node.js + Express |
| Database     | Supabase PostgreSQL |
| Auth         | Supabase Auth |
| Workflow Engine | n8n Automation Platform |
| Hosting      | Vercel / Render (Planned) |


