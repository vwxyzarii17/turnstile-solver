const express = require('express');
const { connect } = require('puppeteer-real-browser');

const app = express();

const port = process.env.PORT || 7860;

global.timeOut = Number(process.env.timeOut) || 60000;

/* ================= SINGLE BROWSER ================= */

let browser;
let browserReady = false;

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

}

/* ================= CREATE PAGE ================= */

async function createPage() {
  return browser.newPage();
}

/* ================= IMPORT ================= */

const turnstile = require('./turnstile');

/* ================= API ================= */

app.use(express.json({
  limit: '50mb'
}));

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

  await initBrowser();

  app.listen(port, () => {

    console.log(`Server running on ${port}`);

  });

})();
