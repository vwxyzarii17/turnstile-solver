async function turnstile({ domain, siteKey }, page) {

if (!domain) throw new Error("Missing domain parameter");
if (!siteKey) throw new Error("Missing siteKey parameter");

const timeout = global.timeOut || 60000;
let isResolved = false;

const startTime = Date.now();

const cl = setTimeout(() => {
if (!isResolved) {
console.error("Turnstile timeout");
}
}, timeout);

try {

const htmlContent = `

<!DOCTYPE html><html>
<body><div class="turnstile"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback" defer></script><script>
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
</script></body>
</html>
`;await page.setRequestInterception(true);

page.removeAllListeners("request");

page.on("request", async (request) => {

  if ([domain, domain + "/"].includes(request.url()) &&
      request.resourceType() === "document") {

    await request.respond({
      status: 200,
      contentType: "text/html",
      body: htmlContent,
    });

  } else {

    await request.continue();

  }

});

await page.goto(domain, {
  waitUntil: "domcontentloaded"
});

await page.waitForSelector('[name="cf-response"]', {
  timeout
});

const token = await page.evaluate(() => {

  const el = document.querySelector('[name="cf-response"]');

  return el ? el.value : null;

});

isResolved = true;

clearTimeout(cl);

if (!token || token.length < 10) {
  throw new Error("Failed to get token");
}

const solveTime = (
  (Date.now() - startTime) / 1000
).toFixed(2);

return {
  token,
  solveTime: solveTime + "s"
};

} catch (e) {

clearTimeout(cl);

throw e;

}

}

module.exports = turnstile;
