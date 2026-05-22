/** MCP Prompts — workflow templates for common N-central operations. */

import { z } from 'zod';

export const PROMPT_COUNT = 4;

export function registerPrompts(server) {
  server.registerPrompt(
    'full-customer-report',
    {
      description: 'Comprehensive customer/site report with org custom properties. Optional customerId to scope to a single customer.',
      argsSchema: {
        customerId: z.string().optional().describe('Optional customer ID to scope the report. Omit for all customers.'),
      },
    },
    async (args) => {
      const scope = args?.customerId
        ? `for customer ${args.customerId} only`
        : 'for the entire N-central environment';
      return {
        messages: [{ role: 'user', content: { type: 'text', text: `Generate a full customer and site report ${scope}.

Steps:
1. Use the ncentral://org-tree resource to get the full organization hierarchy
2. Use list_customers (with all: true) to get customer details${args?.customerId ? ` — filter to customerId=${args.customerId}` : ''}
3. Use list_sites (with all: true, format: 'json') to get site details
4. For each customer and site, use list_org_custom_properties (with all: true) to get their custom property values
5. Merge everything into a single CSV with columns: OrgType, OrgId, OrgName, ParentId, and all custom property columns
6. Present the CSV to the user

Important: Make sure to paginate through ALL results — there may be hundreds of customers and sites.` } }],
      };
    }
  );

  server.registerPrompt(
    'device-health-audit',
    {
      description: 'Audit device health — active issues, monitoring status. Optional orgUnitId to scope.',
      argsSchema: {
        orgUnitId: z.string().optional().describe('Optional org unit ID to scope the audit. Omit for the entire environment.'),
      },
    },
    async (args) => {
      const scope = args?.orgUnitId ? `for org unit ${args.orgUnitId}` : 'across the N-central environment';
      return {
        messages: [{ role: 'user', content: { type: 'text', text: `Perform a device health audit ${scope}.

Steps:
1. Use the ncentral://org-tree resource to understand the org structure
2. For each customer, use list_active_issues to get current problems
3. Use list_devices (with all: true, format: 'json') to get the full device inventory
4. Summarize:
   - Total devices per customer
   - Active issues per customer (group by severity if available)
   - Any customers with zero devices (possible onboarding gaps)
   - Overall health score

Present a summary table and flag any customers needing attention.` } }],
      };
    }
  );

  server.registerPrompt(
    'agent-deployment-status',
    { description: 'Check agent deployment coverage — find sites with missing or low device counts' },
    async () => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Check agent deployment status across all customers and sites.

Steps:
1. Use the ncentral://org-tree resource for the org hierarchy
2. Use list_devices (with all: true, format: 'json') to get devices with their org unit IDs
3. Cross-reference to count devices per customer and per site
4. Flag:
   - Sites with 0 devices (agents not deployed)
   - Sites with suspiciously few devices (< 3)
   - Customers with no sites at all
5. Present as a table: Customer | Site | Device Count | Status (OK/Warning/Missing)` } }],
    })
  );

  server.registerPrompt(
    'custom-property-audit',
    { description: 'Audit custom property values across all customers for consistency' },
    async () => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Audit custom property values across all customers for consistency.

Steps:
1. Use list_customers (with all: true) to get the full customer list
2. For each customer, use list_org_custom_properties (with all: true) to get their custom properties
3. Build a matrix: Customer vs Custom Property values
4. Identify:
   - Properties that are blank/missing for some customers but set for others
   - Properties with inconsistent values (e.g., different formats)
   - Customers that have no custom properties set at all
5. Present as a CSV matrix and flag inconsistencies.` } }],
    })
  );
}
