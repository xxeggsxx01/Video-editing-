// Usage: node render.js out_dir [fps] [t0] [t1] [step]  — writes frame JPEGs via headless Chromium.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [outDir, fps = 30, t0 = 0, t1, only] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[error]', e.message));
  await page.goto(`http://localhost:${server.address().port}/scene.html`);
  await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
  fs.mkdirSync(outDir, { recursive: true });

  const dur = await page.evaluate('window.DURATION');
  const list = only ? only.split(',').map(Number) : Array.from({ length: Math.round(((t1 ? +t1 : dur) - +t0) * fps) }, (_, i) => +t0 + i / fps);
  const start = Date.now();
  for (let i = 0; i < list.length; i++) {
    await page.evaluate(t => window.renderAt(t), list[i]);
    const name = only ? `t${list[i].toFixed(2)}.jpg` : `f${String(Math.round(list[i] * fps)).padStart(5, '0')}.jpg`;
    await page.screenshot({ path: path.join(outDir, name), type: 'jpeg', quality: 93 });
    if (i % 60 === 0) console.log(`frame ${i}/${list.length} ${((Date.now() - start) / (i + 1)).toFixed(0)} ms/frame`);
  }
  await browser.close(); server.close();
});
