// Vercel serverless function: POST /api/tolls
// Body: { from: "Munich, Germany", to: "Salzburg, Austria", currency: "EUR" }
// Returns: { tollStatus: "found"|"none"|"unavailable", tollTotal: number|null, currency: "EUR" }  (one-way, passenger car)
//   found       = HERE returned a toll total for the route
//   none        = the route resolved but HERE reported no tolls (no tolls on the route, or no toll data for it -
//                 HERE's response doesn't distinguish the two)
//   unavailable = geocoding or the routing request failed, so we know nothing
//
// Needs the env var HERE_API_KEY (Vercel > Project > Settings > Environment Variables).
// The key stays on the server; the browser only ever calls /api/tolls.

const GEOCODE = 'https://geocode.search.hereapi.com/v1/geocode';
const ROUTER = 'https://router.hereapi.com/v8/routes';

async function geocode(q, key) {
  const url = `${GEOCODE}?q=${encodeURIComponent(q)}&limit=1&apiKey=${key}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const pos = j.items && j.items[0] && j.items[0].position;
  return pos ? `${pos.lat},${pos.lng}` : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const key = process.env.HERE_API_KEY;
  if (!key) return res.status(500).json({ error: 'server_misconfigured' });

  const { from, to, currency } = req.body || {};
  if (!from || !to || !/^[A-Z]{3}$/.test(currency || '')) return res.status(400).json({ error: 'bad_request' });

  try {
    const [o, d] = await Promise.all([geocode(from, key), geocode(to, key)]);
    if (!o || !d) return res.status(200).json({ tollStatus: 'unavailable', tollTotal: null, currency });

    // Toll pricing is an extra billable transaction on top of the route itself.
    // Leaving out tolls[vignettes]=all means a required vignette is included at its lowest price,
    // which is what you want for "true cost" of a one-off trip.
    const qs = new URLSearchParams({
      origin: o, destination: d, transportMode: 'car',
      return: 'summary,tolls', currency, departureTime: 'any', apiKey: key
    });
    qs.append('tolls[summaries]', 'total');

    const r = await fetch(`${ROUTER}?${qs.toString()}`);
    if (!r.ok) return res.status(200).json({ tollStatus: 'unavailable', tollTotal: null, currency });
    const j = await r.json();
    const section0 = j.routes && j.routes[0] && j.routes[0].sections && j.routes[0].sections[0];
    const total = section0 && section0.travelSummary && section0.travelSummary.tolls && section0.travelSummary.tolls.total;
    // HERE puts the summary under sections[].summary.tolls.total (travelSummary is a fallback shape).
    const summaryTotal = section0 && section0.summary && section0.summary.tolls && section0.summary.tolls.total;
    const t = summaryTotal || total;

    if (!section0) return res.status(200).json({ tollStatus: 'unavailable', tollTotal: null, currency });
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    if (t && typeof t.value === 'number' && t.value > 0) {
      return res.status(200).json({ tollStatus: 'found', tollTotal: t.value, currency: t.currency || currency });
    }
    return res.status(200).json({ tollStatus: 'none', tollTotal: 0, currency });
  } catch (e) {
    return res.status(200).json({ tollStatus: 'unavailable', tollTotal: null, currency });
  }
};
