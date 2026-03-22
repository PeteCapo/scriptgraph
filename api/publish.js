// api/publish.js — Vercel serverless function
// Receives a JSON file + password, commits it to the public library via GitHub API.
// Also writes an enriched manifest entry and appends to activity-log.json.
//
// Required Vercel environment variables:
//   PUBLISH_PASSWORD  — a secret password you choose
//   GITHUB_TOKEN      — a GitHub Personal Access Token with repo write access
//   GITHUB_REPO       — your repo in "owner/repo" format, e.g. "PeteCapo/scriptgraph"
//   GITHUB_BRANCH     — branch to commit to, e.g. "main"

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password, filename, content } = req.body || {};

  if (!password || !filename || !content) {
    return res.status(400).json({ error: "Missing required fields: password, filename, content" });
  }
  if (password !== process.env.PUBLISH_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const reserved = ["manifest.json", "index.json", "config.json", "activity-log.json"];
  if (!/^[a-z0-9-]+\.json$/.test(filename) || reserved.includes(filename)) {
    return res.status(400).json({ error: `Invalid or reserved filename: ${filename}` });
  }

  // Validate content and extract metadata for manifest
  let parsed;
  try {
    parsed = JSON.parse(content);
    if (!parsed.title || !parsed.scenes || !parsed.overallTension) {
      return res.status(400).json({ error: "Invalid ScriptGraph JSON — missing required fields" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid JSON content" });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token || !repo) return res.status(500).json({ error: "Server configuration missing" });

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async function getFile(path) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    let decoded;
    try { decoded = JSON.parse(Buffer.from(data.content, "base64").toString("utf8")); } catch { decoded = null; }
    return { sha: data.sha, data: decoded };
  }

  async function putFile(path, sha, jsonData, message) {
    const body = {
      message,
      content: Buffer.from(JSON.stringify(jsonData, null, 2) + "\n").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    };
    const r = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      { method: "PUT", headers, body: JSON.stringify(body) }
    );
    if (!r.ok) {
      const err = await r.json();
      throw new Error(`GitHub PUT failed for ${path}: ${err.message}`);
    }
    return r;
  }

  // ── Compute confidence from scene data (proxy — real value computed in analyzer) ──
  // This matches the logic in computeAnalysisReport in script-analyzer.jsx.
  // If the exported JSON contains a top-level `confidence` field (future exports will),
  // we use that directly. Otherwise we compute a proxy from scene geometry.
  function deriveConfidence(p) {
    // Prefer explicit confidence if the JSON has it (added in future analyzer exports)
    if (p.confidence && ["HIGH", "MEDIUM", "LOW"].includes(p.confidence.toUpperCase())) {
      return p.confidence.toUpperCase();
    }
    // Proxy from scene geometry
    const totalScenes = p.totalScenes || (p.scenes || []).length || 0;
    const totalPages = p.totalPages || 1;
    const genre = (p.genre || "").toLowerCase();
    const isAction = /action|thriller|horror|sci.fi|adventure|superhero|crime/.test(genre);
    const expectedAvgLength = isAction ? 1.2 : 1.8;
    const estimatedScenes = Math.round(totalPages / expectedAvgLength);
    const coverageRatio = estimatedScenes > 0 ? totalScenes / estimatedScenes : 1;
    const scenes = p.scenes || [];
    const actualAvgLength = totalScenes > 0
      ? scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / totalScenes
      : expectedAvgLength;
    const avgLengthSuspicious = actualAvgLength > expectedAvgLength * 1.4;
    const largeScenes = scenes.filter(s => s.lengthPages > 5).length;
    if (!avgLengthSuspicious && coverageRatio >= 0.80 && largeScenes <= 2)  return "HIGH";
    if (!avgLengthSuspicious && coverageRatio >= 0.55 && largeScenes <= 6)  return "MEDIUM";
    return "LOW";
  }

  // ── Build enriched manifest entry ────────────────────────────────────────────
  const manifestEntry = {
    filename,
    publishedAt: new Date().toISOString(),
    confidence: deriveConfidence(parsed),
    title: parsed.title || "",
    writer: parsed.writer || "",
    genre: parsed.genre || "",
    structureType: parsed.naturalStructure?.structureType || "",
  };

  try {
    // 1 — Commit the script JSON file
    const filePath = `public/library/${filename}`;
    let scriptSha = null;
    const existingRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
      { headers }
    );
    if (existingRes.ok) {
      const existing = await existingRes.json();
      scriptSha = existing.sha;
    }

    const commitRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Publish ${filename} via ScriptGraph Studio`,
          content: Buffer.from(content).toString("base64"),
          branch,
          ...(scriptSha ? { sha: scriptSha } : {}),
        }),
      }
    );
    if (!commitRes.ok) {
      const err = await commitRes.json();
      return res.status(500).json({ error: `GitHub API error: ${err.message}` });
    }

    // 2 — Update manifest.json with enriched entry
    const manifestFile = await getFile("public/library/manifest.json");
    let currentEntries = manifestFile?.data || [];

    // Normalise — handle legacy flat-string entries from before this upgrade
    currentEntries = currentEntries.map(e =>
      typeof e === "string" ? { filename: e } : e
    );

    // Replace existing entry for this filename or append
    const idx = currentEntries.findIndex(e => e.filename === filename);
    if (idx >= 0) {
      currentEntries[idx] = manifestEntry;
    } else {
      currentEntries.push(manifestEntry);
    }

    // Sort: newest publishedAt first; entries without a date sort to the end
    currentEntries.sort((a, b) => {
      if (!a.publishedAt && !b.publishedAt) return (a.filename || "").localeCompare(b.filename || "");
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    await putFile(
      "public/library/manifest.json",
      manifestFile?.sha || null,
      currentEntries,
      `Update manifest — publish ${filename}`
    );

    // 3 — Append to activity-log.json
    const logFile = await getFile("public/library/activity-log.json");
    const currentLog = Array.isArray(logFile?.data) ? logFile.data : [];
    const logEntry = {
      action: "publish",
      filename,
      title: parsed.title || filename,
      confidence: manifestEntry.confidence,
      timestamp: manifestEntry.publishedAt,
    };
    // Prepend — newest first
    const updatedLog = [logEntry, ...currentLog];

    await putFile(
      "public/library/activity-log.json",
      logFile?.sha || null,
      updatedLog,
      `Activity log — publish ${filename}`
    );

    return res.status(200).json({
      success: true,
      filename,
      title: parsed.title,
      message: `${parsed.title} published successfully — live in ~60 seconds`,
    });

  } catch (err) {
    return res.status(500).json({ error: `Unexpected error: ${err.message}` });
  }
}
