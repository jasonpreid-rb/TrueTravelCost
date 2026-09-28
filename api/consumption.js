// Real fuel consumption + engine details from the US EPA / DOE FuelEconomy.gov database.
// Free, no key. US-market vehicles only: anything never sold in the US comes back
// found:false and the caller keeps its existing defaults.
import { BASE, getJson, matchTrim, fuelCategory, consumptionFrom, candidateYears, entriesForYear } from './_epa.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { make, model, trim, year } = req.body || {};
  if (!make || !model || typeof make !== 'string' || typeof model !== 'string') {
    return res.status(400).json({ error: 'bad_request' });
  }
  const trimTyped = (typeof trim === 'string' ? trim : '').trim();

  try {
    let hit = null, sawModel = false;
    for (const y of candidateYears(year)) {
      const entries = await entriesForYear(make, model, y);
      if (!entries.length) continue;
      sawModel = true;
      // No trim typed: offer the first listed engine (flagged approximate).
      // Trim typed: it must genuinely match one, otherwise say nothing.
      const entry = trimTyped ? matchTrim(entries, trimTyped) : entries[0];
      if (!entry) continue;
      hit = { y, entry };
      break;
    }
    if (!hit) return res.status(200).json({ found: false, reason: sawModel ? 'trim_not_found' : 'model_not_found' });

    const v = await getJson(`${BASE}/vehicle/${hit.entry.id}`);
    const c = consumptionFrom(v);
    if (!c) return res.status(200).json({ found: false, reason: 'no_consumption_data' });

    return res.status(200).json({
      found: true,
      fuelType: fuelCategory(v),
      ...c,
      cylinders: v.cylinders || null,
      displacement: v.displ || null,
      matchedModel: hit.entry.model,
      matchedTrim: hit.entry.text,
      matchedYear: hit.y,
      exactTrimMatch: !!trimTyped && trimTyped.toLowerCase() === (hit.entry.text || '').trim().toLowerCase(),
      source: 'fueleconomy.gov'
    });
  } catch (e) {
    return res.status(502).json({ error: e.code || 'network_error' });
  }
}
