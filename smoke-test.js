const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeServer(htmlPath) {
  const html = fs.readFileSync(htmlPath);
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/writeboost.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });
  return server;
}

async function run() {
  const htmlPath = path.join(__dirname, 'writeboost.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing file: ${htmlPath}`);
  }

  const server = makeServer(htmlPath);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseURL = `http://127.0.0.1:${port}/writeboost.html`;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

    // Dashboard visible
    await page.waitForSelector('#dashboard.page.active', { timeout: 5000 });

    // Pick first prompt -> practice
    await page.click('#prompts-grid .prompt-card');
    await page.waitForSelector('#practice.page.active', { timeout: 5000 });
    await page.waitForSelector('#essay-input', { timeout: 5000 });

    // Type a >= 50-word story with flat words & dialogue
    const story =
      'I was happy when I found a small door behind the old tree. ' +
      '"Who are you?" I said, but no one answered. ' +
      'The air felt cold and quiet, then suddenly the ground shook. ' +
      'I ran, scared, but I kept going because I was brave. ' +
      'Finally I saw a light and felt relief as the mystery ended.';
    await page.fill('#essay-input', story);
    await page.waitForTimeout(200);

    // Word count updates
    const wc = Number(await page.textContent('#word-count'));
    if (!Number.isFinite(wc) || wc <= 0) {
      throw new Error(`Word count not updating, got: ${wc}`);
    }

    // Timer start/pause
    await page.click('#timer-start');
    await sleep(1200);
    await page.click('#timer-start'); // pause

    // Challenge modal add
    await page.click('button:has-text("Challenge")');
    await page.waitForSelector('#challenge-modal.active', { timeout: 3000 });
    await page.click('button:has-text("Add to Story")');
    await page.waitForSelector('#challenge-modal:not(.active)', { timeout: 3000 });

    // Power words modal search + click word (toast should show even if copy blocked)
    await page.click('button:has-text("Power Words")');
    await page.waitForSelector('#power-words-modal.active', { timeout: 3000 });
    await page.fill('#modal-power-word', 'walk');
    await page.click('button:has-text("Go")');
    await page.waitForSelector('#modal-power-results .power-word-item', { timeout: 3000 });
    await page.click('#modal-power-results .power-word-item');
    await page.waitForSelector('#toast.show', { timeout: 3000 });

    // Submit -> results
    await page.click('button:has-text("Submit")');
    await page.waitForSelector('#results.page.active', { timeout: 5000 });
    const finalScore = await page.textContent('#final-score');
    if (!finalScore || !finalScore.trim()) {
      throw new Error('Final score missing on results page');
    }

    // Export should trigger a download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('header button[title="Export data backup"]');
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    if (!suggested.endsWith('.json')) {
      throw new Error(`Unexpected export filename: ${suggested}`);
    }
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }

  if (pageErrors.length || consoleErrors.length) {
    const details = [
      ...(pageErrors.length ? ['Page errors:', ...pageErrors] : []),
      ...(consoleErrors.length ? ['Console errors:', ...consoleErrors] : []),
    ].join('\n');
    throw new Error(`Smoke test found errors:\n${details}`);
  }

  return 'OK';
}

run()
  .then((msg) => {
    // eslint-disable-next-line no-console
    console.log(msg);
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });

