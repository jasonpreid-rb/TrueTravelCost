export default function handler(req, res) {
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ country: /^[A-Z]{2}$/.test(country) ? country : null });
}
