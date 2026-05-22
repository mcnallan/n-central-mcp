/** Maintenance window tools. */

import { apiGet, apiPost, apiPut, apiDelete, sanitizePathParam } from '../client.js';

export const maintenanceWindowTools = [
  {
    name: 'get_maintenance_windows',
    description: 'Retrieve all maintenance windows for a specific device.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
      },
      required: ['deviceId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/devices/${sanitizePathParam(args.deviceId)}/maintenance-windows`);
    },
  },
  {
    name: 'create_maintenance_windows',
    writeScope: 'write',
    description: 'Add a set of patch maintenance windows to a list of devices. Body shape: { deviceIDs: number[], maintenanceWindows: [...] }. See N-central API docs for MaintenanceWindowRequest field details. Note: partial failures are surfaced as per-device statuses in the response body — inspect carefully.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceIDs: { type: 'array', description: 'Device IDs to apply maintenance windows to', items: { type: 'integer' } },
        maintenanceWindows: { type: 'array', description: 'Array of MaintenanceWindowRequest objects', items: { type: 'object' } },
      },
      required: ['deviceIDs', 'maintenanceWindows'],
    },
    handler: async (args) => {
      return await apiPost('/api/devices/maintenance-windows', {
        deviceIDs: args.deviceIDs,
        maintenanceWindows: args.maintenanceWindows,
      });
    },
  },
  {
    name: 'update_maintenance_windows',
    writeScope: 'write',
    description: 'Modify existing device patch maintenance windows by their ScheduleId (included in each window object).',
    inputSchema: {
      type: 'object',
      properties: {
        maintenanceWindows: { type: 'array', description: 'Array of MaintenanceWindowRequest objects (must include scheduleId)', items: { type: 'object' } },
      },
      required: ['maintenanceWindows'],
    },
    handler: async (args) => {
      return await apiPut('/api/devices/maintenance-windows', {
        maintenanceWindows: args.maintenanceWindows,
      });
    },
  },
  {
    name: 'delete_maintenance_windows',
    writeScope: 'destructive',
    description: 'Delete device patch maintenance windows by a list of Schedule IDs. IRREVERSIBLE.',
    inputSchema: {
      type: 'object',
      properties: {
        scheduleIds: { type: 'array', description: 'Schedule IDs of maintenance windows to delete', items: { type: 'integer' } },
      },
      required: ['scheduleIds'],
    },
    handler: async (args) => {
      return await apiDelete('/api/devices/maintenance-windows', {}, { scheduleIds: args.scheduleIds });
    },
  },
];
