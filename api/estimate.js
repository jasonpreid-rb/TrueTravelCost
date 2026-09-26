// POST /api/estimate
// Body:    { "prompt": "<the trip-estimate prompt built client-side>" }
// Returns: { "data": { ...parsed JSON from the model... } }
//
// Keeps the OpenAI API key server-side. The browser never sees it —
// it only ever talks to this same-origin endpoint.
//
// Deploy target: Vercel (zero-config — any file under /api becomes a
// serverless function). Set OPENAI_API_KEY (required) and optionally
// OPENAI_MODEL in the project's Environment Variables before deploying.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'server_misconfigured',
      message: 'OPENAI_API_KEY is not set on the server.'
    });
    return;
  }

  const prompt = req.body && req.body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'bad_request', message: 'Missing "prompt" string in request body.' });
    return;
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', message: 'Could not reach OpenAI: ' + (e && e.message) });
    return;
  }

  if (!upstream.ok) {
    let detail = '';
    try {
      const errBody = await upstream.json();
      detail = (errBody.error && errBody.error.message) || JSON.stringify(errBody);
    } catch (e) {
      detail = await upstream.text().catch(() => '');
    }
    res.status(upstream.status === 429 ? 429 : 502).json({
      error: upstream.status === 429 ? 'rate_limited' : 'upstream_error',
      message: detail.slice(0, 500)
    });
    return;
  }

  const payload = await upstream.json();
  const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;

  if (!content) {
    res.status(502).json({ error: 'upstream_error', message: 'No content returned from the model.' });
    return;
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    res.status(502).json({ error: 'invalid_json', message: 'Model did not return valid JSON.' });
    return;
  }

  res.status(200).json({ data });
}
