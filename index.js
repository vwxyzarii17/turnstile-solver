const express = require("express");
const { connect } = require("puppeteer-real-browser");

const app = express();

const port = process.env.PORT || 8080;
const authToken = process.env.authToken || null;
const domain = process.env.DOMAIN || `http://localhost:${port}`;

global.browserLimit = Number(process.env.browserLimit) || 3;
global.activeBrowser = 0;
global.timeOut = Number(process.env.timeOut) || 60000;

/* =========================
   EXPRESS
========================= */

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  res.json({
    message: "Server is running!",
    domain,
    endpoints: {
      turnstile: `${domain}/turnstile`,
      health: `${domain}/health`
    },
    status: {
      browserLimit: global.browserLimit,
      activeBrowser: global.activeBrowser,
      timeout: global.timeOut,
      authRequired: authToken !== null
    }
  });

});

/* =========================
   HEALTHCHECK
========================= */

app.get("/health", (_, res) => {
  res.send("OK");
});

/* =========================
   AUTH MIDDLEWARE
========================= */

app.use((req, res, next) => {

  if (!authToken) {
    return next();
  }

  const token =
    req.headers.authorization ||
    req.headers["x-api-key"];

  if (!token || token !== authToken) {

    return res.status(401).json({
      message: "Unauthorized"
    });

  }

  next();

});

/* =========================
   BROWSER
========================= */

async function createBrowser(proxyServer = null) {

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-zygote",
    "--single-process"
  ];

  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`);
  }

  const connectOptions = {
    headless: true,
    turnstile: true,
    disableXvfb: false,
    args,

    connectOption: {
      defaultViewport: null,
      timeout: global.timeOut
    }
  };

  const { browser } = await connect(connectOptions);

  const [page] = await browser.pages();

  await page.goto("about:blank");

  await page.setRequestInterception(true);

  page.on("request", async (req) => {

    try {

      const type = req.resourceType();

      if (
        ["image", "stylesheet", "font", "media"]
          .includes(type)
      ) {

        await req.abort();

      } else {

        await req.continue();

      }

    } catch {}

  });

  return {
    browser,
    page
  };

}

/* =========================
   TURNSTILE SOLVER
========================= */

async function turnstile({
  domain,
  proxy,
  siteKey
}, page) {

  if (!domain) {
    throw new Error("Missing domain parameter");
  }

  if (!siteKey) {
    throw new Error("Missing siteKey parameter");
  }

  const timeout = global.timeOut || 60000;

  if (
    proxy?.username &&
    proxy?.password
  ) {

    await page.authenticate({
      username: proxy.username,
      password: proxy.password
    });

  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Turnstile Solver</title>
</head>

<body>

<div id="turnstile-container"></div>

<script
src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"
defer>
</script>

<script>

window.onloadTurnstileCallback = function () {

  turnstile.render('#turnstile-container', {

    sitekey: '${siteKey}',

    callback: function(token) {

      let input = document.querySelector(
        '[name="cf-response"]'
      );

      if (!input) {

        input = document.createElement('input');

        input.type = 'hidden';
        input.name = 'cf-response';

        document.body.appendChild(input);

      }

      input.value = token;

    }

  });

};

</script>

</body>
</html>
`;

  const requestHandler = async (request) => {

    try {

      const url = request.url();

      if (
        request.resourceType() === "document" &&
        (url === domain || url === domain + "/")
      ) {

        await request.respond({
          status: 200,
          contentType: "text/html",
          body: htmlContent
        });

      } else {

        await request.continue();

      }

    } catch {}

  };

  page.on("request", requestHandler);

  try {

    await page.goto(domain, {
      waitUntil: "domcontentloaded",
      timeout
    });

    await Promise.race([

      page.waitForSelector(
        '[name="cf-response"]',
        { timeout }
      ),

      new Promise((_, reject) =>
        setTimeout(() => {
          reject(
            new Error("Turnstile timeout")
          );
        }, timeout)
      )

    ]);

    const token = await page.$eval(
      '[name="cf-response"]',
      el => el.value
    );

    if (!token || token.length < 10) {
      throw new Error(
        "Failed to get token"
      );
    }

    return token;

  } finally {

    page.off("request", requestHandler);

  }

}

/* =========================
   API
========================= */

app.post("/turnstile", async (req, res) => {

  const data = req.body;

  if (!data) {

    return res.status(400).json({
      message: "Invalid body"
    });

  }

  if (
    global.activeBrowser >=
    global.browserLimit
  ) {

    return res.status(429).json({
      message: "Too Many Requests"
    });

  }

  global.activeBrowser++;

  let browser;

  try {

    const proxyServer = data.proxy
      ? `${data.proxy.hostname}:${data.proxy.port}`
      : null;

    const ctx = await createBrowser(
      proxyServer
    );

    browser = ctx.browser;

    const token = await turnstile(
      data,
      ctx.page
    );

    return res.json({
      success: true,
      token
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: err.message
    });

  } finally {

    global.activeBrowser--;

    if (browser) {

      try {
        await browser.close();
      } catch {}

    }

  }

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
   START
========================= */

app.listen(port, () => {

  console.log(
    `Server running on port ${port}`
  );

  console.log(
    `Domain: ${domain}`
  );

  console.log(
    `Browser limit: ${global.browserLimit}`
  );

  console.log(
    `Timeout: ${global.timeOut}`
  );

});
