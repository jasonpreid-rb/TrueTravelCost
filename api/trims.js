// Engine / trim options for a make + model + year straight from the FuelEconomy.gov
// (US EPA / DOE) database, including variant models (Corolla Hybrid, Model 3 Long Range...),
// so the Trim field offers real running-gear options. US-market vehicles only.
// GET so the response can be cached at the edge -- this data barely changes.
import { BASE, getJson, fuelCategory, candidateYears, entriesForYear } from './_epa.js';

const MAX_ENTRIES = 30;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const { make, model, year } = req.query || {};
  if (!make || !model) return res.status(400).json({ error: 'bad_request' });

  try {
    let entries = [], usedYear = null;
    for (const y of candidateYears(year)) {
      entries = await entriesForYear(String(make), String(model), y);
      if (entries.length) { usedYear = y; break; }
    }
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    if (!entries.length) return res.status(200).json({ found: false, trims: [] });

    const details = await Promise.all(entries.slice(0, MAX_ENTRIES).map(e =>
      getJson(`${BASE}/vehicle/${e.id}`).then(v => ({ e, v })).catch(() => ({ e, v: null }))
    ));
    const trims = details.map(({ e, v }) => {
      const mpg = v ? parseFloat(v.comb08) : NaN;
      return { text: e.text, fuelType: v ? fuelCategory(v) : null, mpg: mpg > 0 ? Math.round(mpg) : null };
    });
    return res.status(200).json({ found: true, matchedYear: usedYear, trims });
  } catch (e) {
    return res.status(502).json({ error: e.code || 'network_error' });
  }
}
