import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.PORT) || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.post('/turnstile/verify', async (req, res) => {
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      res.status(500).json({ ok: false, error: 'Missing TURNSTILE_SECRET_KEY' });
      return;
    }
    const token: string | undefined = req.body?.token;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing token' });
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
    if (!success) {
      res.status(200).json({ ok: false });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'verify failed' });
  }
});

// Expect { html: string }
app.post('/export', async (req, res) => {
  try {
    const html: string | undefined = req.body?.html;
    if (!html || typeof html !== 'string') {
      res.status(400).json({ error: 'Missing html' });
      return;
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: ['domcontentloaded', 'networkidle0'] });

    // US Letter portrait; use CSS padding for layout, keep PDF margins at 0 to match preview sizing
    const pdf = await page.pdf({
      printBackground: true,
      width: '8.5in',
      height: '11in',
      margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SWPPP_AppendixA.pdf"');
    res.send(Buffer.from(pdf));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'export failed' });
  }
});

// Serve built frontend (Vite dist) when deployed as a single Render service
// Note: keep this AFTER API routes so it doesn't intercept /export etc.
const distDir = path.resolve(__dirname, '../dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PDF server listening on http://localhost:${PORT}`);
});
