/** Scheduled task tools. */

import { apiGet, apiPost, sanitizePathParam } from '../client.js';
import { paginationParams, formatParam, fetchOrPaginate, formatResult } from '../shared.js';

export const scheduledTaskTools = [
  {
    name: 'list_scheduled_tasks',
    description: 'List all scheduled tasks across the N-central environment. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationParams, ...formatParam },
    },
    handler: async (args) => {
      const result = await fetchOrPaginate('/api/scheduled-tasks', {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'get_scheduled_task',
    description: 'Retrieve general information for a given scheduled task by ID. Returns parent ID, name, type, customer ID, device IDs, and enabled status.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The scheduled task ID' },
      },
      required: ['taskId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/scheduled-tasks/${sanitizePathParam(args.taskId)}`);
    },
  },
  {
    name: 'get_scheduled_task_status',
    description: 'Retrieve status for a given scheduled task. Returns aggregated status by default; set detailed=true to get per-device status breakdown. WARNING: detailed=true does NOT accept DEVICE-level task IDs — only SYSTEM and CUSTOMER level. Use the parent task ID instead. Task hierarchy levels can be navigated via `parentId`.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The scheduled task ID' },
        detailed: { type: 'boolean', description: 'If true, returns per-device status details instead of the aggregated summary' },
      },
      required: ['taskId'],
    },
    handler: async (args) => {
      const base = `/api/scheduled-tasks/${sanitizePathParam(args.taskId)}/status`;
      return await apiGet(args.detailed ? `${base}/details` : base);
    },
  },
  {
    name: 'list_device_tasks',
    description: 'Retrieve scheduled tasks for a specific device. Returns task ID, task name, and status. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
        ...paginationParams,
        ...formatParam,
      },
      required: ['deviceId'],
    },
    handler: async (args) => {
      const path = `/api/devices/${sanitizePathParam(args.deviceId)}/scheduled-tasks`;
      const result = await fetchOrPaginate(path, {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'create_direct_scheduled_task',
    writeScope: 'destructive',
    description: 'Create a direct-support scheduled task that executes an Automation Policy, Script, or MacScript on a target device. This runs arbitrary code on the managed endpoint — treat as destructive. Required body fields: name, itemId, taskType, customerId, deviceId, credential. Optional: parameters. PREREQUISITES: (1) Script must have a Repository ID >= 2000 — bundled defaults are blocked from API invocation. (2) The script must have "Enable API" toggled ON in the N-central Script/Software Repository UI. (3) `itemId` is the Repository ID — there is no API to enumerate scripts; look it up in the Script/Software Repository UI. WARNING: extensive use accumulates tasks in N-central\'s database and slows the "Device → Tools → Task Execution" UI page — track invocations.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique task name' },
        itemId: { type: 'number', description: 'Remote execution item ID (from the N-central UI)' },
        taskType: { type: 'string', description: 'Task type', enum: ['AutomationPolicy', 'Script', 'MacScript'] },
        customerId: { type: 'number', description: 'Customer ID' },
        deviceId: { type: 'number', description: 'Target device ID' },
        credential: { type: 'object', description: 'ScheduledTaskCredential object specifying credentials for the task' },
        parameters: { type: 'array', description: 'Optional array of ScheduledTaskParameter objects', items: { type: 'object' } },
      },
      required: ['name', 'itemId', 'taskType', 'customerId', 'deviceId', 'credential'],
    },
    handler: async (args) => {
      return await apiPost('/api/scheduled-tasks/direct', args);
    },
  },
];
