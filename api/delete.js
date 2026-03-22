// api/delete.js — Vercel serverless function
// Deletes a script JSON from the public library, updates manifest.json,
// and appends a deletion entry to activity-log.json.
//
// Required Vercel environment variables: PUBLISH_PASSWORD, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password, filename } = req.body || {};

  if (!password || !filename) return res.status(400).json({ error: "Missing required fields" });
  if (password !== process.env.PUBLISH_PASSWORD) return res.status(401).json({ error: "Invalid password" });

  const reserved = ["manifest.json", "index.json", "config.json", "activity-log.json"];
  if (!/^[a-z0-9-]+\.json$/.test(filename) || reserved.includes(filename)) {
    return res.status(400).json({ error: `Cannot delete reserved or invalid filename: ${filename}` });
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
    const r = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`,
      { headers }
    );
    if (!r.ok) return null;
    const data = await r.json();
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

  const filePath = `public/library/${filename}`;
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  try {
    // 1 — Get the script file's SHA and title (title used for activity log)
    const getRes = await fetch(`${apiBase}?ref=${branch}`, { headers });
    if (!getRes.ok) return res.status(404).json({ error: `File not found: ${filename}` });
    const fileData = await getRes.json();
    const scriptSha = fileData.sha;

    // Try to read title from the script JSON for the activity log
    let scriptTitle = filename;
    try {
      const scriptContent = JSON.parse(Buffer.from(fileData.content, "base64").toString("utf8"));
      if (scriptContent.title) scriptTitle = scriptContent.title;
    } catch {}

    // 2 — Delete the script file
    const delRes = await fetch(apiBase, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        message: `Remove ${filename} via ScriptGraph Studio`,
        sha: scriptSha,
        branch,
      }),
    });
    if (!delRes.ok) {
      const err = await delRes.json();
      return res.status(500).json({ error: `GitHub API error: ${err.message}` });
    }

    // 3 — Update manifest.json — remove this entry, handle both formats
    const manifestFile = await getFile("public/library/manifest.json");
    if (manifestFile) {
      let currentEntries = Array.isArray(manifestFile.data) ? manifestFile.data : [];

      // Handle legacy flat-string entries and new object entries
      currentEntries = currentEntries.filter(e =>
        typeof e === "string" ? e !== filename : e.filename !== filename
      );

      await putFile(
        "public/library/manifest.json",
        manifestFile.sha,
        currentEntries,
        `Update manifest — remove ${filename}`
      );
    }

    // 4 — Append to activity-log.json
    const logFile = await getFile("public/library/activity-log.json");
    const currentLog = Array.isArray(logFile?.data) ? logFile.data : [];
    const logEntry = {
      action: "delete",
      filename,
      title: scriptTitle,
      timestamp: new Date().toISOString(),
    };
    const updatedLog = [logEntry, ...currentLog];

    await putFile(
      "public/library/activity-log.json",
      logFile?.sha || null,
      updatedLog,
      `Activity log — delete ${filename}`
    );

    return res.status(200).json({ success: true, filename, message: `${filename} removed from library` });

  } catch (err) {
    return res.status(500).json({ error: `Unexpected error: ${err.message}` });
  }
}
