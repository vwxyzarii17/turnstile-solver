const express = require('express');
const { connect } = require("puppeteer-real-browser");

const turnstile = require('./turnstile');

const app = express();

const port = process.env.PORT || 7860;

global.browserLimit = 3;
global.timeOut = 60000;

app.use(express.json({
  limit: "50mb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  res.json({
    status: true,
    message: "Turnstile Solver API Running"
  });

});

/* =========================
   CREATE BROWSER
========================= */

async function createBrowser(proxyServer = null) {

  const connectOptions = {
const connectOptions = {

  headless: true,

  turnstile: true,

  disableXvfb: true,

  executablePath: process.env.CHROME_PATH,

  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ]
};

    connectOption: {
      defaultViewport: null
    }
  };

  if (proxyServer) {
    connectOptions.args.push(
      `--proxy-server=${proxyServer}`
    );
  }

  const { browser } = await connect(connectOptions);

  const [page] = await browser.pages();

  await page.goto('about:blank');

  await page.setRequestInterception(true);

  page.on('request', (req) => {

    const type = req.resourceType();

    if ([
      "image",
      "stylesheet",
      "font",
      "media"
    ].includes(type)) {

      req.abort();

    } else {

      req.continue();
    }
  });

  return { browser, page };
}

/* =========================
   TURNSTILE ENDPOINT
========================= */

app.post('/turnstile', async (req, res) => {

  const data = req.body;

  if (!data.siteKey || !data.domain) {

    return res.status(400).json({
      message: 'siteKey & domain required'
    });
  }

  if (global.browserLimit <= 0) {

    return res.status(429).json({
      message: 'Too Many Requests'
    });
  }

  global.browserLimit--;

  let browser;
  let result;

  try {

    const proxyServer = data.proxy
      ? `${data.proxy.hostname}:${data.proxy.port}`
      : null;

    const ctx = await createBrowser(proxyServer);

    browser = ctx.browser;

    const page = ctx.page;

    const token = await turnstile(data, page);

    result = {
      token
    };

  } catch (err) {

    result = {
      message: err.message
    };

  } finally {

    if (browser) {

      try {
        await browser.close();
      } catch {}
    }

    global.browserLimit++;
  }

  res.json(result);
});

/* =========================
   404
========================= */

app.use((req, res) => {

  res.status(404).json({
    message: "Not Found"
  });

});

/* =========================
   START SERVER
========================= */

app.listen(port, () => {

  console.log(`Server running on ${port}`);

});
