async function turnstile({ domain, siteKey }, page) {

    if (!domain)
        throw new Error("Missing domain parameter");

    if (!siteKey)
        throw new Error("Missing siteKey parameter");

    const timeout = global.timeOut || 60000;

    const startTime = Date.now();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Turnstile Solver</title>
</head>
<body>

<div id="cf-turnstile"></div>

<script>
window.token = null;
</script>

<script
src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
async defer>
</script>

<script>
window.onload = function () {

    turnstile.render("#cf-turnstile", {

        sitekey: "${siteKey}",

        callback: function(token) {

            window.token = token;

            const input = document.createElement("input");

            input.type = "hidden";
            input.id = "cf-response";
            input.value = token;

            document.body.appendChild(input);

        }

    });

};
</script>

</body>
</html>
`;

    await page.setRequestInterception(true);

    page.removeAllListeners("request");

    page.on("request", (request) => {

        const type = request.resourceType();

        if (
            type === "image" ||
            type === "stylesheet" ||
            type === "font" ||
            type === "media"
        ) {
            return request.abort();
        }

        if (
            request.resourceType() === "document" &&
            [domain, domain + "/"].includes(request.url())
        ) {

            return request.respond({
                status: 200,
                contentType: "text/html",
                body: htmlContent
            });

        }

        request.continue();

    });

    await page.goto(domain, {
        waitUntil: "domcontentloaded",
        timeout
    });

    await page.waitForFunction(() => {

        return (
            window.token &&
            window.token.length > 10
        );

    }, {
        timeout
    });

    const token = await page.evaluate(() => {
        return window.token;
    });

    if (!token) {
        throw new Error("Failed to obtain token");
    }

    const solveTime = (
        (Date.now() - startTime) / 1000
    ).toFixed(2);

    return {
        success: true,
        token,
        solveTime: solveTime + "s"
    };

}

module.exports = turnstile;
