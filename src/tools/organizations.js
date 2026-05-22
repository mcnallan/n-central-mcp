/** Organization tools — service orgs, customers, sites. */

import { apiGet, apiPost, apiPatch, sanitizePathParam } from '../client.js';
import { paginationParams, formatParam, fetchOrPaginate, formatResult } from '../shared.js';

export const organizationTools = [
  {
    name: 'list_org_units',
    description: 'Retrieve a list of all organization units. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationParams, ...formatParam },
    },
    handler: async (args) => {
      const result = await fetchOrPaginate('/api/org-units', {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'get_org_unit',
    description: 'Retrieve a specific organization unit by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
      },
      required: ['orgUnitId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/org-units/${sanitizePathParam(args.orgUnitId)}`);
    },
  },
  {
    name: 'get_org_unit_limits',
    description: 'Retrieve licensing/usage limits for an organization unit. Useful for capacity planning.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
      },
      required: ['orgUnitId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/org-units/${sanitizePathParam(args.orgUnitId)}/limits`);
    },
  },
  {
    name: 'update_org_unit_limits',
    writeScope: 'write',
    description: 'Update licensing/usage limits for an organization unit (PATCH — only provided fields modified).',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The organization unit ID' },
        body: { type: 'object', description: 'Limits payload — refer to N-central API docs for field shape' },
      },
      required: ['orgUnitId', 'body'],
    },
    handler: async (args) => {
      return await apiPatch(`/api/org-units/${sanitizePathParam(args.orgUnitId)}/limits`, args.body);
    },
  },
  {
    name: 'list_org_unit_children',
    description: 'Retrieve a list of all child organization units for a given org unit.',
    inputSchema: {
      type: 'object',
      properties: {
        orgUnitId: { type: 'number', description: 'The parent organization unit ID' },
      },
      required: ['orgUnitId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/org-units/${sanitizePathParam(args.orgUnitId)}/children`);
    },
  },
  {
    name: 'list_service_orgs',
    description: 'Retrieve a list of all service organizations. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationParams, ...formatParam },
    },
    handler: async (args) => {
      const result = await fetchOrPaginate('/api/service-orgs', {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'get_service_org',
    description: 'Retrieve a specific service organization by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        soId: { type: 'number', description: 'The service organization ID' },
      },
      required: ['soId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/service-orgs/${sanitizePathParam(args.soId)}`);
    },
  },
  {
    name: 'list_customers',
    description: 'Retrieve a list of customers. If soId is provided, returns only customers under that service organization; otherwise returns all customers. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: {
        soId: { type: 'number', description: 'Optional service organization ID to filter customers by SO' },
        ...paginationParams,
        ...formatParam,
      },
    },
    handler: async (args) => {
      const path = args.soId != null
        ? `/api/service-orgs/${sanitizePathParam(args.soId)}/customers`
        : '/api/customers';
      const result = await fetchOrPaginate(path, {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'get_customer',
    description: 'Retrieve a specific customer by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
      },
      required: ['customerId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/customers/${sanitizePathParam(args.customerId)}`);
    },
  },
  {
    name: 'list_sites',
    description: 'Retrieve a list of sites. If customerId is provided, returns only sites under that customer; otherwise returns all sites. Returns one page by default — set `all: true` to auto-paginate. Use `format: "csv"` for spreadsheet-ready output.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'Optional customer ID to filter sites by customer' },
        ...paginationParams,
        ...formatParam,
      },
    },
    handler: async (args) => {
      const path = args.customerId != null
        ? `/api/customers/${sanitizePathParam(args.customerId)}/sites`
        : '/api/sites';
      const result = await fetchOrPaginate(path, {}, args);
      return formatResult(result, args.format);
    },
  },
  {
    name: 'get_site',
    description: 'Retrieve a specific site by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'number', description: 'The site ID' },
      },
      required: ['siteId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/sites/${sanitizePathParam(args.siteId)}`);
    },
  },
  {
    name: 'create_service_org',
    writeScope: 'write',
    description: 'Create a new service organization. Required: contactFirstName, contactLastName, soName.',
    inputSchema: {
      type: 'object',
      properties: {
        soName: { type: 'string', description: 'Service organization name' },
        contactFirstName: { type: 'string', description: 'Primary contact first name' },
        contactLastName: { type: 'string', description: 'Primary contact last name' },
        externalId: { type: 'string', description: 'Optional external identifier' },
        phone: { type: 'string', description: 'Main phone number' },
        contactTitle: { type: 'string', description: 'Contact title' },
        contactEmail: { type: 'string', description: 'Contact email' },
        contactPhone: { type: 'string', description: 'Contact phone' },
        contactPhoneExt: { type: 'string', description: 'Contact phone extension' },
        contactDepartment: { type: 'string', description: 'Contact department' },
        street1: { type: 'string', description: 'Street address line 1' },
        street2: { type: 'string', description: 'Street address line 2' },
        city: { type: 'string', description: 'City' },
        stateProv: { type: 'string', description: 'State/Province' },
        country: { type: 'string', description: 'Country (ISO 2-letter, e.g. "US")' },
        postalCode: { type: 'string', description: 'Postal/ZIP code' },
      },
      required: ['soName', 'contactFirstName', 'contactLastName'],
    },
    handler: async (args) => {
      return await apiPost('/api/service-orgs', args);
    },
  },
  {
    name: 'create_customer',
    writeScope: 'write',
    description: 'Create a new customer under a service organization. Required: contactFirstName, contactLastName, customerName.',
    inputSchema: {
      type: 'object',
      properties: {
        soId: { type: 'number', description: 'The service organization ID this customer belongs to' },
        customerName: { type: 'string', description: 'Customer name' },
        contactFirstName: { type: 'string', description: 'Primary contact first name' },
        contactLastName: { type: 'string', description: 'Primary contact last name' },
        licenseType: { type: 'string', description: 'License type' },
        externalId: { type: 'string', description: 'Optional external identifier' },
        phone: { type: 'string', description: 'Main phone number' },
        contactTitle: { type: 'string', description: 'Contact title' },
        contactEmail: { type: 'string', description: 'Contact email' },
        contactPhone: { type: 'string', description: 'Contact phone' },
        contactPhoneExt: { type: 'string', description: 'Contact phone extension' },
        contactDepartment: { type: 'string', description: 'Contact department' },
        street1: { type: 'string', description: 'Street address line 1' },
        street2: { type: 'string', description: 'Street address line 2' },
        city: { type: 'string', description: 'City' },
        stateProv: { type: 'string', description: 'State/Province' },
        country: { type: 'string', description: 'Country (ISO 2-letter)' },
        postalCode: { type: 'string', description: 'Postal/ZIP code' },
      },
      required: ['soId', 'customerName', 'contactFirstName', 'contactLastName'],
    },
    handler: async (args) => {
      const { soId, ...body } = args;
      return await apiPost(`/api/service-orgs/${sanitizePathParam(soId)}/customers`, body);
    },
  },
  {
    name: 'create_site',
    writeScope: 'write',
    description: 'Create a new site under a customer (PREVIEW endpoint — schema may change between N-central versions). Required: contactFirstName, contactLastName, siteName.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID this site belongs to' },
        siteName: { type: 'string', description: 'Site name' },
        contactFirstName: { type: 'string', description: 'Primary contact first name' },
        contactLastName: { type: 'string', description: 'Primary contact last name' },
        licenseType: { type: 'string', description: 'License type' },
        externalId: { type: 'string', description: 'Optional external identifier' },
        phone: { type: 'string', description: 'Main phone number' },
        contactTitle: { type: 'string', description: 'Contact title' },
        contactEmail: { type: 'string', description: 'Contact email' },
        contactPhone: { type: 'string', description: 'Contact phone' },
        contactPhoneExt: { type: 'string', description: 'Contact phone extension' },
        contactDepartment: { type: 'string', description: 'Contact department' },
        street1: { type: 'string', description: 'Street address line 1' },
        street2: { type: 'string', description: 'Street address line 2' },
        city: { type: 'string', description: 'City' },
        stateProv: { type: 'string', description: 'State/Province' },
        country: { type: 'string', description: 'Country (ISO 2-letter)' },
        postalCode: { type: 'string', description: 'Postal/ZIP code' },
      },
      required: ['customerId', 'siteName', 'contactFirstName', 'contactLastName'],
    },
    handler: async (args) => {
      const { customerId, ...body } = args;
      return await apiPost(`/api/customers/${sanitizePathParam(customerId)}/sites`, body);
    },
  },
];
