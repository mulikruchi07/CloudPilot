// config.js - Backend configuration (DO NOT expose to frontend)
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,

  // N8N Configuration
  n8n: {
    url: process.env.N8N_URL,
    apiKey: process.env.N8N_API_KEY,
    apiEnabled: process.env.N8N_API_ENABLED === 'true',
    authActive: process.env.N8N_API_AUTH_ACTIVE === 'true',
    cors: {
      allowOrigin: process.env.N8N_CORS_ALLOW_ORIGIN?.split(',') || [],
      allowCredentials: process.env.N8N_CORS_ALLOW_CREDENTIALS === 'true'
    }
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,  // NEVER send to frontend
    anonKey: process.env.SUPABASE_ANON_KEY  // Safe for frontend
  },

  // Security
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-change-this',

  // CORS
  allowedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
  ]
};