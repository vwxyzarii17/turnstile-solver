const express = require('express');
const { connect } = require('puppeteer-real-browser');
const turnstile = require('./Api/turnstile.js');
const app = express();

const port = process.env.PORT || 7860;

global.timeOut = Number(process.env.timeOut) || 60000;

/* ================= SINGLE BROWSER ================= */

let browser;
let browserReady = false;
let restarting = false;

/* ================= INIT ================= */

async function initBrowser() {

  console.log('Starting browser...');

  const { browser: br } = await connect({
    headless: false,
    turnstile: true,
    connectOption: {
      defaultViewport: null
    },
    disableXvfb: false,
  });

  browser = br;

  browserReady = true;

  console.log('Browser ready');

  browser.on('disconnected', async () => {

    console.log('Browser disconnected');

    browserReady = false;

    if (restarting) return;

    restarting = true;

    setTimeout(async () => {

      try {

        console.log('Restarting browser...');

        await initBrowser();

      } catch (e) {

        console.error(e);

      }

      restarting = false;

    }, 5000);

  });

}

/* ================= BROWSER MONITOR ================= */

setInterval(async () => {

  if (!browser || !browser.isConnected()) {

    if (restarting) return;

    restarting = true;

    browserReady = false;

    console.log('Browser not connected. Restarting...');

    try {

      await initBrowser();

    } catch (e) {

      console.error(e);

    }

    restarting = false;

  }

}, 30000);

/* ================= CREATE PAGE ================= */

async function createPage() {

  const page = await browser.newPage();

  await page.setRequestInterception(true);

  page.on('request', (req) => {

    const type = req.resourceType();

    if (
      type === 'image' ||
      type === 'stylesheet' ||
      type === 'font' ||
      type === 'media'
    ) {

      req.abort();

    } else {

      req.continue();

    }

  });

  return page;
}



/* ================= API ================= */

app.use(express.json());

/* ================= HEALTH CHECK ================= */

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    browser: browserReady
  });
});

app.post('/turnstile', async (req, res) => {

  if (!browserReady) {

    return res.status(503).json({
      success: false,
      message: 'Browser not ready'
    });

  }

  let page;

  try {

    page = await createPage();

    const result = await Promise.race([

      turnstile(req.body, page),

      new Promise((_, reject) => {

        setTimeout(() => {
          reject(new Error('Solve timeout'));
        }, global.timeOut);

      })

    ]);

    try {
      await page.close();
    } catch {}

    return res.json(result);

  } catch (err) {

    if (page) {

      try {
        await page.close();
      } catch {}

    }

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

});

/* ================= START ================= */

(async () => {

  try {

    await initBrowser();

    app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on ${port}`);
});

  } catch (e) {

    console.error('Failed to start browser:', e);

    process.exit(1);

  }

})();

/* ================= PROCESS HANDLER ================= */

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
