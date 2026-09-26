// Real driving distance between two place names.
// Free, no Google billing: geocoding via OpenStreetMap's Nominatim, routing via OpenRouteService.
// Requires an ORS_API_KEY environment variable (free, no card, sign up at openrouteservice.org).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { from, to } = req.body || {};
  if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ error: 'bad_request' });
  }

  const orsKey = process.env.ORS_API_KEY;
  if (!orsKey) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const geocode = async (query) => {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=' + encodeURIComponent(query);
    const r = await fetch(url, {
      headers: {
        // Nominatim's usage policy requires an identifying User-Agent.
        'User-Agent': 'TrueTravelCost.com trip-cost-calculator (contact: hello@truetravelcost.com)'
      }
    });
    if (!r.ok) throw Object.assign(new Error('geocode_failed'), { code: 'geocode_failed' });
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) {
      throw Object.assign(new Error('location_not_found'), { code: 'location_not_found' });
    }
    return {
      coord: [parseFloat(data[0].lon), parseFloat(data[0].lat)], // ORS wants [lon, lat]
      countryCode: (data[0].address && data[0].address.country_code) ? data[0].address.country_code.toUpperCase() : null
    };
  };

  try {
    const [fromLoc, toLoc] = await Promise.all([geocode(from), geocode(to)]);
    const fromCoord = fromLoc.coord;
    const toCoord = toLoc.coord;

    const orsRes = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': orsKey
      },
      body: JSON.stringify({ coordinates: [fromCoord, toCoord] })
    });

    if (orsRes.status === 429) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    if (!orsRes.ok) {
      return res.status(502).json({ error: 'route_failed' });
    }

    const orsData = await orsRes.json();
    const summary = orsData && orsData.routes && orsData.routes[0] && orsData.routes[0].summary;
    if (!summary) {
      return res.status(502).json({ error: 'route_failed' });
    }

    return res.status(200).json({
      distanceKm: summary.distance / 1000,
      durationMin: summary.duration / 60,
      fromCountry: fromLoc.countryCode,
      toCountry: toLoc.countryCode
    });
  } catch (e) {
    return res.status(502).json({ error: e.code || 'network_error' });
  }
}
