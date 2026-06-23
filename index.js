const express = require("express");
const { connect } = require("puppeteer-real-browser");

const turnstile = require("./turnstile");

const app = express();

const PORT = process.env.PORT || 7860;

global.timeOut = 60000;

let browser;
let browserReady = false;

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

async function initBrowser() {

    console.log("Starting browser...");

    const { browser: br } = await connect({
        headless: false,
        turnstile: true,
        disableXvfb: false,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ],
        connectOption: {
            defaultViewport: null
        }
    });

    browser = br;

    browser.on("disconnected", () => {
        console.log("BROWSER DISCONNECTED");
        browserReady = false;
    });

    browserReady = true;

    console.log("Browser ready");
}

async function createPage() {

    const page = await browser.newPage();

    await page.setRequestInterception(true);

    page.on("request", (req) => {

        const type = req.resourceType();

        if (
            type === "image" ||
            type === "font" ||
            type === "stylesheet" ||
            type === "media"
        ) {
            req.abort();
        } else {
            req.continue();
        }
    });

    return page;
}

app.use(express.json({
    limit: "50mb"
}));

app.get("/", (req, res) => {
    res.send("Turnstile API Running");
});

app.post("/turnstile", async (req, res) => {

    if (!browserReady) {
        return res.status(503).json({
            success: false,
            message: "Browser not ready"
        });
    }

    let page;

    try {

        page = await createPage();

        const result = await Promise.race([

            turnstile(req.body, page),

            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error("Solve timeout"));
                }, global.timeOut);
            })

        ]);

        await page.close();

        res.json(result);

    } catch (e) {

        if (page) {
            try {
                await page.close();
            } catch {}
        }

        res.status(500).json({
            success: false,
            message: e.message
        });
    }
});

(async () => {

    await initBrowser();

    app.listen(PORT, () => {
        console.log("Server running on " + PORT);
    });

})();
