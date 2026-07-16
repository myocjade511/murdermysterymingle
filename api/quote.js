// Murder Mystery Mingle — Party Booking Calculator
// Returns an instant quote + lead capture
// Deployed as Vercel serverless function at /api/quote.js

const https = require("https");

const PRICING = {
  baseRate: 399,
  perGuestRate: 12,
  maxGuests: 50,
  minGuests: 10,
  packages: {
    "standard": { name: "Standard", description: "3-hour event, character cards, mystery script, professional host" },
    "premium":  { name: "Premium",  description: "4-hour event, character cards, mystery script, professional host, props, decorations guide, custom photos" },
    "deluxe":   { name: "Deluxe",   description: "5-hour event, character cards, mystery script, professional host, full props, custom decorations, photos, party favors" }
  },
  travelSurcharge: {
    chicago: 0,
    suburban: 75,
    other: 199,
    none: 0
  },
  addOns: {
    "photoBooth":    { name: "Photo Booth Setup",     price: 150 },
    "customTheme":   { name: "Custom Theme Writing",   price: 399 },
    "extraHost":     { name: "Second Host",            price: 199 },
    "streaming":     { name: "Virtual Guest Streaming", price: 99  }
  }
};

function calculateQuote({ guests = 20, packageName = "standard", location = "chicago", eventDuration = 3, addOns = [] }) {
  const pkg = PRICING.packages[packageName] || PRICING.packages.standard;
  const clampedGuests = Math.max(PRICING.minGuests, Math.min(PRICING.maxGuests, guests));
  const travel = PRICING.travelSurcharge[location] || PRICING.travelSurcharge.chicago;
  const guestCost = clampedGuests * PRICING.perGuestRate;
  const addOnTotal = addOns.reduce((sum, key) => sum + (PRICING.addOns[key]?.price || 0), 0);
  const subtotal = PRICING.baseRate + guestCost + travel + addOnTotal;
  const deposit = Math.round(subtotal * 0.35);
  const dueAtEvent = subtotal - deposit;

  const breakdown = [
    { item: "Base booking fee", amount: PRICING.baseRate },
    { item: `Per-guest fee (${clampedGuests} × $${PRICING.perGuestRate})`, amount: guestCost },
    { item: "Travel surcharge", amount: travel },
  ];

  for (const key of addOns) {
    if (PRICING.addOns[key]) {
      breakdown.push({ item: PRICING.addOns[key].name, amount: PRICING.addOns[key].price });
    }
  }

  breakdown.push({ item: "Subtotal", amount: subtotal });
  breakdown.push({ item: "Deposit (35%)", amount: deposit });
  breakdown.push({ item: "Balance due at event", amount: dueAtEvent });

  return {
    package: pkg,
    guests: clampedGuests,
    location,
    duration: eventDuration,
    subtotal,
    deposit,
    dueAtEvent,
    addOnTotal,
    breakdown
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({
      pricing: {
        baseRate: PRICING.baseRate,
        perGuest: PRICING.perGuestRate,
        minGuests: PRICING.minGuests,
        maxGuests: PRICING.maxGuests
      },
      packages: Object.fromEntries(
        Object.entries(PRICING.packages).map(([k, v]) => [k, { name: v.name, description: v.description }])
      ),
      travelSurcharge: PRICING.travelSurcharge,
      addOns: PRICING.addOns
    });
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const quote = calculateQuote(body);

      // If they included lead info, store it
      if (body.name && body.email) {
        const entry = {
          name: body.name,
          email: body.email,
          phone: body.phone || "",
          eventType: "booking-quote",
          theme: body.theme || "",
          guestCount: String(quote.guests),
          package: quote.package.name,
          estimatedTotal: `$${quote.subtotal}`,
          message: `Quote generated: ${quote.package.name} package, ${quote.guests} guests, $${quote.subtotal} total`
        };

        const token = (process.env.GH_TOKEN || "").replace(/[^\x20-\x7E]/g, "").trim();
        if (token && token.length > 10) {
          try {
            await appendLead(entry, token);
          } catch (e) {
            console.error("Lead save error (non-fatal):", e.message);
          }
        }
      }

      return res.status(200).json({ success: true, quote });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};

function ghRequest(method, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: "/repos/myocjade511/murdermysterymingle/contents/leads.csv",
      method,
      headers: {
        "Authorization": "Bearer " + token,
        "User-Agent": "murdermysterymingle",
        "Accept": "application/vnd.github.v3+json",
      },
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function appendLead(entry, token) {
  const getRes = await ghRequest("GET", null, token);
  let sha = null;
  let csv = "";
  if (getRes.status === 200) {
    sha = getRes.data.sha;
    csv = Buffer.from(getRes.data.content, "base64").toString("utf-8");
  }
  if (!csv) {
    csv = "Timestamp,Name,Email,Phone,Source,Theme,Guests,Package,Estimate,Message\n";
  }

  const esc = (v) => '"' + (v || "").replace(/"/g, '""') + '"';
  const row = [
    esc(new Date().toISOString()),
    esc(entry.name),
    esc(entry.email),
    esc(entry.phone),
    esc("booking-calculator"),
    esc(entry.theme || ""),
    esc(entry.guestCount || ""),
    esc(entry.package || ""),
    esc(entry.estimatedTotal || ""),
    esc(entry.message || ""),
  ].join(",") + "\n";

  await ghRequest("PUT", JSON.stringify({
    message: `Booking quote: ${entry.name} - ${entry.package}`,
    content: Buffer.from(csv + row).toString("base64"),
    sha: sha || undefined,
    branch: "main",
  }), token);
}
