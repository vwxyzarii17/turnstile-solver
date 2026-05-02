const express = require('express');
const { connect } = require("puppeteer-real-browser");

const app = express();
const port = process.env.PORT || 7860;
const authToken = process.env.authToken || null;
const domain = process.env.DOMAIN || `http://localhost:${port}`;

global.browserLimit = Number(process.env.browserLimit) || 3;
global.timeOut = Number(process.env.timeOut) || 60000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    domain: domain,
    endpoints: {
      turnstile: `${domain}/turnstile`
    },
    status: {
      browserLimit: global.browserLimit,
      timeOut: global.timeOut,
      authRequired: authToken !== null
    }
  });
});

if (process.env.NODE_ENV !== 'development') {
  let server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Domain: ${domain}`);
    console.log(`Auth required: ${authToken !== null}`);
  });
  try {
    server.timeout = global.timeOut;
  } catch {}
}

/* ================== BROWSER ================== */
async function createBrowser(proxyServer = null) {
  const connectOptions = {
    headless: true, // ✅ FIX WAJIB (Docker friendly)
    turnstile: true,
    connectOption: { defaultViewport: null },
    disableXvfb: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled"
    ]
  };

  if (proxyServer) {
    connectOptions.args.push(`--proxy-server=${proxyServer}`);
  }

  const { browser } = await connect(connectOptions);
  const [page] = await browser.pages();

  await page.goto('about:blank');

  // ✅ interception tetap ada, tapi tidak merusak Turnstile
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();

    // ❌ jangan blok stylesheet/font (bikin Turnstile gagal)
    if (["image", "media"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  return { browser, page };
}

/* ================== IMPORT ================== */
const turnstile = require('./turnstile');

/* ================== TURNSTILE ================== */
app.post('/turnstile', async (req, res) => {
  const data = req.body;

  if (!data) {
    return res.status(400).json({ message: 'Invalid body' });
  }

  if (global.browserLimit <= 0) {
    return res.status(429).json({ message: 'Too Many Requests' });
  }

  global.browserLimit--;

  let result, browser;

  try {
    console.log("➡️ Incoming request:", data); // debug

    const proxyServer = data.proxy
      ? `${data.proxy.hostname}:${data.proxy.port}`
      : null;

    const ctx = await createBrowser(proxyServer);
    browser = ctx.browser;
    const page = ctx.page;

    result = await turnstile(data, page).then(t => ({ token: t }));

  } catch (err) {
    console.error("❌ ERROR FULL:", err); // debug penting

    result = { 
      code: 500, 
      message: err.message,
      stack: err.stack
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    global.browserLimit++;
  }

  res.status(result.code ?? 200).json(result);
});

/* ================== 404 ================== */
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

if (process.env.NODE_ENV === 'development') {
  module.exports = app;
}
