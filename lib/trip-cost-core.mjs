// lib/trip-cost-core.mjs
// Shared trip-cost logic used by both the REST endpoint (api/v1/trip-cost.mjs)
// and the MCP server (api/mcp.mjs).
//
// Requires env var HERE_API_KEY (same HERE account used for tolls/route).
//
// The constants below are copied from index.html so the API and the visual
// calculator agree: fuelByCountry, costByCountry (fx only), classDefaults,
// tyreLifeKm, PREMIUM_FACTOR, niceRound, 15,000 km/yr default annual distance.
// If you change those in index.html, change them here too (or move them into
// a shared module that both import).

const HERE_KEY = process.env.HERE_API_KEY;
const TIMEOUT_MS = 8000;

// ---------- constants copied from index.html ---------------------------

// Per litre in LOCAL currency (p = petrol/hybrid, d = diesel); e = EV energy per kWh.
const fuelByCountry = {
  DE: { p: 2.36, d: 2.46, e: 0.48 }, FR: { p: 2.17, d: 2.32, e: 0.32 }, ES: { p: 1.87, d: 1.86, e: 0.33 },
  IT: { p: 2.08, d: 2.22, e: 0.37 }, NL: { p: 2.43, d: 2.53, e: 0.32 }, BE: { p: 1.98, d: 2.32, e: 0.44 },
  AT: { p: 1.89, d: 2.22, e: 0.41 }, IE: { p: 1.89, d: 2.01, e: 0.51 }, PT: { p: 2.07, d: 2.18, e: 0.3 },
  GR: { p: 2.16, d: 2.15, e: 0.3 }, FI: { p: 2.32, d: 2.53, e: 0.28 }, LU: { p: 1.79, d: 2.15, e: 0.33 },
  EE: { p: 1.91, d: 2.09, e: 0.29 }, LV: { p: 1.98, d: 2.12, e: 0.31 }, LT: { p: 1.92, d: 2.21, e: 0.24 },
  SK: { p: 1.81, d: 1.95, e: 0.23 }, SI: { p: 1.64, d: 1.88, e: 0.27 }, HR: { p: 1.74, d: 1.94, e: 0.21 },
  CY: { p: 1.65, d: 1.94, e: 0.35 }, MT: { p: 1.34, d: 1.22, e: 0.16 }, BG: { p: 1.62, d: 1.88, e: 0.17 },
  RO: { p: 1.89, d: 2.02, e: 0.36 }, DK: { p: 19.1, d: 18.87, e: 3.09 }, SE: { p: 16.61, d: 22.0, e: 3.73 },
  PL: { p: 7.74, d: 8.63, e: 1.44 }, CZ: { p: 44.8, d: 49.2, e: 9.9 }, HU: { p: 675.5, d: 766.3, e: 53.3 },
  US: { p: 1.18, d: 1.73, e: 0.22 }, GB: { p: 1.72, d: 1.95, e: 0.34 }, CA: { p: 1.85, d: 2.05, e: 0.2 },
  JP: { p: 169.9, d: 160, e: 38.8 }, IN: { p: 102.1, d: 90, e: 10.0 }, BR: { p: 6.54, d: 6.65, e: 1.06 },
  NZ: { p: 3.22, d: 3.09, e: 0.41 }, AU: { p: 2.35, d: 2.54, e: 0.5 }, CH: { p: 2.05, d: 2.05, e: 0.34 },
  NO: { p: 32.85, d: 32.85, e: 2.83 }, SG: { p: 3.17, d: 2.92, e: 0.41 }, CN: { p: 9.57, d: 9.09, e: 0.69 },
  KR: { p: 2101.0, d: 1996.0, e: 225.0 }, ZA: { p: 29.4, d: 29.4, e: 3.5 }, MX: { p: 30.54, d: 29.01, e: 2.5 },
};
const FUEL_EU_FALLBACK = { p: 2.05, d: 2.15, e: 0.40 };

// Local currency per 1 EUR (fx) and servicing/tyre price level (m, t). Euro countries are absent = 1.
const costByCountry = {
  US: { fx: 1.14, m: 1.0,  t: 1.0  }, GB: { fx: 0.86, m: 1.1,  t: 1.0  },
  NZ: { fx: 2.0,  m: 1.0,  t: 1.05 }, AU: { fx: 1.76, m: 1.0,  t: 1.0  },
  CA: { fx: 1.6,  m: 0.95, t: 0.95 }, JP: { fx: 176,  m: 0.85, t: 0.9  },
  CN: { fx: 8.2,  m: 0.6,  t: 0.8  }, CH: { fx: 0.94, m: 1.4,  t: 1.2  },
  SE: { fx: 11,   m: 1.0,  t: 1.0  }, NO: { fx: 11.7, m: 1.3,  t: 1.1  },
  DK: { fx: 7.46, m: 1.2,  t: 1.1  }, PL: { fx: 4.25, m: 0.6,  t: 0.85 },
  CZ: { fx: 24.5, m: 0.6,  t: 0.85 }, HU: { fx: 395,  m: 0.6,  t: 0.85 },
  SG: { fx: 1.5,  m: 1.3,  t: 1.2  }, IN: { fx: 100,  m: 0.35, t: 0.6  },
  ZA: { fx: 20.5, m: 0.6,  t: 0.9  }, MX: { fx: 21,   m: 0.5,  t: 0.85 },
  BR: { fx: 6.3,  m: 0.6,  t: 0.9  }, KR: { fx: 1600, m: 0.8,  t: 0.9  },
};
const USD_PER_EUR = costByCountry.US.fx;

// AAA "Your Driving Costs 2025" anchors. mrt = maintenance+repairs+tyres, US cents/mile;
// tyre = tyre set USD; life = miles; own = depreciation+insurance+registration+finance, USD/yr.
const classDefaults = {
  small:      { mrt: 10.23, tyre: 480, life: 35000, own: 5360 },
  medium:     { mrt: 11.91, tyre: 600, life: 35000, own: 6501 },
  subsuv:     { mrt: 10.79, tyre: 560, life: 35000, own: 6480 },
  compactsuv: { mrt: 11.64, tyre: 650, life: 35000, own: 6819 },
  mediumsuv:  { mrt: 11.79, tyre: 780, life: 30000, own: 8618 },
  pickup:     { mrt: 11.36, tyre: 950, life: 30000, own: 10402 },
  hybrid:     { mrt: 9.75,  tyre: 600, life: 35000, own: 6847 },
  ev:         { mrt: 10.07, tyre: 850, life: 30000, own: 8412 },
};
const tyreLifeKm = { small: 40000, medium: 40000, subsuv: 40000, compactsuv: 40000, mediumsuv: 35000, pickup: 35000, hybrid: 40000, ev: 30000 };
const PREMIUM_FACTOR = 1.5;
const ANNUAL_KM = 15000;

function niceRound(n) { // 2 significant figures above 100, as in index.html
  if (n < 100) return Math.round(n);
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

// ---------- API-only presets (index.html takes consumption from /api/consumption) ----------

// consumption: L/100km petrol (diesel is x0.8, as index.html's 6.0 vs 7.5 defaults), kWh/100km for EVs.
const VEHICLES = {
  compact_car: { cls: 'small',      fuel: 'petrol',   consumption: 6.0 },
  sedan:       { cls: 'medium',     fuel: 'petrol',   consumption: 6.8 },
  small_suv:   { cls: 'subsuv',     fuel: 'petrol',   consumption: 6.8 },
  compact_suv: { cls: 'compactsuv', fuel: 'petrol',   consumption: 7.5 },
  suv:         { cls: 'mediumsuv',  fuel: 'petrol',   consumption: 9.0 },
  pickup:      { cls: 'pickup',     fuel: 'petrol',   consumption: 11.5 },
  hybrid:      { cls: 'hybrid',     fuel: 'hybrid',   consumption: 4.8 },
  electric:    { cls: 'ev',         fuel: 'electric', consumption: 16.0 },
};
const DIESEL_FACTOR = 0.8;

const ALPHA3_TO_2 = {
  DEU: 'DE', FRA: 'FR', ESP: 'ES', ITA: 'IT', NLD: 'NL', BEL: 'BE', AUT: 'AT', IRL: 'IE', PRT: 'PT', GRC: 'GR',
  FIN: 'FI', LUX: 'LU', EST: 'EE', LVA: 'LV', LTU: 'LT', SVK: 'SK', SVN: 'SI', HRV: 'HR', CYP: 'CY', MLT: 'MT',
  BGR: 'BG', ROU: 'RO', DNK: 'DK', SWE: 'SE', POL: 'PL', CZE: 'CZ', HUN: 'HU', USA: 'US', GBR: 'GB', CAN: 'CA',
  JPN: 'JP', IND: 'IN', BRA: 'BR', NZL: 'NZ', AUS: 'AU', CHE: 'CH', NOR: 'NO', SGP: 'SG', CHN: 'CN', KOR: 'KR',
  ZAF: 'ZA', MEX: 'MX',
};

// ---------- helpers ----------------------------------------------------

export class ApiError extends Error {
  constructor(http, code, message) {
    super(message);
    this.http = http;
    this.code = code;
  }
}

export const round2 = (n) => Math.round(n * 100) / 100;

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', '1', 'yes'].includes(v.toLowerCase());
  return false;
}

export function parseInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object.');
  }

  const from = typeof raw.from === 'string' ? raw.from.trim() : '';
  const to = typeof raw.to === 'string' ? raw.to.trim() : '';
  if (from.length < 2 || from.length > 200) {
    throw new ApiError(400, 'invalid_from', '"from" is required (2-200 characters), e.g. "Munich, Germany".');
  }
  if (to.length < 2 || to.length > 200) {
    throw new ApiError(400, 'invalid_to', '"to" is required (2-200 characters), e.g. "Salzburg, Austria".');
  }

  const vehicleClass = raw.vehicle_class || 'compact_car';
  if (!VEHICLES[vehicleClass]) {
    throw new ApiError(400, 'invalid_vehicle_class',
      `Unknown vehicle_class. Valid values: ${Object.keys(VEHICLES).join(', ')}.`);
  }

  let fuelType = null;
  if (raw.fuel_type !== undefined && raw.fuel_type !== null && raw.fuel_type !== '') {
    fuelType = String(raw.fuel_type).toLowerCase();
    if (!['petrol', 'diesel'].includes(fuelType)) {
      throw new ApiError(400, 'invalid_fuel_type', '"fuel_type" must be "petrol" or "diesel". Use vehicle_class "hybrid" or "electric" for those.');
    }
    if (['hybrid', 'electric'].includes(VEHICLES[vehicleClass].fuel)) {
      throw new ApiError(400, 'invalid_fuel_type', `"fuel_type" cannot be combined with vehicle_class "${vehicleClass}".`);
    }
  }

  let fuelPriceOverride = null;
  if (raw.fuel_price !== undefined && raw.fuel_price !== null && raw.fuel_price !== '') {
    fuelPriceOverride = Number(raw.fuel_price);
    if (!Number.isFinite(fuelPriceOverride) || fuelPriceOverride <= 0 || fuelPriceOverride > 10) {
      throw new ApiError(400, 'invalid_fuel_price', '"fuel_price" must be a positive number (EUR per litre or per kWh).');
    }
  }

  return {
    from,
    to,
    vehicleClass,
    fuelType,
    fuelPriceOverride,
    includeOwnership: toBool(raw.include_ownership_costs),
    roundTrip: toBool(raw.round_trip),
    premium: toBool(raw.premium),
  };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new ApiError(502, 'upstream_error', `Routing provider returned HTTP ${r.status}.`);
    return await r.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError(504, 'upstream_timeout', 'Routing provider timed out.');
    throw new ApiError(502, 'upstream_error', 'Could not reach routing provider.');
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(query) {
  const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  url.searchParams.set('lang', 'en-US'); // English place names in the response
  url.searchParams.set('apiKey', HERE_KEY);
  const data = await fetchJson(url);
  const item = data.items && data.items[0];
  if (!item) throw new ApiError(422, 'location_not_found', `Could not find a location for "${query}".`);
  const a3 = item.address && item.address.countryCode;
  return {
    lat: item.position.lat,
    lng: item.position.lng,
    label: item.title,
    country: ALPHA3_TO_2[a3] || null,
  };
}

async function route(a, b) {
  const url = new URL('https://router.hereapi.com/v8/routes');
  url.searchParams.set('transportMode', 'car');
  url.searchParams.set('origin', `${a.lat},${a.lng}`);
  url.searchParams.set('destination', `${b.lat},${b.lng}`);
  url.searchParams.set('return', 'summary,tolls');
  url.searchParams.set('currency', 'EUR');
  url.searchParams.set('apiKey', HERE_KEY);
  const data = await fetchJson(url);
  const r = data.routes && data.routes[0];
  if (!r) throw new ApiError(422, 'no_route', 'No drivable route found between these locations.');

  let meters = 0, seconds = 0, tolls = 0, tollsUnpriced = false;
  for (const section of r.sections || []) {
    meters += (section.summary && section.summary.length) || 0;
    seconds += (section.summary && section.summary.duration) || 0;
    for (const toll of section.tolls || []) {
      // A toll can list several fares (by payment method). Take the cheapest.
      const prices = (toll.fares || [])
        .map((f) => (f.convertedPrice ? f.convertedPrice.value : (f.price && f.price.currency === 'EUR' ? f.price.value : null)))
        .filter((v) => typeof v === 'number');
      if (prices.length) tolls += Math.min(...prices);
      else tollsUnpriced = true;
    }
  }
  return { km: meters / 1000, minutes: Math.round(seconds / 60), tolls, tollsUnpriced };
}

// Same maths as classCosts() in index.html, in EUR, for the metric / Europe baseline.
function classCostsEur(cls, premium, country) {
  const c = classDefaults[cls];
  const f = premium ? PREMIUM_FACTOR : 1;
  const maintPerMi = c.mrt / 100 - c.tyre / c.life;
  const annualMi = ANNUAL_KM * 0.621371;
  const region = costByCountry[country] || { fx: 1, m: 1, t: 1 };
  // index.html converts via USD -> local currency; dividing by region.fx gives EUR again.
  const eur = (usd, factor) => (usd / USD_PER_EUR) * factor;
  return {
    maintAnnual: niceRound(eur(maintPerMi * annualMi * f, region.m)),
    tyreSet: niceRound(eur(c.tyre * f, region.t)),
    tyreLifeKm: tyreLifeKm[cls],
    ownAnnual: niceRound(eur(c.own * f, region.m)),
  };
}

function energyPriceEur(country, kind) {
  const f = fuelByCountry[country] || FUEL_EU_FALLBACK;
  const local = kind === 'electric' ? f.e : kind === 'diesel' ? f.d : f.p;
  const fx = (costByCountry[country] && costByCountry[country].fx) || 1;
  return local / fx;
}

// ---------- main calculation -------------------------------------------

// input: the object returned by parseInput(). Returns { result, meta }.
// result is the public JSON; meta holds fields used only for logging.
export async function calculateTripCost(input) {
  if (!HERE_KEY) throw new ApiError(500, 'server_misconfigured', 'Routing provider is not configured.');

  const veh = VEHICLES[input.vehicleClass];
  const [origin, destination] = await Promise.all([geocode(input.from), geocode(input.to)]);
  const leg = await route(origin, destination);

  const legs = input.roundTrip ? 2 : 1;
  const km = leg.km * legs;
  const tolls = leg.tolls * legs;

  // Energy type, consumption and price (price follows the origin country, as the site does).
  const energy = veh.fuel === 'hybrid' ? 'petrol' : (input.fuelType || veh.fuel);
  const consumption = round2(veh.consumption * (input.fuelType === 'diesel' ? DIESEL_FACTOR : 1));
  const unitPrice = input.fuelPriceOverride ?? energyPriceEur(origin.country, energy);

  const costs = classCostsEur(veh.cls, input.premium, origin.country);

  const fuel = (km / 100) * consumption * unitPrice;
  const maintenance = (costs.maintAnnual / ANNUAL_KM) * km;
  const tyres = (costs.tyreSet / costs.tyreLifeKm) * km;

  const breakdown = {
    fuel: round2(fuel),
    maintenance: round2(maintenance),
    tyres: round2(tyres),
    tolls_and_extras: round2(tolls),
  };
  let total = fuel + maintenance + tyres + tolls;

  if (input.includeOwnership) {
    const ownership = (costs.ownAnnual / ANNUAL_KM) * km;
    breakdown.ownership = round2(ownership);
    total += ownership;
  }

  const warnings = [];
  if (leg.tollsUnpriced) warnings.push('Some toll points on this route had no published price and are counted as 0.');
  warnings.push('Vignette/sticker schemes (e.g. Austria, Switzerland) may not be included in tolls_and_extras.');
  if (!origin.country || !fuelByCountry[origin.country]) {
    warnings.push('Origin country not in the price table; EU-average fuel prices were used.');
  }

  const result = {
    status: 'success',
    currency: 'EUR',
    from: origin.label,
    to: destination.label,
    vehicle_class: input.vehicleClass,
    round_trip: input.roundTrip,
    distance_km: round2(km),
    duration_min: leg.minutes * legs,
    total_trip_cost: round2(total),
    cost_per_km: km > 0 ? round2(total / km) : 0,
    include_ownership_costs: input.includeOwnership,
    breakdown,
    assumptions: {
      energy_type: energy,
      consumption_per_100km: consumption,
      consumption_unit: energy === 'electric' ? 'kWh' : 'L',
      energy_price_per_unit: round2(unitPrice),
      annual_distance_km: ANNUAL_KM,
      premium_brand_factor: input.premium ? PREMIUM_FACTOR : 1,
    },
    warnings,
    source: 'https://truetravelcost.com',
    note: 'Estimate based on vehicle-class averages, not a specific car. For a vehicle-specific comparison use truetravelcost.com.',
  };

  return {
    result,
    meta: { originCountry: origin.country, destCountry: destination.country },
  };
}

export const VEHICLE_CLASSES = Object.keys(VEHICLES);

// One JSON line per call, for the Vercel Logs tab. Deliberately excludes the
// raw "from"/"to" text (can be home addresses): only countries, class and size.
export function logUsage(fields) {
  try {
    console.log(JSON.stringify({ evt: 'ttc_api', ...fields }));
  } catch { /* logging must never break a request */ }
}
