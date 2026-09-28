// Shared helpers for the FuelEconomy.gov (US EPA / DOE) vehicle database.
// Files starting with "_" are not exposed as routes by Vercel.
export const BASE = 'https://www.fueleconomy.gov/ws/rest';

export async function getJson(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw Object.assign(new Error('epa_request_failed'), { code: 'epa_request_failed' });
  return r.json();
}

// Menu endpoints return {"menuItem": [...]}, or a bare object when there is only one item.
export function asList(menuResponse) {
  if (!menuResponse || typeof menuResponse !== 'object') return [];
  const candidates = menuResponse.menuItem !== undefined ? menuResponse.menuItem : Object.values(menuResponse)[0];
  if (!candidates) return [];
  const list = Array.isArray(candidates) ? candidates : [candidates];
  return list.filter(o => o && typeof o === 'object' && 'text' in o && 'value' in o);
}

// Strict on purpose: never fall back to "whatever is first" -- another model's figures
// are worse than nothing. Returns EVERY related model (exact match first, then variants that
// start with the typed name), because the EPA lists e.g. "Corolla" and "Corolla Hybrid",
// or "Model 3 Long Range AWD" and "Model 3 Standard Range", as separate models.
export function matchModels(list, typed, max = 5) {
  const t = (typed || '').trim().toLowerCase();
  if (!t) return [];
  const txt = o => (o.text || '').trim().toLowerCase();
  const exact = list.filter(o => txt(o) === t);
  const starts = list.filter(o => txt(o) !== t && txt(o).startsWith(t));
  let out = [...exact, ...starts];
  if (!out.length) out = list.filter(o => txt(o).includes(t));
  return out.slice(0, max);
}

export function matchTrim(list, typed) {
  const t = (typed || '').trim().toLowerCase();
  if (!t) return null;
  const txt = o => (o.text || '').trim().toLowerCase();
  return list.find(o => txt(o) === t) || list.find(o => txt(o).includes(t)) || null;
}

function variantSuffix(modelText, typed) {
  const mt = (modelText || '').trim(), t = (typed || '').trim();
  if (mt.toLowerCase() === t.toLowerCase()) return '';
  return mt.toLowerCase().startsWith(t.toLowerCase()) ? mt.slice(t.length).trim() : mt;
}

// Every engine/trim entry for the model (and its variants) in one model year.
// Variant models are folded into the label: "Hybrid · Auto (...), 4 cyl, 1.8 L".
export async function entriesForYear(make, model, y) {
  let models;
  try { models = asList(await getJson(`${BASE}/vehicle/menu/model?year=${y}&make=${encodeURIComponent(make)}`)); }
  catch (e) { return []; }
  const matched = matchModels(models, model);
  const entries = [];
  await Promise.all(matched.map(async (m, order) => {
    try {
      const opts = asList(await getJson(`${BASE}/vehicle/menu/options?year=${y}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(m.value)}`));
      const suffix = variantSuffix(m.text, model);
      opts.slice(0, 8).forEach(o => entries.push({ order, id: o.value, model: m.text, text: suffix ? `${suffix} \u00b7 ${o.text}` : o.text }));
    } catch (e) { /* skip this variant */ }
  }));
  entries.sort((a, b) => a.order - b.order);
  const seen = new Set();
  return entries.filter(e => !seen.has(e.text) && seen.add(e.text));
}

// Map an EPA vehicle record to the site's own fuel categories.
export function fuelCategory(v) {
  const f1 = (v.fuelType1 || '').toLowerCase();
  const atv = (v.atvType || '').toLowerCase();
  if (atv.includes('hybrid')) return 'hybrid';           // Hybrid / Plug-in Hybrid
  if (f1.includes('electric') || atv === 'ev') return 'electric';
  if (f1.includes('diesel') || atv === 'diesel') return 'diesel';
  return 'petrol';
}

// Try the requested model year first, then neighbours, so a missing year still finds the model.
export function candidateYears(year) {
  const y = parseInt(year, 10) || (new Date().getFullYear() - 1);
  return [y, y - 1, y + 1, y - 2];
}

// Consumption in the site's units from an EPA vehicle record.
// Electric cars use the EPA's kWh/100mi figure (comb08 is MPGe, not what the field wants).
export function consumptionFrom(v) {
  const mpg = parseFloat(v.comb08);
  if (fuelCategory(v) === 'electric') {
    let kwh100mi = parseFloat(v.combE);
    if (!(kwh100mi > 0) && mpg > 0) kwh100mi = 3370.5 / mpg; // 33.7 kWh per gallon-equivalent
    if (!(kwh100mi > 0)) return null;
    return { unit: 'kwh', kwh100mi, kwh100km: kwh100mi / 1.609344, mpgCombined: mpg > 0 ? mpg : null, l100km: null };
  }
  if (!(mpg > 0)) return null;
  return { unit: 'fuel', mpgCombined: mpg, l100km: 235.214583 / mpg };
}
