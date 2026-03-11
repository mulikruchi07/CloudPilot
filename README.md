# ☁️ CloudPilot - Cloud Workflow Automation SaaS

A modern, full-featured SaaS platform for automating cloud infrastructure workflows using n8n and Supabase.

## 🌟 Features

### ✅ Completed Features
- **User Authentication** - Secure signup/login with Supabase Auth
- **Dashboard** - Real-time stats and execution monitoring
- **Workflow Management** - Create, edit, run, and delete workflows
- **Template Marketplace** - Browse and import pre-built workflow templates
- **Credentials Management** - Secure encrypted storage for cloud credentials (AWS, GCP, Azure)
- **Execution History** - Timeline view of all workflow executions
- **User Settings** - Profile management and password changes
- **Multi-Cloud Support** - AWS, GCP, Azure, and Kubernetes

### 🔒 Security Features
- AES-256-GCM encryption for credentials
- Row-Level Security (RLS) in Supabase
- JWT-based authentication
- Secure credential injection into workflows
- Environment-based configuration

### 📊 Dynamic UI Features
- Real-time execution statistics
- Interactive workflow cards
- Searchable and filterable views
- Modal-based forms
- Toast notifications
- Timeline execution history
- Responsive design

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Supabase account
- n8n instance (local or cloud)

### Installation

1. **Clone the repository**
```bash
cd cloudpilot-complete
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
# Copy the example env file
cp .env.example .env

# Generate encryption key
npm run generate-key

# Edit .env and add:
# - Generated encryption key
# - Supabase credentials
# - N8N URL and API key
```

4. **Setup database**
```bash
# Go to Supabase SQL Editor
# Run the script: scripts/schema.sql
```

5. **Start the server**
```bash
npm start
# or for development with auto-reload:
npm run dev
```

6. **Open the application**
```
http://localhost:4000
```

## 📁 Project Structure

```
cloudpilot-complete/
├── public/
│   ├── index.html          # Main HTML file with UI
│   └── app.js              # Frontend JavaScript
├── routes/
│   ├── credentials.js      # Credential management APIs
│   ├── settings.js         # User settings APIs
│   └── executions.js       # Execution tracking APIs
├── utils/
│   ├── auth.js             # Authentication middleware
│   └── encryption.js       # Encryption utilities
├── scripts/
│   └── schema.sql          # Database schema
├── server.js               # Main Express server
├── package.json
├── .env.example
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 4000) | No |
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `N8N_URL` | N8N instance URL | Yes |
| `N8N_API_KEY` | N8N API key | Yes |
| `ENCRYPTION_KEY` | 64-char hex encryption key | Yes |

### Generating Encryption Key

```bash
npm run generate-key
```

Copy the output to your `.env` file under `ENCRYPTION_KEY`.

## 📚 API Documentation

### Authentication
All API routes (except `/api/config` and `/api/health`) require Bearer token authentication.

```javascript
headers: {
  'Authorization': 'Bearer YOUR_TOKEN'
}
```

### Endpoints

#### Credentials
- `GET /api/credentials` - List user credentials
- `POST /api/credentials` - Add new credential
- `GET /api/credentials/:id` - Get credential details
- `PUT /api/credentials/:id` - Update credential
- `DELETE /api/credentials/:id` - Delete credential
- `POST /api/credentials/:id/test` - Test credential connection

#### Settings
- `GET /api/settings/profile` - Get user profile
- `POST /api/settings/profile` - Update profile
- `POST /api/settings/password` - Change password
- `POST /api/settings/email` - Update email
- `POST /api/settings/notifications` - Update notification preferences

#### Executions
- `POST /api/executions` - Create execution record
- `GET /api/executions/recent` - Get recent executions
- `GET /api/executions/stats` - Get execution statistics
- `GET /api/executions/:id` - Get execution details
- `DELETE /api/executions/:id` - Delete execution
- `POST /api/executions/:id/retry` - Retry failed execution
- `GET /api/workflows/:id/history` - Get workflow execution history

#### Workflows
- `GET /api/workflows` - List workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/:id` - Get workflow details
- `PATCH /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow
- `POST /api/workflows/:id/run` - Execute workflow

#### Templates
- `POST /api/templates/import` - Import template

## 🎨 UI Components

### Dashboard
- Execution statistics cards
- Recent executions table
- Quick action buttons

### Workflows View
- Workflow cards with actions
- Search and filter
- Run, view details, and delete options

### Templates View
- Template marketplace
- Category filtering
- One-click import

### Credentials View
- Secure credential management
- Provider-specific forms (AWS, GCP, Azure)
- Test connection feature

### Execution History
- Timeline view of executions
- Status badges (success, failed, running)
- Duration tracking
- Error messages

### Settings
- Profile management
- Password change
- Notification preferences

## 🔐 Security

### Credential Encryption
- AES-256-GCM encryption
- Unique IV per credential
- Authentication tags for integrity
- Keys stored in environment variables

### Database Security
- Row-Level Security (RLS) enabled
- Users can only access their own data
- Service role key for backend operations only
- JWT token validation

## 📈 Performance Optimization

- Database indexes on frequently queried columns
- Pagination for large datasets
- Caching of static data
- Lazy loading of execution history
- Optimistic UI updates

## 🐛 Troubleshooting

### Common Issues

**Issue: "ENCRYPTION_KEY must be 64 hex characters"**
```bash
# Generate a new key
npm run generate-key
# Copy to .env file
```

**Issue: "Failed to fetch configuration"**
- Check SUPABASE_URL and SUPABASE_ANON_KEY in .env
- Ensure server is running on correct port

**Issue: "Authentication failed"**
- Verify Supabase credentials
- Check if user is logged in
- Ensure token is not expired

**Issue: "Failed to connect to n8n"**
- Verify N8N_URL is correct
- Check N8N_API_KEY is valid
- Ensure n8n instance is running

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 👥 Support

For support, please:
- Open an issue on GitHub
- Check existing documentation
- Review troubleshooting section

## 📊 Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Node.js, Express
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Workflow Engine:** n8n
- **Encryption:** Node.js Crypto (AES-256-GCM)

## 🎯 Performance Metrics

- Page load: < 2s
- API response: < 500ms
- Encryption/Decryption: < 100ms
- Database queries: < 200ms
- 99.9% uptime target

---

**Built with ❤️ by the CloudPilot Team**
