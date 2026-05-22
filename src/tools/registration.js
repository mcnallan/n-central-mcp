/** Registration tokens, activation keys, and software installer tools. */

import { apiGet, apiPost, sanitizePathParam } from '../client.js';

export const registrationTools = [
  {
    name: 'get_registration_token',
    description: 'Retrieve the registration token for a site, organization unit, or customer.',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          description: 'The type of entity to retrieve the token for',
          enum: ['site', 'orgUnit', 'customer'],
        },
        id: { type: 'number', description: 'The entity ID (siteId, orgUnitId, or customerId)' },
      },
      required: ['entityType', 'id'],
    },
    handler: async (args) => {
      const id = sanitizePathParam(args.id);
      switch (args.entityType) {
        case 'site':     return await apiGet(`/api/sites/${id}/registration-token`);
        case 'orgUnit':  return await apiGet(`/api/org-units/${id}/registration-token`);
        case 'customer': return await apiGet(`/api/customers/${id}/registration-token`);
        default: throw new Error(`Unknown entityType: ${args.entityType}`);
      }
    },
  },
  {
    name: 'get_device_activation_key',
    description: 'Generate an activation key for a device by device ID.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'The device ID' },
      },
      required: ['deviceId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/devices/${sanitizePathParam(args.deviceId)}/activation-key`);
    },
  },
  {
    name: 'get_software_installers',
    description: 'Retrieve software installer download URLs for a specific customer. Supports filtering by software type and installer type.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
        softwareType: { type: 'string', description: 'Software type filter (e.g. "agent")' },
        installerType: { type: 'string', description: 'Installer type filter (e.g. "msi", "exe")' },
      },
      required: ['customerId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/customers/${sanitizePathParam(args.customerId)}/software/installers`, {
        softwareType: args.softwareType,
        installerType: args.installerType,
      });
    },
  },
  {
    name: 'generate_software_download_link',
    writeScope: 'write',
    description: 'Generate a software download link for a customer. Provide the softwareId obtained from get_software_installers.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
        softwareId: { type: 'string', description: 'The software installer ID' },
      },
      required: ['customerId', 'softwareId'],
    },
    handler: async (args) => {
      return await apiPost(`/api/customers/${sanitizePathParam(args.customerId)}/software/installers`, {
        softwareId: args.softwareId,
      });
    },
  },
];
