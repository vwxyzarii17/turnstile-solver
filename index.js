process.setMaxListeners(0);

const express = require('express');
const { connect } = require("puppeteer-real-browser");

const app = express();

const port = process.env.PORT || 7860;

/* =========================
   CONFIG
========================= */

global.timeOut = 120000;

/* =========================
   BROWSER POOL
========================= */

global.browserPool = [];

/* =========================
   PAGE POOL
========================= */

global.pagePool = [];

/* =========================
   BODY PARSER
========================= */

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

    headless: false,

    turnstile: true,

    disableXvfb: false,

    args: [

      '--no-sandbox',

      '--disable-setuid-sandbox',

      '--disable-dev-shm-usage',

      '--window-size=1920,1080',

      '--start-maximized',

      '--disable-blink-features=AutomationControlled',

      '--disable-features=IsolateOrigins,site-per-process',

      '--no-first-run',

      '--no-default-browser-check',

      '--disable-backgrounding-occluded-windows',

      '--disable-renderer-backgrounding',

      '--disable-background-timer-throttling'
    ],

    connectOption: {
      defaultViewport: null
    }
  };

  if (proxyServer) {

    connectOptions.args.push(
      `--proxy-server=${proxyServer}`
    );
  }

  const { browser } =
    await connect(connectOptions);

  browser.on('disconnected', () => {

    global.browserPool =
      global.browserPool.filter(
        b => b !== browser
      );

    global.pagePool =
      global.pagePool.filter(
        p => p.browser !== browser
      );

    console.log(
      'Browser disconnected'
    );
  });

  return browser;
}

/* =========================
   GET BROWSER FROM POOL
========================= */

async function getBrowser(proxyServer = null) {

  while (global.browserPool.length > 0) {

    const browser =
      global.browserPool.pop();

    try {

      if (
        browser &&
        browser.isConnected()
      ) {

        await browser.version();

        return browser;
      }

    } catch {

      try {
        await browser.close();
      } catch {}
    }
  }

  return await createBrowser(proxyServer);
}

/* =========================
   RELEASE BROWSER
========================= */

async function releaseBrowser(browser) {

  try {

    if (
      !browser ||
      !browser.isConnected()
    ) {

      try {
        await browser.close();
      } catch {}

      return;
    }

    global.browserPool.push(browser);

  } catch {

    try {
      await browser.close();
    } catch {}
  }
}

/* =========================
   INIT POOL
========================= */

async function initBrowserPool() {

  try {

    const browser =
      await createBrowser();

    global.browserPool.push(
      browser
    );

    console.log(
      'Browser pool ready'
    );

  } catch (err) {

    console.log(
      `Pool error: ${err.message}`
    );
  }
}

/* =========================
   PREPARE PAGE
========================= */

async function preparePage(page) {

  await page.setViewport({
    width: 1920,
    height: 1080
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9'
  });

  await page.evaluateOnNewDocument(() => {

    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });

    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32'
    });

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8
    });

  });
}

/* =========================
   GET PAGE FROM POOL
========================= */

async function getPage(browser) {

  while (global.pagePool.length > 0) {

    const item =
      global.pagePool.pop();

    try {

      if (
        item &&
        item.browser === browser &&
        !item.busy &&
        !item.page.isClosed()
      ) {

        item.busy = true;

        return item;
      }

    } catch {}
  }

  const page =
    await browser.newPage();

  await preparePage(page);

  return {
    browser,
    page,
    busy: true
  };
}

/* =========================
   RELEASE PAGE
========================= */

async function releasePage(item) {

  try {

    if (
      !item ||
      !item.page ||
      item.page.isClosed()
    ) {
      return;
    }

    try {

      await item.page.setRequestInterception(false);

    } catch {}

    item.page.removeAllListeners();

    /*
    |--------------------------------------------------------------------------
    | PAGE TETAP HIDUP
    |--------------------------------------------------------------------------
    */

    try {

      await item.page.goto(
        'about:blank',
        {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        }
      );

    } catch {}

    /*
    |--------------------------------------------------------------------------
    | COOKIE TIDAK DIHAPUS
    |--------------------------------------------------------------------------
    */

    item.busy = false;

    global.pagePool.push(item);

  } catch {}
}

/* =========================
   SOLVE TURNSTILE
========================= */

async function solveTurnstile(
  { domain, siteKey },
  page
) {

  if (!domain) {
    throw new Error("Missing domain");
  }

  if (!siteKey) {
    throw new Error("Missing siteKey");
  }

  /*
  |--------------------------------------------------------------------------
  | CUSTOM TURNSTILE HTML
  |--------------------------------------------------------------------------
  */

  const html = `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<script
src="https://challenges.cloudflare.com/turnstile/v0/api.js"
async
defer>
</script>

</head>

<body>

<div id="cf-turnstile"></div>

<script>

window.onload = () => {

  turnstile.render('#cf-turnstile', {

    sitekey: '${siteKey}',

    callback: function(token) {

      let input = document.createElement('input');

      input.type = 'hidden';

      input.id = 'token';

      input.value = token;

      document.body.appendChild(input);
    }
  });
};

</script>

</body>
</html>
`;

  /*
  |--------------------------------------------------------------------------
  | INTERCEPT DOMAIN
  |--------------------------------------------------------------------------
  */

  await page.setRequestInterception(true);

  page.removeAllListeners("request");

  page.on("request", async (req) => {

    try {

      if (req.isInterceptResolutionHandled()) {
        return;
      }

      if (
        req.url() === domain ||
        req.url() === domain + "/"
      ) {

        await req.respond({

          status: 200,

          contentType: "text/html",

          body: html
        });

      } else {

        await req.continue();
      }

    } catch {}
  });

  /*
  |--------------------------------------------------------------------------
  | OPEN PAGE
  |--------------------------------------------------------------------------
  */

  await page.goto(domain, {

    waitUntil: "networkidle2",

    timeout: global.timeOut
  });

  /*
  |--------------------------------------------------------------------------
  | WAIT TOKEN
  |--------------------------------------------------------------------------
  */

  await page.waitForSelector('#token', {

    timeout: global.timeOut
  });

  /*
  |--------------------------------------------------------------------------
  | GET TOKEN
  |--------------------------------------------------------------------------
  */

  const token = await page.$eval(
    '#token',
    el => el.value
  );

  if (!token) {

    throw new Error(
      "Failed get token"
    );
  }

  return token;
}

/* =========================
   API ENDPOINT
========================= */

app.post('/turnstile', async (req, res) => {

  const data = req.body;

  if (!data.domain || !data.siteKey) {

    return res.status(400).json({
      message: 'domain & siteKey required'
    });
  }

  let browser;
  let item;

  try {

    const proxyServer =
      data.proxy
        ? `${data.proxy.hostname}:${data.proxy.port}`
        : null;

    browser =
      await getBrowser(proxyServer);

    item =
      await getPage(browser);

    const start = Date.now();

    const token =
      await solveTurnstile(
        data,
        item.page
      );

    const end = Date.now();

    const solveTime =
      ((end - start) / 1000).toFixed(2);

    return res.json({
      token,
      solveTime: `${solveTime}s`
    });

  } catch (err) {

    return res.status(500).json({
      message: err.message
    });

  } finally {

    if (item) {

      await releasePage(item);
    }

    if (browser) {

      await releaseBrowser(browser);
    }
  }
});

/* =========================
   404
========================= */

app.use((req, res) => {

  res.status(404).json({
    message: 'Not Found'
  });

});

/* =========================
   START SERVER
========================= */

(async () => {

  await initBrowserPool();

  app.listen(port, () => {

    console.log(
      `Server running on ${port}`
    );

  });

})();
       
