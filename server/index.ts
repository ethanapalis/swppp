import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
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

app.listen(PORT, () => {
  console.log(`PDF server listening on http://localhost:${PORT}`);
});
