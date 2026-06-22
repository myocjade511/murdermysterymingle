// Murder Mystery Mingle contact form API — saves leads to GitHub CSV
const https = require("https");

const GH_REPO = "myocjade511/murdermysterymingle";
const GH_PATH = "leads.csv";

function getToken() {
  return process.env.GH_TOKEN || "";
}

function ghRequest(method, body) {
  return new Promise((resolve, reject) => {
    const raw = getToken().replace(/[^\x20-\x7E]/g, "");
    const opts = {
      hostname: "api.github.com",
      path: "/repos/" + GH_REPO + "/contents/" + GH_PATH,
      method: method,
      headers: {
        "Authorization": "token " + raw,
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
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function appendToGitHubCsv(entry) {
  const getRes = await ghRequest("GET");
  let sha = null;
  let csv = "";
  if (getRes.status === 200) {
    sha = getRes.data.sha;
    csv = Buffer.from(getRes.data.content, "base64").toString("utf-8");
  }
  if (!csv) csv = "Timestamp,Name,Email,Phone,Event Type,Theme,Guest Count,Event Date,Message\n";

  const esc = (v) => '"' + (v || "").replace(/"/g, '""') + '"';
  const row = [
    esc(new Date().toISOString()),
    esc(entry.name),
    esc(entry.email),
    esc(entry.phone || ""),
    esc(entry.eventType || ""),
    esc(entry.theme || ""),
    esc(entry.guestCount || ""),
    esc(entry.eventDate || ""),
    esc(entry.message || ""),
  ].join(",") + "\n";

  const putRes = await ghRequest("PUT", JSON.stringify({
    message: "New lead: " + entry.name,
    content: Buffer.from(csv + row).toString("base64"),
    sha: sha || undefined,
    branch: "main",
  }));

  if (putRes.status !== 200 && putRes.status !== 201) {
    throw new Error("GitHub write error");
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, email, phone, eventType, theme, guestCount, eventDate, message } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required." });
    }

    if (getToken()) {
      await appendToGitHubCsv({ name, email, phone, eventType, theme, guestCount, eventDate, message });
    }

    return res.status(200).json({
      success: true,
      message: "Thanks! Your booking inquiry was sent. We'll get back to you within 24 hours.",
    });
  } catch (err) {
    console.error("Contact form error:", err.message || err);
    return res.status(500).json({ error: "Failed to send message. Please email andrew@murdermysterymingle.com directly." });
  }
};
