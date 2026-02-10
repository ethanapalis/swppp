async function readJsonBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve());
    req.on('error', reject);
  });

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  try {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Missing TURNSTILE_SECRET_KEY' }));
      return;
    }

    const body = await readJsonBody(req);
    const token = body?.token;
    if (!token || typeof token !== 'string') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Missing token' }));
      return;
    }

    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);

    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const data: any = await r.json().catch(() => ({}));
    const success = Boolean(data?.success);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    if (!success) {
      res.end(JSON.stringify({ ok: false, errorCodes: data?.['error-codes'] }));
      return;
    }
    res.end(JSON.stringify({ ok: true }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: e?.message || 'verify failed' }));
  }
}
