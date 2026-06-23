async function turnstile({ domain, siteKey }, page) {

    if (!domain)
        throw new Error("Missing domain");

    if (!siteKey)
        throw new Error("Missing siteKey");

    const timeout = global.timeOut || 60000;

    const start = Date.now();

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadCallback" defer></script>
</head>

<body>

<div id="cf"></div>

<script>

window.onloadCallback = function() {

    turnstile.render("#cf", {

        sitekey: "${siteKey}",

        callback: function(token){

            let input = document.createElement("input");

            input.name = "cf-response";

            input.value = token;

            document.body.appendChild(input);

        }

    });

};

</script>

</body>
</html>
`;

    page.removeAllListeners("request");

    await page.setRequestInterception(true);

    page.on("request", async (request) => {

        if (
            request.resourceType() === "document" &&
            request.isNavigationRequest()
        ) {

            await request.respond({
                status: 200,
                contentType: "text/html",
                body: html
            });

        } else {

            await request.continue();

        }
    });

    await page.goto(domain, {
        waitUntil: "domcontentloaded"
    });

    await page.waitForSelector("[name='cf-response']", {
        timeout
    });

    const token = await page.$eval(
        "[name='cf-response']",
        el => el.value
    );

    if (!token || token.length < 20) {
        throw new Error("Token not found");
    }

    return {
        success: true,
        token,
        solveTime: (
            (Date.now() - start) / 1000
        ).toFixed(2) + "s"
    };
}

module.exports = turnstile;
