// Real fuel consumption from the US EPA / DOE FuelEconomy.gov API.
// Free, no key, public domain data. US-market vehicles only (1984-present) --
// a vehicle never sold in the US will simply come back "not found", and the
// caller should fall back to the existing static/tier defaults.
//
// Flow mirrors the site's own year -> make -> model -> trim menus:
//   menu/model (list models for this make+year)
//     -> menu/options (list trims for that model, each with a vehicle id)
//       -> vehicle/{id} (the actual comb08 combined MPG figure)

const BASE = 'https://www.fueleconomy.gov/ws/rest';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw Object.assign(new Error('epa_request_failed'), { code: 'epa_request_failed' });
  return r.json();
}

// The menu endpoints wrap results as {"menuItem": [...]} when there are multiple entries,
// but collapse to {"menuItem": {...}} (a bare object, not a 1-item array) when there's only
// one -- a common quirk of this API's underlying XML-to-JSON conversion. Scan defensively
// in case the wrapper key ever differs from the documented "menuItem".
function asList(menuResponse) {
  if (!menuResponse || typeof menuResponse !== 'object') return [];
  const candidates = menuResponse.menuItem !== undefined ? menuResponse.menuItem : Object.values(menuResponse)[0];
  if (!candidates) return [];
  const list = Array.isArray(candidates) ? candidates : [candidates];
  return list.filter(o => o && typeof o === 'object' && 'text' in o && 'value' in o);
}

function bestMatch(list, typed, textKey) {
  if (!typed) return list[0] || null;
  const t = typed.trim().toLowerCase();
  if (!t) return list[0] || null;
  const exact = list.find(o => (o[textKey] || '').trim().toLowerCase() === t);
  if (exact) return exact;
  const contains = list.find(o => (o[textKey] || '').toLowerCase().includes(t) || t.includes((o[textKey] || '').toLowerCase()));
  if (contains) return contains;
  return list[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { make, model, trim, year } = req.body || {};
  if (!make || !model || typeof make !== 'string' || typeof model !== 'string') {
    return res.status(400).json({ error: 'bad_request' });
  }

  const y = parseInt(year, 10) || (new Date().getFullYear() - 1); // sensible default if year is blank

  try {
    const modelMenu = await getJson(`${BASE}/vehicle/menu/model?year=${y}&make=${encodeURIComponent(make)}`);
    const models = asList(modelMenu);
    if (!models.length) {
      return res.status(200).json({ found: false, reason: 'make_or_year_not_found' });
    }
    const matchedModel = bestMatch(models, model, 'text');
    if (!matchedModel) {
      return res.status(200).json({ found: false, reason: 'model_not_found' });
    }

    const optionsMenu = await getJson(`${BASE}/vehicle/menu/options?year=${y}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(matchedModel.value)}`);
    const options = asList(optionsMenu);
    if (!options.length) {
      return res.status(200).json({ found: false, reason: 'no_trims_found' });
    }
    const matchedOption = bestMatch(options, trim, 'text');
    if (!matchedOption) {
      return res.status(200).json({ found: false, reason: 'trim_not_found' });
    }

    const vehicle = await getJson(`${BASE}/vehicle/${matchedOption.value}`);
    const mpgCombined = parseFloat(vehicle.comb08);
    if (!mpgCombined || mpgCombined <= 0) {
      return res.status(200).json({ found: false, reason: 'no_mpg_data' });
    }

    return res.status(200).json({
      found: true,
      mpgCombined: mpgCombined,
      l100km: 235.214583 / mpgCombined,
      fuelType1: vehicle.fuelType1 || null,
      matchedModel: matchedModel.text,
      matchedTrim: matchedOption.text,
      matchedYear: y,
      exactTrimMatch: (trim || '').trim().toLowerCase() === (matchedOption.text || '').trim().toLowerCase(),
      source: 'fueleconomy.gov'
    });
  } catch (e) {
    return res.status(502).json({ error: e.code || 'network_error' });
  }
}
