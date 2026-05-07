async function turnstile({ domain, proxy, siteKey }, page) {

  if (!domain) {
    throw new Error("Missing domain parameter");
  }

  if (!siteKey) {
    throw new Error("Missing siteKey parameter");
  }

  const timeout = global.timeOut || 60000;

  /*
  |--------------------------------------------------------------------------
  | PROXY AUTH
  |--------------------------------------------------------------------------
  */

  if (proxy?.username && proxy?.password) {

    await page.authenticate({
      username: proxy.username,
      password: proxy.password,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | HTML TURNSTILE
  |--------------------------------------------------------------------------
  */

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Turnstile Solver</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
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
      input.name = 'cf-response';
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
  | REQUEST INTERCEPTION
  |--------------------------------------------------------------------------
  */

  await page.setRequestInterception(true);

  page.removeAllListeners("request");

  page.on("request", async (request) => {

    try {

      const url = request.url();

      if (
        request.resourceType() === "document" &&
        (url === domain || url === domain + "/")
      ) {

        await request.respond({
          status: 200,
          contentType: "text/html",
          body: htmlContent,
        });

      } else {

        await request.continue();
      }

    } catch {}
  });

  /*
  |--------------------------------------------------------------------------
  | OPEN PAGE
  |--------------------------------------------------------------------------
  */

  await page.goto(domain, {
    waitUntil: "domcontentloaded",
    timeout
  });

  /*
  |--------------------------------------------------------------------------
  | WAIT TOKEN
  |--------------------------------------------------------------------------
  */

  await page.waitForSelector('[name="cf-response"]', {
    timeout
  });

  /*
  |--------------------------------------------------------------------------
  | GET TOKEN
  |--------------------------------------------------------------------------
  */

  const token = await page.$eval(
    '[name="cf-response"]',
    el => el.value
  );

  if (!token || token.length < 10) {
    throw new Error("Failed to get token");
  }

  return token;
}

module.exports = turnstile;
