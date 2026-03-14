// api/delete.js — Vercel serverless function
// Deletes a script JSON from the public library and updates manifest.json
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

  const reserved = ["manifest.json", "index.json", "config.json"];
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

  const filePath = `public/library/${filename}`;
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  try {
    // Get the file's SHA (required to delete)
    const getRes = await fetch(`${apiBase}?ref=${branch}`, { headers });
    if (!getRes.ok) return res.status(404).json({ error: `File not found: ${filename}` });
    const { sha } = await getRes.json();

    // Delete the file
    const delRes = await fetch(apiBase, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        message: `Remove ${filename} via ScriptGraph Studio`,
        sha,
        branch,
      }),
    });
    if (!delRes.ok) {
      const err = await delRes.json();
      return res.status(500).json({ error: `GitHub API error: ${err.message}` });
    }

    // Update manifest.json
    const manifestApi = `https://api.github.com/repos/${repo}/contents/public/library/manifest.json`;
    const manifestRes = await fetch(`${manifestApi}?ref=${branch}`, { headers });
    if (manifestRes.ok) {
      const manifestData = await manifestRes.json();
      let currentFiles = [];
      try { currentFiles = JSON.parse(Buffer.from(manifestData.content, "base64").toString("utf8")); } catch {}
      const updated = currentFiles.filter(f => f !== filename);
      await fetch(manifestApi, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Update manifest — remove ${filename}`,
          content: Buffer.from(JSON.stringify(updated, null, 2) + "\n").toString("base64"),
          branch,
          sha: manifestData.sha,
        }),
      });
    }

    return res.status(200).json({ success: true, filename, message: `${filename} removed from library` });
  } catch (err) {
    return res.status(500).json({ error: `Unexpected error: ${err.message}` });
  }
}
