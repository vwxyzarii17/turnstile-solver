async function turnstile({ domain, proxy, siteKey }, page) {

  if (!domain) throw new Error("Missing domain parameter");
  if (!siteKey) throw new Error("Missing siteKey parameter");

  const timeout = global.timeOut || 60000;
  let isResolved = false;

  const cl = setTimeout(() => {
    if (!isResolved) {
      console.error("⏱️ Turnstile timeout");
    }
  }, timeout);

  try {

    if (proxy?.username && proxy?.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<body>

<div class="turnstile"></div>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback" defer></script>

<script>
window.onloadTurnstileCallback = function() {

  turnstile.render('.turnstile', {

    sitekey: '${siteKey}',

    callback: function(token) {

      var c = document.createElement('input');

      c.type = 'hidden';
      c.name = 'cf-response';
      c.value = token;

      document.body.appendChild(c);

    }

  });

};
</script>

</body>
</html>
`;

    // ❌ JANGAN set interception lagi kalau sudah di createBrowser
    // await page.setRequestInterception(true);

    page.removeAllListeners("request");

    page.on("request", (request) => {
      try {

        if (
          [domain, domain + "/"].includes(request.url()) &&
          request.resourceType() === "document"
        ) {

          request.respond({
            status: 200,
            contentType: "text/html",
            body: htmlContent,
          });

        } else {
          request.continue();
        }

      } catch (err) {
        console.error("❌ Request handler error:", err.message);
        try { request.continue(); } catch {}
      }
    });

    console.log("➡️ Navigating to:", domain);

    await page.goto(domain, { waitUntil: "domcontentloaded" });

    console.log("⏳ Waiting for Turnstile...");

    await page.waitForSelector('[name="cf-response"]', { timeout });

    const token = await page.evaluate(() => {
      try {
        return document.querySelector('[name="cf-response"]').value;
      } catch {
        return null;
      }
    });

    console.log("✅ Token:", token);

    isResolved = true;
    clearTimeout(cl);

    if (!token || token.length < 10) {
      throw new Error("Failed to get token");
    }

    return token;

  } catch (e) {

    clearTimeout(cl);
    console.error("❌ Turnstile error:", e);

    throw e;

  }

}

module.exports = turnstile;
