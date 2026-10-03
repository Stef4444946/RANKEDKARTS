import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch(error => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

const TIME_RE = /^(?:\d{1,2}:)?\d{1,2}[\.,]\d{2,3}$/;

function timeToSec(value) {
  const s = String(value ?? "").trim().replace(",", ".");
  if (!TIME_RE.test(s)) return null;
  const p = s.split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0];
}

async function readApex(url) {
  if (!/^https?:\\/\\/live\\.apex-timing\\.com\\//i.test(url)) {
    throw new Error("Gebruik een Apex Timing-link van live.apex-timing.com.");
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    const result = await page.evaluate(() => {
      const TIME_RE = /^(?:\d{1,2}:)?\d{1,2}[\.,]\d{2,3}$/;

      const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
      const normalizeTime = value => clean(value).replace(",", ".");

      function timeToSec(value) {
        const s = normalizeTime(value);
        if (!TIME_RE.test(s)) return null;
        const p = s.split(":").map(Number);
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
        if (p.length === 2) return p[0] * 60 + p[1];
        return p[0];
      }

      function looksTime(value) {
        const n = timeToSec(value);
        return n !== null && n > 10 && n < 300;
      }

      function extractBest(row) {
        const cells = [...row.querySelectorAll("td,th")];

        const preferred = cells.filter(c =>
          /posbest|best|personal|fast|bestlap/i.test(
            c.className + " " +
            c.id + " " +
            [...c.attributes].map(a => a.value).join(" ")
          )
        );

        for (const cell of preferred) {
          const value = clean(cell.innerText);
          if (looksTime(value)) {
            return { value: normalizeTime(value), source: "best-cell" };
          }
        }

        const times = [];
        for (const cell of cells) {
          const value = clean(cell.innerText);
          if (looksTime(value)) times.push(value);
        }

        if (!times.length) return null;

        times.sort((a, b) => timeToSec(a) - timeToSec(b));
        return { value: normalizeTime(times[0]), source: "fastest-visible" };
      }

      function extractKart(row) {
        const cells = [...row.querySelectorAll("td,th")];

        for (const cell of cells) {
          const type = (cell.getAttribute("data-type") || "").toLowerCase();
          const value = clean(cell.innerText);

          if (/kart|number|num|rk|car/.test(type) &&
              /^\d{1,3}$/.test(value)) {
            return value;
          }
        }

        for (const cell of cells.slice(0, 5)) {
          const value = clean(cell.innerText);
          if (/^\d{1,3}$/.test(value) &&
              Number(value) > 0 &&
              Number(value) < 1000) {
            return value;
          }
        }

        return null;
      }

      function extractDriver(row) {
        const cells = [...row.querySelectorAll("td,th")];

        for (const cell of cells) {
          const type = (cell.getAttribute("data-type") || "").toLowerCase();

          if (/dr|driver|name|pilot/.test(type)) {
            const value = clean(cell.innerText);

            if (
              value &&
              !looksTime(value) &&
              !/^[0-9]+$/.test(value)
            ) {
              return value;
            }
          }
        }

        for (const cell of cells) {
          const value = clean(cell.innerText);

          if (
            value &&
            !looksTime(value) &&
            value.length > 2 &&
            !/^\d+$/.test(value) &&
            !/^[-+]?\d/.test(value)
          ) {
            return value;
          }
        }

        return "";
      }

      function findRows() {
        const selectors = [
          "#tgrid tbody tr",
          "#tgrid tr",
          "table tbody tr"
        ];

        for (const selector of selectors) {
          const rows = [...document.querySelectorAll(selector)];
          if (rows.length) return rows;
        }

        return [];
      }

      function getText(selectors) {
        for (const selector of selectors) {
          const element = document.querySelector(selector);

          if (element && clean(element.innerText)) {
            return clean(element.innerText);
          }
        }

        return "";
      }

      function sessionName() {
        const found = getText([
          "#title_bar",
          ".title_bar",
          "h1",
          "h2",
          ".session_name",
          ".session",
          ".race_name",
          ".event-name"
        ]);

        return found || clean(document.title) || location.pathname;
      }

      function phaseName() {
        const text = [...document.querySelectorAll("body *")]
          .slice(0, 300)
          .map(e => clean(e.innerText))
          .filter(t => t && t.length < 120)
          .join(" | ");

        const match = text.match(
          /(Final|Finale|Semi Final|Semi-Final|Heat\s*\d+[A-Z]?|Kwalificatie|Qualification|Race\s*\d+)/i
        );

        return match ? clean(match[1]) : "";
      }

      const map = new Map();

      for (const row of findRows()) {
        const kart = extractKart(row);
        const best = extractBest(row);

        if (!kart || !best) continue;

        const driver = extractDriver(row);
        const previous = map.get(kart);

        if (
          !previous ||
          timeToSec(best.value) < timeToSec(previous.best)
        ) {
          map.set(kart, {
            kart,
            driver,
            best: best.value,
            source: best.source,
            bestSec: timeToSec(best.value)
          });
        }
      }

      const karts = [...map.values()]
        .sort((a, b) => Number(a.kart) - Number(b.kart));

      return {
        ok: karts.length > 0,
        session: sessionName(),
        phase: phaseName(),
        updated: Date.now(),
        url: location.href,
        title: document.title,
        karts
      };
    });

    return result;
  } finally {
    await context.close();
  }
}

app.post("/api/read", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();

    if (!url) {
      return res.status(400).json({
        ok: false,
        error: "Geen Apex Timing-link opgegeven."
      });
    }

    const data = await readApex(url);

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error?.message || "Apex Timing kon niet worden uitgelezen."
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "KartTime Reader WebApp" });
});

app.get("*splat", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(PORT, () => {
  console.log(`KartTime Reader draait op http://localhost:${PORT}`);
});