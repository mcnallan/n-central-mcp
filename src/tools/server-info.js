/** Server info, device filters, and report retrieval tools. */

import { apiGet, apiPost, sanitizePathParam } from '../client.js';
import { paginationParams, fetchOrPaginate } from '../shared.js';

export const serverInfoTools = [
  {
    name: 'get_server_info',
    description: 'Return N-central server information. Use level="health" for uptime/start time, level="extra" for system version details, or omit level (default) for API-service version info.',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          description: 'Information level: omit for basic API version info, "health" for uptime check, "extra" for system component versions',
          enum: ['basic', 'health', 'extra'],
        },
      },
    },
    handler: async (args) => {
      switch (args.level) {
        case 'health': return await apiGet('/api/health');
        case 'extra':  return await apiGet('/api/server-info/extra');
        default:       return await apiGet('/api/server-info');
      }
    },
  },
  {
    name: 'get_server_time',
    description: 'Retrieve the N-central server\'s current time. Useful for detecting clock drift between client and server.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await apiGet('/api/server-info/time');
    },
  },
  {
    name: 'logout',
    writeScope: 'write',
    description: 'Log out the current N-central API session, invalidating the access and refresh tokens. The next tool call will trigger a fresh JWT exchange.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await apiPost('/api/auth/logout', {});
    },
  },
  {
    name: 'get_server_info_authenticated',
    writeScope: 'write',
    description: 'Retrieve extra server version information using supplied credentials (for third-party system versions).',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username for the target system' },
        password: { type: 'string', description: 'Password for the target system' },
      },
      required: ['username', 'password'],
    },
    handler: async (args) => {
      return await apiPost('/api/server-info/extra/authenticated', {
        username: args.username,
        password: args.password,
      });
    },
  },
  {
    name: 'list_device_filters',
    description: 'Retrieve the list of device filters. Returns one page by default — set `all: true` to auto-paginate.',
    inputSchema: {
      type: 'object',
      properties: {
        viewScope: { type: 'string', description: 'View scope for filters' },
        ...paginationParams,
      },
    },
    handler: async (args) => {
      const params = args.viewScope ? { viewScope: args.viewScope } : {};
      return await fetchOrPaginate('/api/device-filters', params, args);
    },
  },
  {
    name: 'get_report',
    description: 'Retrieve an N-central report by its report ID.',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: { type: 'string', description: 'The report ID' },
      },
      required: ['reportId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/report/${sanitizePathParam(args.reportId)}`);
    },
  },
];
