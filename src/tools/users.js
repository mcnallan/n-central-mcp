/** User and access group tools. */

import { apiGet, apiPost, sanitizePathParam } from '../client.js';
import { paginationParams, formatParam, fetchOrPaginate, formatResult } from '../shared.js';

export const userTools = [
  {
    name: 'list_all_users',
    description: 'Retrieve a global list of all users in N-central (not scoped by org unit). Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationParams, ...formatParam },
    },
    handler: async (args) => {
      const result = await fetchOrPaginate('/api/users', {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'get_current_user',
    description: 'Retrieve details for the currently authenticated user. Useful for "who am I" introspection.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await apiGet('/api/users/me');
    },
  },
  {
    name: 'list_users',
    description: 'Retrieve the list of users for a specific organization unit. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
        ...paginationParams,
        ...formatParam,
      },
      required: ['orgUnitId'],
    },
    handler: async (args) => {
      const path = `/api/org-units/${sanitizePathParam(args.orgUnitId)}/users`;
      const result = await fetchOrPaginate(path, {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'list_user_roles',
    description: 'Retrieve a list of user roles for a given organization unit. Returns one page by default — set `all: true` to auto-paginate.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
        ...paginationParams,
      },
      required: ['orgUnitId'],
    },
    handler: async (args) => {
      const path = `/api/org-units/${sanitizePathParam(args.orgUnitId)}/user-roles`;
      return await fetchOrPaginate(path, {}, args);
    },
  },
  {
    name: 'get_user_role',
    description: 'Retrieve a specific user role for a given organization unit and user role ID.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
        userRoleId: { type: 'number', description: 'The user role ID' },
      },
      required: ['orgUnitId', 'userRoleId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/org-units/${sanitizePathParam(args.orgUnitId)}/user-roles/${sanitizePathParam(args.userRoleId)}`);
    },
  },
  {
    name: 'list_access_groups',
    description: 'Retrieve access groups for a specific organization unit. Returns one page by default — set `all: true` to auto-paginate.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
        ...paginationParams,
      },
      required: ['orgUnitId'],
    },
    handler: async (args) => {
      const path = `/api/org-units/${sanitizePathParam(args.orgUnitId)}/access-groups`;
      return await fetchOrPaginate(path, {}, args);
    },
  },
  {
    name: 'get_access_group',
    description: 'Retrieve detailed information for a specific access group by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        accessGroupId: { type: 'string', description: 'The access group ID' },
      },
      required: ['accessGroupId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/access-groups/${sanitizePathParam(args.accessGroupId)}`);
    },
  },
  {
    name: 'create_user_role',
    writeScope: 'write',
    description: 'Create a new user role for an organization unit (PREVIEW endpoint). Required: roleName, description, permissionIds. Optional: userIds to assign the role to.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
        roleName: { type: 'string', description: 'The name of the role' },
        description: { type: 'string', description: 'Description of the role' },
        permissionIds: { type: 'array', description: 'Permission IDs to grant', items: { type: 'string' } },
        userIds: { type: 'array', description: 'Optional user IDs to assign the role to', items: { type: 'string' } },
      },
      required: ['orgUnitId', 'roleName', 'description', 'permissionIds'],
    },
    handler: async (args) => {
      const { orgUnitId, ...body } = args;
      return await apiPost(`/api/org-units/${sanitizePathParam(orgUnitId)}/user-roles`, body);
    },
  },
  {
    name: 'create_access_group',
    writeScope: 'write',
    description: 'Create a new organization-unit-type access group. Required: groupName, groupDescription. Optional: orgUnitIds, userIds, autoIncludeNewOrgUnits.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The parent organization unit ID' },
        groupName: { type: 'string', description: 'Name of the access group' },
        groupDescription: { type: 'string', description: 'Description of the access group' },
        orgUnitIds: { type: 'array', description: 'Org unit IDs to attach', items: { type: 'string' } },
        userIds: { type: 'array', description: 'User IDs to associate', items: { type: 'string' } },
        autoIncludeNewOrgUnits: { type: 'string', description: 'Whether new org units should be automatically included' },
      },
      required: ['orgUnitId', 'groupName', 'groupDescription'],
    },
    handler: async (args) => {
      const { orgUnitId, ...body } = args;
      return await apiPost(`/api/org-units/${sanitizePathParam(orgUnitId)}/access-groups`, body);
    },
  },
  {
    name: 'create_device_access_group',
    writeScope: 'write',
    description: 'Create a new device-type access group. Required: groupName, groupDescription. Optional: deviceIds, userIds.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The parent organization unit ID' },
        groupName: { type: 'string', description: 'Name of the access group' },
        groupDescription: { type: 'string', description: 'Description of the access group' },
        deviceIds: { type: 'array', description: 'Device IDs to attach', items: { type: 'string' } },
        userIds: { type: 'array', description: 'User IDs to associate', items: { type: 'string' } },
      },
      required: ['orgUnitId', 'groupName', 'groupDescription'],
    },
    handler: async (args) => {
      const { orgUnitId, ...body } = args;
      return await apiPost(`/api/org-units/${sanitizePathParam(orgUnitId)}/device-access-groups`, body);
    },
  },
];
