/** MCP Resources: read-only context. */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet, sanitizePathParam } from './client.js';
import { fetchAll, mapConcurrent } from './paginator.js';
import { getContext } from './context.js';

export const RESOURCE_COUNT = 5;

const CACHE_TTL_MS = Number(process.env.NC_RESOURCE_CACHE_TTL_MS ?? 60_000);
const cache = new Map();

// Exported for isolation tests (verifies the cache key is tenant-scoped).
export async function cached(uri, loader) {
  if (CACHE_TTL_MS <= 0) return loader();
  // Scope the cache key to the tenant: the URI alone (e.g. ncentral://org-tree)
  // collides across N-central servers, so a bare-URI key would serve one
  // tenant's data to another. The tenant key is a hash, safe to use here.
  const key = `${getContext().key}:${uri}`;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.t < CACHE_TTL_MS) return entry.v;
  const v = await loader();
  cache.set(key, { v, t: now });
  return v;
}

/** Drop all cached resource entries for a tenant (called on session teardown). */
export function evictTenantCache(tenantKey) {
  const prefix = `${tenantKey}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

export function registerResources(server) {
  server.resource(
    'org-tree', 'ncentral://org-tree',
    { description: 'Full org hierarchy: Service Orgs → Customers → Sites with IDs and names.', mimeType: 'application/json' },
    async () => {
      const tree = await cached('ncentral://org-tree', async () => {
        const serviceOrgs = await fetchAll('/api/service-orgs');

        const soNodes = await mapConcurrent(serviceOrgs, async (so) => {
          const soId = so.soId || so.id;
          const customers = await fetchAll(`/api/service-orgs/${sanitizePathParam(soId)}/customers`);

          const customerNodes = await mapConcurrent(customers, async (cust) => {
            const custId = cust.customerId || cust.id;
            let sites = [];
            try {
              sites = await fetchAll(`/api/customers/${sanitizePathParam(custId)}/sites`);
            } catch (err) {
              console.error(`Failed to fetch sites for customer ${custId}: ${err.message}`);
            }
            return {
              customerId: custId,
              customerName: cust.customerName || cust.name || '',
              sites: sites.map(s => ({ siteId: s.siteId || s.id, siteName: s.siteName || s.name || '' })),
            };
          }, 5);

          return { soId, soName: so.soName || so.name || '', customers: customerNodes };
        }, 5);

        return soNodes;
      });

      return { contents: [{ uri: 'ncentral://org-tree', mimeType: 'application/json', text: JSON.stringify(tree) }] };
    }
  );

  server.resource(
    'status', 'ncentral://status',
    { description: 'Server health and version info.', mimeType: 'application/json' },
    async () => {
      const [health, info] = await Promise.all([apiGet('/api/health'), apiGet('/api/server-info')]);
      return { contents: [{ uri: 'ncentral://status', mimeType: 'application/json', text: JSON.stringify({ health, serverInfo: info }) }] };
    }
  );

  server.resource(
    'device',
    new ResourceTemplate('ncentral://device/{deviceId}', { list: undefined }),
    { description: 'Full device record by ID. URI: ncentral://device/{deviceId}', mimeType: 'application/json' },
    async (uri, { deviceId }) => {
      const device = await apiGet(`/api/devices/${sanitizePathParam(deviceId)}`);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(device) }] };
    }
  );

  server.resource(
    'customer',
    new ResourceTemplate('ncentral://customer/{customerId}', { list: undefined }),
    { description: 'Customer details by ID. URI: ncentral://customer/{customerId}', mimeType: 'application/json' },
    async (uri, { customerId }) => {
      const customer = await apiGet(`/api/customers/${sanitizePathParam(customerId)}`);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(customer) }] };
    }
  );

  server.resource(
    'org-unit',
    new ResourceTemplate('ncentral://org-unit/{orgUnitId}', { list: undefined }),
    { description: 'Organization unit details by ID. URI: ncentral://org-unit/{orgUnitId}', mimeType: 'application/json' },
    async (uri, { orgUnitId }) => {
      const ou = await apiGet(`/api/org-units/${sanitizePathParam(orgUnitId)}`);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(ou) }] };
    }
  );
}
