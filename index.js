const express = require('express');
const { connect } = require("puppeteer-real-browser");

const app = express();

const port = process.env.PORT || 7860;

app.use(express.json());

async function createBrowser() {

  const { browser, page } = await connect({

    headless: true,

    turnstile: true,

    disableXvfb: false,

    customConfig: {

      executablePath: process.env.CHROME_PATH
    },

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  return { browser, page };
}

app.post('/turnstile', async (req, res) => {

  let browser;

  try {

    const { siteKey, domain } = req.body;

    const ctx = await createBrowser();

    browser = ctx.browser;

    const page = ctx.page;

    await page.goto(domain, {
      waitUntil: 'networkidle2'
    });

    const token = await page.evaluate(async (siteKey) => {

      return new Promise((resolve) => {

        const div = document.createElement('div');

        div.id = "cf-turnstile";

        document.body.appendChild(div);

        const script = document.createElement('script');

        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js';

        script.onload = () => {

          turnstile.render('#cf-turnstile', {

            sitekey: siteKey,

            callback: token => {
              resolve(token);
            }
          });
        };

        document.head.appendChild(script);
      });

    }, siteKey);

    res.json({
      token
    });

  } catch (e) {

    res.status(500).json({
      message: e.message
    });

  } finally {

    if (browser) {
      await browser.close();
    }
  }
});

app.listen(port, () => {
  console.log("Server running on " + port);
});
