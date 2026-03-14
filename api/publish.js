// api/publish.js — Vercel serverless function
// Receives a JSON file + password, commits it to the public library via GitHub API.
// Required Vercel environment variables:
//   PUBLISH_PASSWORD  — a secret password you choose
//   GITHUB_TOKEN      — a GitHub Personal Access Token with repo write access
//   GITHUB_REPO       — your repo in "owner/repo" format, e.g. "PeteCapo/scriptgraph"
//   GITHUB_BRANCH     — branch to commit to, e.g. "main"

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password, filename, content } = req.body || {};

  // Validate inputs
  if (!password || !filename || !content) {
    return res.status(400).json({ error: "Missing required fields: password, filename, content" });
  }

  // Check password
  if (password !== process.env.PUBLISH_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  // Validate filename — only allow safe JSON filenames
  if (!/^[a-z0-9-]+\.json$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename — use lowercase letters, numbers, and hyphens only" });
  }

  // Validate content is valid JSON
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

  if (!token || !repo) {
    return res.status(500).json({ error: "Server configuration missing" });
  }

  const filePath = `public/library/${filename}`;
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    // Check if file already exists (need its SHA to update)
    let sha = null;
    const existingRes = await fetch(`${apiBase}?ref=${branch}`, { headers });
    if (existingRes.ok) {
      const existing = await existingRes.json();
      sha = existing.sha;
    }

    // Encode content as base64
    const encoded = Buffer.from(content).toString("base64");

    // Commit the file
    const commitBody = {
      message: `Publish ${filename} via ScriptGraph Studio`,
      content: encoded,
      branch,
      ...(sha ? { sha } : {}),
    };

    const commitRes = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify(commitBody),
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return res.status(500).json({ error: `GitHub API error: ${err.message}` });
    }

    // Rebuild manifest.json
    // Get current manifest
    const manifestPath = "public/library/manifest.json";
    const manifestApi = `https://api.github.com/repos/${repo}/contents/${manifestPath}`;
    const manifestRes = await fetch(`${manifestApi}?ref=${branch}`, { headers });

    let currentFiles = [];
    let manifestSha = null;

    if (manifestRes.ok) {
      const manifestData = await manifestRes.json();
      manifestSha = manifestData.sha;
      try {
        currentFiles = JSON.parse(Buffer.from(manifestData.content, "base64").toString("utf8"));
      } catch {}
    }

    // Add filename if not already present, sort alphabetically
    if (!currentFiles.includes(filename)) {
      currentFiles.push(filename);
      currentFiles.sort();
    }

    const manifestContent = Buffer.from(JSON.stringify(currentFiles, null, 2) + "\n").toString("base64");

    await fetch(manifestApi, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Update manifest for ${filename}`,
        content: manifestContent,
        branch,
        ...(manifestSha ? { sha: manifestSha } : {}),
      }),
    });

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
