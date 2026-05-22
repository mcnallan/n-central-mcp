/** PSA (Professional Services Automation) integration tools. */

import { apiGet, apiPost, apiPut, sanitizePathParam } from '../client.js';

export const psaTools = [
  {
    name: 'get_psa_customer_mapping',
    description: 'Retrieve PSA (Professional Services Automation) customer mapping for a given customer ID.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
      },
      required: ['customerId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/standard-psa/customer-mapping/${sanitizePathParam(args.customerId)}`);
    },
  },
  {
    name: 'validate_psa_credential',
    writeScope: 'write',
    description: 'Validate Standard PSA credentials for a given PSA type. Transmits credentials in the request body — use with care over untrusted transports. WARNING: per N-central documentation, this endpoint currently works only with TigerPaw 3.0, not other PSA integrations — calls for other PSAs will fail.',
    inputSchema: {
      type: 'object',
      properties: {
        psaType: { type: 'string', description: 'The PSA type' },
        username: { type: 'string', description: 'PSA username' },
        password: { type: 'string', description: 'PSA password' },
      },
      required: ['psaType', 'username', 'password'],
    },
    handler: async (args) => {
      return await apiPost(`/api/standard-psa/${sanitizePathParam(args.psaType)}/credential`, {
        username: args.username,
        password: args.password,
      });
    },
  },
  {
    name: 'list_custom_psa_tickets',
    description: 'List Custom PSA tickets. Custom PSA only — managed PSA services are not supported by this endpoint.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await apiGet('/api/custom-psa/tickets');
    },
  },
  {
    name: 'create_custom_psa_ticket',
    writeScope: 'write',
    description: 'Create a new Custom PSA ticket. Custom PSA only — operations for managed PSA services are not supported.',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'object', description: 'Custom PSA ticket payload — refer to N-central API docs for required fields' },
      },
      required: ['body'],
    },
    handler: async (args) => {
      return await apiPost('/api/custom-psa/tickets', args.body);
    },
  },
  {
    name: 'list_psa_customer_mappings',
    description: 'List all Standard PSA mappings for a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
      },
      required: ['customerId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/standard-psa/customer/${sanitizePathParam(args.customerId)}/mappings`);
    },
  },
  {
    name: 'update_psa_customer_mappings',
    writeScope: 'write',
    description: 'Update Standard PSA mappings for a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
        body: { type: 'object', description: 'PSA mappings payload' },
      },
      required: ['customerId', 'body'],
    },
    handler: async (args) => {
      return await apiPut(`/api/standard-psa/customer/${sanitizePathParam(args.customerId)}/mappings`, args.body);
    },
  },
  {
    name: 'list_psa_companies',
    description: 'List Standard PSA companies associated with a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
      },
      required: ['customerId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/standard-psa/customers/${sanitizePathParam(args.customerId)}/companies`);
    },
  },
  {
    name: 'list_psa_company_contacts',
    description: 'List PSA company contacts for a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
        psaCompanyId: { type: 'string', description: 'The PSA company ID' },
      },
      required: ['customerId', 'psaCompanyId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/standard-psa/customers/${sanitizePathParam(args.customerId)}/companies/${sanitizePathParam(args.psaCompanyId)}/contacts`);
    },
  },
  {
    name: 'list_psa_company_sites',
    description: 'List PSA company sites for a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'The customer ID' },
        psaCompanyId: { type: 'string', description: 'The PSA company ID' },
      },
      required: ['customerId', 'psaCompanyId'],
    },
    handler: async (args) => {
      return await apiGet(`/api/standard-psa/customers/${sanitizePathParam(args.customerId)}/companies/${sanitizePathParam(args.psaCompanyId)}/sites`);
    },
  },
  {
    name: 'get_custom_psa_ticket_detail',
    writeScope: 'write',
    description: 'Retrieve detailed information for a specific Custom PSA ticket. Uses POST because the endpoint requires PSA credentials in the body.',
    inputSchema: {
      type: 'object',
      properties: {
        customPsaTicketId: { type: 'string', description: 'The Custom PSA ticket ID' },
        username: { type: 'string', description: 'PSA username' },
        password: { type: 'string', description: 'PSA password' },
      },
      required: ['customPsaTicketId', 'username', 'password'],
    },
    handler: async (args) => {
      return await apiPost(
        `/api/custom-psa/tickets/${sanitizePathParam(args.customPsaTicketId)}`,
        { username: args.username, password: args.password }
      );
    },
  },
];
