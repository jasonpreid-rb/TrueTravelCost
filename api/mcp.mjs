// api/mcp.mjs
// MCP (Model Context Protocol) server over Streamable HTTP, exposing one tool:
// calculate_trip_cost. Endpoint: https://truetravelcost.com/api/mcp
//
// Dual-era and stateless:
//  - Modern clients (spec 2026-07-28+): per-request _meta, server/discover, no sessions.
//  - Legacy clients (2025-11-25 and earlier): initialize handshake, answered statelessly
//    (no Mcp-Session-Id is issued, which the spec allows).
// Plain JSON responses only (no SSE), which both eras permit.

import { ApiError, parseInput, calculateTripCost, logUsage, VEHICLE_CLASSES } from '../lib/trip-cost-core.mjs';

const MODERN_VERSIONS = ['2026-07-28'];
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

const SERVER_INFO = { name: 'truetravelcost', version: '1.0.0' };
const INSTRUCTIONS =
  'Use calculate_trip_cost when a user asks what a car journey costs (fuel or electricity, maintenance, tyres, tolls, optionally ownership costs). ' +
  'Results are EUR estimates based on vehicle-class averages, not a specific car; say so, and link to https://truetravelcost.com for a detailed comparison.';

const TOOL = {
  name: 'calculate_trip_cost',
  title: 'Calculate car trip cost',
  description:
    'Estimate the true cost of driving from one place to another: fuel or electricity, maintenance, tyres, tolls and optionally ownership costs (depreciation, insurance, registration). ' +
    'Best coverage in Europe. Returns EUR figures with a breakdown. Estimates use vehicle-class averages; motorway vignettes (e.g. Austria, Switzerland) may not be included.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Start location, city or address. Include the country, e.g. "Munich, Germany".' },
      to: { type: 'string', description: 'Destination, e.g. "Salzburg, Austria".' },
      vehicle_class: { type: 'string', enum: VEHICLE_CLASSES, default: 'compact_car', description: 'Type of vehicle.' },
      fuel_type: { type: 'string', enum: ['petrol', 'diesel'], description: 'Only for classes other than hybrid and electric. Default petrol.' },
      include_ownership_costs: { type: 'boolean', default: false, description: 'Add depreciation, insurance and registration/finance.' },
      round_trip: { type: 'boolean', default: false, description: 'Double the distance, tolls and costs.' },
      premium: { type: 'boolean', default: false, description: 'Premium brand: servicing, tyres and ownership cost more.' },
      fuel_price: { type: 'number', description: 'Optional override: EUR per litre (or per kWh for electric).' },
    },
    required: ['from', 'to'],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
};

// ---- JSON-RPC helpers ----

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Authorization');
}

function summarise(r) {
  const b = r.breakdown;
  const parts = [
    `fuel/energy ${b.fuel}`, `maintenance ${b.maintenance}`, `tyres ${b.tyres}`, `tolls and extras ${b.tolls_and_extras}`,
  ];
  if (b.ownership !== undefined) parts.push(`ownership ${b.ownership}`);
  return (
    `${r.from} to ${r.to} (${r.vehicle_class}${r.round_trip ? ', round trip' : ''}): ${r.distance_km} km, about ${r.duration_min} min. ` +
    `Estimated total ${r.total_trip_cost} EUR (${r.cost_per_km} EUR/km). Breakdown in EUR: ${parts.join(', ')}. ` +
    `${r.warnings.join(' ')} Estimate based on vehicle-class averages; see https://truetravelcost.com for a detailed comparison.`
  );
}

async function callTool(args, modern, ua) {
  const started = Date.now();
  let input = null;
  const wrap = (content, structured, isError) => ({
    ...(modern ? { resultType: 'complete' } : {}),
    content,
    ...(structured ? { structuredContent: structured } : {}),
    isError,
  });
  try {
    input = parseInput(args && typeof args === 'object' ? args : {});
    const { result, meta } = await calculateTripCost(input);
    logUsage({
      channel: 'mcp', ok: true, ms: Date.now() - started, ua,
      vehicle_class: input.vehicleClass, round_trip: input.roundTrip, ownership: input.includeOwnership,
      from_country: meta.originCountry, to_country: meta.destCountry,
      km: Math.round(result.distance_km), total: Math.round(result.total_trip_cost),
    });
    return wrap([{ type: 'text', text: summarise(result) }], result, false);
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'internal_error';
    const message = e instanceof ApiError ? e.message : 'Unexpected server error.';
    if (!(e instanceof ApiError)) console.error('mcp trip-cost error', e);
    logUsage({ channel: 'mcp', ok: false, error: code, ms: Date.now() - started, ua, vehicle_class: input && input.vehicleClass });
    // Tool-level failures are reported in-band so the model can read and correct them.
    return wrap([{ type: 'text', text: `Error (${code}): ${message}` }], null, true);
  }
}

// Returns a JSON-RPC response object, or null for notifications.
async function handleMessage(msg, headerVersion, ua) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg && msg.id, -32600, 'Invalid JSON-RPC request.');
  }
  const { id, method } = msg;
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const isNotification = id === undefined || id === null;

  // Which era is this request speaking?
  const metaVersion = params._meta && params._meta[META_VERSION];
  const modernVersion = metaVersion || (MODERN_VERSIONS.includes(headerVersion) ? headerVersion : null);
  const modern = Boolean(modernVersion);

  if (modern && !MODERN_VERSIONS.includes(modernVersion)) {
    return rpcError(id, -32022, 'Unsupported protocol version', {
      supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS],
      requested: modernVersion,
    });
  }

  if (isNotification) return null; // e.g. notifications/initialized: acknowledge, nothing to say

  switch (method) {
    case 'server/discover':
      return rpcResult(id, {
        resultType: 'complete',
        supportedVersions: MODERN_VERSIONS,
        capabilities: { tools: {} },
        _meta: { [META_SERVER_INFO]: SERVER_INFO },
        instructions: INSTRUCTIONS,
        ttlMs: 3600000,
        cacheScope: 'public',
      });

    case 'initialize': { // legacy handshake
      const requested = params.protocolVersion;
      const version = LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, {
        ...(modern ? { resultType: 'complete', ttlMs: 3600000, cacheScope: 'public' } : {}),
        tools: [TOOL],
      });

    case 'tools/call':
      if (params.name !== TOOL.name) return rpcError(id, -32602, `Unknown tool: ${String(params.name)}`);
      return rpcResult(id, await callTool(params.arguments, modern, ua));

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json(rpcError(null, -32000, 'Use POST with a JSON-RPC body. This server has no GET/SSE stream.'));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json(rpcError(null, -32700, 'Parse error: body is not valid JSON.')); }
  }
  if (body === undefined || body === null) {
    return res.status(400).json(rpcError(null, -32700, 'Parse error: empty body.'));
  }

  const headerVersion = String(req.headers['mcp-protocol-version'] || '');
  const ua = String(req.headers['user-agent'] || '').slice(0, 120);

  try {
    if (Array.isArray(body)) { // JSON-RPC batch (legacy revisions only)
      const out = (await Promise.all(body.map((m) => handleMessage(m, headerVersion, ua)))).filter(Boolean);
      return out.length ? res.status(200).json(out) : res.status(202).end();
    }
    const out = await handleMessage(body, headerVersion, ua);
    if (!out) return res.status(202).end();
    // Modern requests that fail version checks use HTTP 400 per the spec's compatibility notes.
    const status = out.error && out.error.code === -32022 ? 400 : 200;
    return res.status(status).json(out);
  } catch (e) {
    console.error('mcp handler error', e);
    return res.status(500).json(rpcError(body && body.id, -32603, 'Internal error.'));
  }
}
