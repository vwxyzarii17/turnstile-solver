const express = require("express");
const { connect } = require("puppeteer-real-browser");

const app = express();

const port = process.env.PORT || 7860;

global.timeOut = Number(process.env.timeOut) || 60000;

let browser = null;
let browserReady = false;

/* ================= ERROR HANDLER ================= */

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
});

/* ================= INIT BROWSER ================= */

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

    browserReady = true;

    browser.on("disconnected", () => {
        console.log("Browser disconnected");

        browserReady = false;
        browser = null;
    });

    console.log("Browser ready");
}

/* ================= START BROWSER ================= */

async function startBrowser() {

    while (true) {

        try {

            browserReady = false;

            await initBrowser();

            break;

        } catch (err) {

            console.log("Browser start failed:", err.message);

            await new Promise(resolve => {
                setTimeout(resolve, 5000);
            });

        }

    }

}

/* ================= CREATE PAGE ================= */

async function createPage() {

    if (!browser || !browser.isConnected()) {
        throw new Error("Browser unavailable");
    }

    return await browser.newPage();

}

/* ================= IMPORT ================= */

const turnstile = require("./turnstile");

/* ================= EXPRESS ================= */

app.use(express.json({
    limit: "50mb"
}));

/* ================= HEALTH ================= */

app.get("/", (req, res) => {

    res.json({
        status: "running",
        browser: browserReady
    });

});

/* ================= TURNSTILE API ================= */

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

        try {
            await page.close();
        } catch {}

        return res.json(result);

    } catch (err) {

        console.error(err);

        if (page) {

            try {
                await page.close();
            } catch {}

        }

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

/* ================= WATCHDOG ================= */

setInterval(async () => {

    try {

        if (!browser || !browser.isConnected()) {

            console.log("Browser dead. Restarting...");

            await startBrowser();

        }

    } catch (err) {

        console.log("Watchdog error:", err.message);

    }

}, 10000);

/* ================= START SERVER ================= */

(async () => {

    await startBrowser();

    app.listen(port, () => {

        console.log(`Server running on ${port}`);

    });

})();
