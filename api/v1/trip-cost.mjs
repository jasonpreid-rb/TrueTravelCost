// api/v1/trip-cost.mjs
// REST endpoint for AI agents and developers.
// POST /api/v1/trip-cost  (GET with query params also works)
// All the maths lives in lib/trip-cost-core.mjs (shared with api/mcp.mjs).

import { ApiError, parseInput, calculateTripCost, logUsage } from '../../lib/trip-cost-core.mjs';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  if (req.method === 'GET') return req.query || {};
  let raw = req.body;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); }
    catch { throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.'); }
  }
  return raw;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const started = Date.now();
  const ua = String(req.headers['user-agent'] || '').slice(0, 120);
  let input = null;

  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      throw new ApiError(405, 'method_not_allowed', 'Use POST with a JSON body (or GET with query parameters).');
    }

    input = parseInput(readBody(req));
    const { result, meta } = await calculateTripCost(input);

    logUsage({
      channel: 'rest', ok: true, ms: Date.now() - started, ua,
      vehicle_class: input.vehicleClass, round_trip: input.roundTrip,
      ownership: input.includeOwnership, from_country: meta.originCountry,
      to_country: meta.destCountry, km: Math.round(result.distance_km),
      total: Math.round(result.total_trip_cost),
    });

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result);
  } catch (e) {
    const http = e instanceof ApiError ? e.http : 500;
    const code = e instanceof ApiError ? e.code : 'internal_error';
    const message = e instanceof ApiError ? e.message : 'Unexpected server error.';
    if (!(e instanceof ApiError)) console.error('trip-cost error', e);
    logUsage({
      channel: 'rest', ok: false, error: code, http, ms: Date.now() - started, ua,
      vehicle_class: input && input.vehicleClass,
    });
    return res.status(http).json({ status: 'error', error: { code, message } });
  }
}
