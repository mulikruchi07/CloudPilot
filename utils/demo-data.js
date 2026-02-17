// utils/demo-data.js
// Mock data for demo mode (when DEMO_MODE=true)

export const demoWorkflows = [
  {
    id: 'demo-wf-1',
    name: 'AWS S3 Backup Automation',
    active: true,
    lastRun: new Date(Date.now() - 3600000).toISOString(),
    executions: 47,
    category: 'AWS',
    description: 'Automated backup of important files to S3'
  },
  {
    id: 'demo-wf-2',
    name: 'EC2 Health Monitor',
    active: true,
    lastRun: new Date(Date.now() - 7200000).toISOString(),
    executions: 132,
    category: 'AWS',
    description: 'Monitor EC2 instance health and send alerts'
  },
  {
    id: 'demo-wf-3',
    name: 'Cloud Cost Optimizer',
    active: false,
    lastRun: new Date(Date.now() - 86400000).toISOString(),
    executions: 23,
    category: 'Multi-Cloud',
    description: 'Analyze and optimize cloud spending'
  }
];

export const demoTemplates = [
  {
    id: 'demo-tpl-1',
    template_id: 'aws-s3-sync',
    name: 'AWS S3 Bucket Sync',
    description: 'Automatically sync files between S3 buckets across regions',
    category: 'AWS Automation',
    icon: 'fab fa-aws',
    required_credentials: ['aws'],
    config_fields: ['source_bucket', 'target_bucket'],
    tags: ['aws', 's3', 'backup', 'sync'],
    difficulty_level: 'beginner',
    estimated_time: '5 minutes',
    use_count: 234,
    popularity: 95,
    is_active: true
  },
  {
    id: 'demo-tpl-2',
    template_id: 'ec2-auto-scale',
    name: 'EC2 Auto-Scaling Workflow',
    description: 'Automatically scale EC2 instances based on CloudWatch metrics',
    category: 'AWS Automation',
    icon: 'fab fa-aws',
    required_credentials: ['aws'],
    config_fields: ['instance_type', 'min_instances', 'max_instances'],
    tags: ['aws', 'ec2', 'autoscaling'],
    difficulty_level: 'intermediate',
    estimated_time: '15 minutes',
    use_count: 156,
    popularity: 88,
    is_active: true
  },
  {
    id: 'demo-tpl-3',
    template_id: 'gcp-compute-snapshot',
    name: 'GCP Compute Snapshot',
    description: 'Create and manage automated snapshots of GCP Compute instances',
    category: 'Google Cloud Automation',
    icon: 'fab fa-google',
    required_credentials: ['gcp'],
    config_fields: ['project_id', 'zone', 'snapshot_schedule'],
    tags: ['gcp', 'compute', 'backup', 'snapshot'],
    difficulty_level: 'beginner',
    estimated_time: '10 minutes',
    use_count: 89,
    popularity: 76,
    is_active: true
  },
  {
    id: 'demo-tpl-4',
    template_id: 'azure-vm-monitor',
    name: 'Azure VM Health Monitor',
    description: 'Monitor Azure VM health and send alerts via email or Slack',
    category: 'Azure Automation',
    icon: 'fab fa-microsoft',
    required_credentials: ['azure'],
    config_fields: ['resource_group', 'alert_email'],
    tags: ['azure', 'vm', 'monitoring', 'alerts'],
    difficulty_level: 'intermediate',
    estimated_time: '20 minutes',
    use_count: 67,
    popularity: 71,
    is_active: true
  }
];

export const demoCredentials = [
  {
    id: 'demo-cred-1',
    credential_type: 'aws',
    credential_name: 'AWS Production Account',
    is_valid: true,
    last_validated_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 2592000000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'demo-cred-2',
    credential_type: 'gcp',
    credential_name: 'GCP Main Project',
    is_valid: true,
    last_validated_at: new Date(Date.now() - 172800000).toISOString(),
    created_at: new Date(Date.now() - 5184000000).toISOString(),
    updated_at: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: 'demo-cred-3',
    credential_type: 'azure',
    credential_name: 'Azure Enterprise',
    is_valid: true,
    last_validated_at: new Date(Date.now() - 259200000).toISOString(),
    created_at: new Date(Date.now() - 7776000000).toISOString(),
    updated_at: new Date(Date.now() - 259200000).toISOString()
  }
];

export const demoExecutions = [
  {
    id: 'demo-exec-1',
    user_workflow_id: 'demo-wf-1',
    workflow_id: 'demo-wf-1',
    n8n_execution_id: 'n8n-exec-1',
    status: 'success',
    started_at: new Date(Date.now() - 3600000).toISOString(),
    finished_at: new Date(Date.now() - 3540000).toISOString(),
    duration_ms: 60000,
    trigger_mode: 'schedule',
    nodes_executed: 5,
    nodes_total: 5
  },
  {
    id: 'demo-exec-2',
    user_workflow_id: 'demo-wf-2',
    workflow_id: 'demo-wf-2',
    n8n_execution_id: 'n8n-exec-2',
    status: 'success',
    started_at: new Date(Date.now() - 7200000).toISOString(),
    finished_at: new Date(Date.now() - 7140000).toISOString(),
    duration_ms: 60000,
    trigger_mode: 'schedule',
    nodes_executed: 4,
    nodes_total: 4
  },
  {
    id: 'demo-exec-3',
    user_workflow_id: 'demo-wf-1',
    workflow_id: 'demo-wf-1',
    n8n_execution_id: 'n8n-exec-3',
    status: 'failed',
    error_message: 'Connection timeout to S3',
    started_at: new Date(Date.now() - 10800000).toISOString(),
    finished_at: new Date(Date.now() - 10740000).toISOString(),
    duration_ms: 60000,
    trigger_mode: 'manual',
    nodes_executed: 2,
    nodes_total: 5
  }
];

export const demoTimelineData = {
  'demo-exec-1': [
    {
      node_name: 'Trigger',
      node_type: 'schedule',
      status: 'success',
      started_at: new Date(Date.now() - 3600000).toISOString(),
      finished_at: new Date(Date.now() - 3595000).toISOString(),
      execution_time_ms: 5000,
      output_preview: { item_count: 1 }
    },
    {
      node_name: 'List S3 Files',
      node_type: 'aws-s3',
      status: 'success',
      started_at: new Date(Date.now() - 3595000).toISOString(),
      finished_at: new Date(Date.now() - 3580000).toISOString(),
      execution_time_ms: 15000,
      output_preview: { item_count: 42 }
    },
    {
      node_name: 'Filter New Files',
      node_type: 'filter',
      status: 'success',
      started_at: new Date(Date.now() - 3580000).toISOString(),
      finished_at: new Date(Date.now() - 3575000).toISOString(),
      execution_time_ms: 5000,
      output_preview: { item_count: 12 }
    },
    {
      node_name: 'Copy to Backup Bucket',
      node_type: 'aws-s3',
      status: 'success',
      started_at: new Date(Date.now() - 3575000).toISOString(),
      finished_at: new Date(Date.now() - 3545000).toISOString(),
      execution_time_ms: 30000,
      output_preview: { item_count: 12 }
    },
    {
      node_name: 'Send Notification',
      node_type: 'email',
      status: 'success',
      started_at: new Date(Date.now() - 3545000).toISOString(),
      finished_at: new Date(Date.now() - 3540000).toISOString(),
      execution_time_ms: 5000,
      output_preview: { item_count: 1 }
    }
  ]
};

export function getDemoData(type, id = null) {
  switch (type) {
    case 'workflows':
      return { data: demoWorkflows };
    case 'templates':
      return { templates: demoTemplates };
    case 'credentials':
      return { credentials: demoCredentials };
    case 'executions':
      if (id) {
        return { execution: demoExecutions.find(e => e.id === id) || demoExecutions[0] };
      }
      return { executions: demoExecutions };
    case 'timeline':
      return {
        timeline: demoTimelineData[id] || demoTimelineData['demo-exec-1'],
        status: 'complete',
        summary: {
          total_nodes: 5,
          successful_nodes: 5,
          failed_nodes: 0,
          total_execution_time: 60000
        }
      };
    default:
      return {};
  }
}