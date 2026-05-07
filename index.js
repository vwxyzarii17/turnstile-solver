process.setMaxListeners(0);

const express = require('express');
const { connect } = require("puppeteer-real-browser");

const app = express();

const port = process.env.PORT || 7860;

/* =========================
   CONFIG
========================= */

global.browserLimit = 3;
global.timeOut = 120000;

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
      '--disable-gpu'
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

  const [page] =
    await browser.pages();

  return { browser, page };
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

  if (global.browserLimit <= 0) {

    return res.status(429).json({
      message: 'Too Many Requests'
    });
  }

  global.browserLimit--;

  let browser;

  try {

    const proxyServer =
      data.proxy
        ? `${data.proxy.hostname}:${data.proxy.port}`
        : null;

    const ctx =
      await createBrowser(proxyServer);

    browser = ctx.browser;

    const page = ctx.page;

    const start = Date.now();

const token =
  await solveTurnstile(
    data,
    page
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

    if (browser) {

      try {
        await browser.close();
      } catch {}
    }

    global.browserLimit++;
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

app.listen(port, () => {

  console.log(
    `Server running on ${port}`
  );

});
