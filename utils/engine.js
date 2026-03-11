// utils/engine.js - Engine Abstraction Layer
//
// All n8n API calls go through this module.
// No route file should ever import from utils/n8n.js directly.
// If the execution engine is ever replaced, only this file changes.

import { n8nRequest } from './n8n.js';

// ─────────────────────────────────────────────
// WORKFLOWS
// ─────────────────────────────────────────────

export async function engineCreateWorkflow(definition) {
  const result = await n8nRequest('/workflows', 'POST', definition);
  return { engineRef: String(result.id), raw: result };
}

export async function engineUpdateWorkflow(engineRef, definition) {
  return n8nRequest(`/workflows/${engineRef}`, 'PUT', definition);
}

export async function engineDeleteWorkflow(engineRef) {
  return n8nRequest(`/workflows/${engineRef}`, 'DELETE');
}

export async function engineActivateWorkflow(engineRef) {
  return n8nRequest(`/workflows/${engineRef}/activate`, 'POST');
}

export async function engineDeactivateWorkflow(engineRef) {
  return n8nRequest(`/workflows/${engineRef}/deactivate`, 'POST');
}

export async function engineGetWorkflow(engineRef) {
  return n8nRequest(`/workflows/${engineRef}`);
}

export async function engineListWorkflows() {
  const result = await n8nRequest('/workflows');
  return result?.data || [];
}

// ─────────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────────

export async function engineCreateCredential(name, type, data) {
  const result = await n8nRequest('/credentials', 'POST', { name, type, data });
  return String(result.id);
}

export async function engineDeleteCredential(engineRef) {
  return n8nRequest(`/credentials/${engineRef}`, 'DELETE').catch(() => {});
}

// ─────────────────────────────────────────────
// EXECUTIONS
// ─────────────────────────────────────────────

export async function engineGetExecution(engineRef) {
  return n8nRequest(`/executions/${engineRef}?includeData=true`);
}

export async function engineListExecutions(engineRef, limit = 20) {
  const result = await n8nRequest(
    `/executions?workflowId=${engineRef}&limit=${limit}`
  );
  return result?.data || result?.executions || [];
}

export async function engineDeleteExecution(engineRef) {
  return n8nRequest(`/executions/${engineRef}`, 'DELETE');
}