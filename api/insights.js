// api/insights.js — Vercel serverless function
// Handles create/update/delete for Director's Notes (insights) via GitHub API.
// Required Vercel environment variables (same as api/publish.js):
//   PUBLISH_PASSWORD  — shared publish password
//   GITHUB_TOKEN      — GitHub Personal Access Token with repo write access
//   GITHUB_REPO       — repo in "owner/repo" format, e.g. "PeteCapo/scriptgraph"
//   GITHUB_BRANCH     — branch to commit to, e.g. "main"
//
// Actions:
//   publish  — write insight JSON + add to front of manifest (new insight)
//   update   — overwrite existing insight JSON (manifest order unchanged)
//   delete   — remove insight JSON + remove from manifest

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password, action, insight } = req.body || {};

  // Validate inputs
  if (!password || !action) {
    return res.status(400).json({ error: "Missing required fields: password, action" });
  }

  // Check password
  if (password !== process.env.PUBLISH_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  // Validate action
  const validActions = ["publish", "update", "delete"];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `Invalid action: ${action}. Must be one of: ${validActions.join(", ")}` });
  }

  // For publish/update we need the insight object; for delete we need the id
  if (action === "delete") {
    if (!insight?.id) {
      return res.status(400).json({ error: "Missing required field: insight.id" });
    }
  } else {
    if (!insight?.id || !insight?.title || !insight?.body || !insight?.films?.length) {
      return res.status(400).json({ error: "Missing required insight fields: id, title, body, films" });
    }
  }

  // Derive filename from id — must be safe slug format
  const slug = insight.id;
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: `Invalid insight id (must be lowercase slug): ${slug}` });
  }
  const filename = `${slug}.json`;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token || !repo) {
    return res.status(500).json({ error: "Server configuration missing" });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const manifestPath = "public/insights/manifest.json";
  const manifestApi  = `https://api.github.com/repos/${repo}/contents/${manifestPath}`;

  // ── Helper: get current manifest ──────────────────────────────────────────
  async function getManifest() {
    const res = await fetch(`${manifestApi}?ref=${branch}`, { headers });
    if (!res.ok) return { files: [], sha: null };
    const data = await res.json();
    try {
      const files = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
      return { files: Array.isArray(files?.insights) ? files.insights : [], sha: data.sha };
    } catch {
      return { files: [], sha: data.sha };
    }
  }

  // ── Helper: write manifest ─────────────────────────────────────────────────
  async function writeManifest(files, sha, commitMessage) {
    const manifestObj = { insights: files };
    const content = Buffer.from(JSON.stringify(manifestObj, null, 2) + "\n").toString("base64");
    const body = { message: commitMessage, content, branch };
    if (sha) body.sha = sha;
    const r = await fetch(manifestApi, { method: "PUT", headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(`GitHub API error updating manifest: ${err.message}`);
    }
    return r;
  }

  // ── Helper: get file SHA (returns null if not found) ──────────────────────
  async function getFileSha(filePath) {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, { headers });
    if (!r.ok) return null;
    const data = await r.json();
    return data.sha || null;
  }

  try {

    // ══ DELETE ══════════════════════════════════════════════════════════════
    if (action === "delete") {
      const filePath = `public/insights/${filename}`;

      // Get file SHA — required by GitHub to delete
      const sha = await getFileSha(filePath);
      if (!sha) {
        return res.status(404).json({ error: `Insight not found: ${filename}` });
      }

      // Delete the file
      const deleteRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          message: `Delete insight: ${filename}`,
          sha,
          branch,
        }),
      });

      if (!deleteRes.ok) {
        const err = await deleteRes.json();
        return res.status(500).json({ error: `GitHub API error deleting file: ${err.message}` });
      }

      // Remove from manifest
      const { files, sha: manifestSha } = await getManifest();
      const updated = files.filter(f => f !== filename);
      await writeManifest(updated, manifestSha, `Remove ${filename} from insights manifest`);

      return res.status(200).json({
        success: true,
        action: "delete",
        id: slug,
        message: `Insight deleted — live in ~60 seconds`,
      });
    }

    // ══ PUBLISH (new) ════════════════════════════════════════════════════════
    if (action === "publish") {
      const filePath = `public/insights/${filename}`;
      const fileApi  = `https://api.github.com/repos/${repo}/contents/${filePath}`;

      // Check if already exists — block accidental overwrite via publish
      const existingSha = await getFileSha(filePath);
      if (existingSha) {
        return res.status(409).json({
          error: `Insight already exists: ${filename}. Use action "update" to overwrite.`,
        });
      }

      // Strip the color token name — the client resolves to T.* at render time.
      // Store exactly what the JSON schema specifies: color as a string token.
      const insightData = {
        id:        insight.id,
        title:     insight.title,
        subtitle:  insight.subtitle || null,
        body:      insight.body,
        films:     insight.films.map(f => ({
          slug:  f.slug,
          color: f.color,   // "accent" | "red" | "blue"
          label: f.label,
        })),
        createdAt: new Date().toISOString(),
      };

      const content = Buffer.from(JSON.stringify(insightData, null, 2) + "\n").toString("base64");

      const commitRes = await fetch(fileApi, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Publish insight: ${insight.title}`,
          content,
          branch,
        }),
      });

      if (!commitRes.ok) {
        const err = await commitRes.json();
        return res.status(500).json({ error: `GitHub API error writing file: ${err.message}` });
      }

      // Add to front of manifest (newest first)
      const { files, sha: manifestSha } = await getManifest();
      const updated = [filename, ...files.filter(f => f !== filename)];
      await writeManifest(updated, manifestSha, `Add ${filename} to insights manifest`);

      return res.status(200).json({
        success: true,
        action: "publish",
        id: slug,
        title: insight.title,
        message: `"${insight.title}" published — live in ~60 seconds`,
      });
    }

    // ══ UPDATE (overwrite existing) ══════════════════════════════════════════
    if (action === "update") {
      const filePath = `public/insights/${filename}`;
      const fileApi  = `https://api.github.com/repos/${repo}/contents/${filePath}`;

      // Must exist — get its SHA
      const existingSha = await getFileSha(filePath);
      if (!existingSha) {
        return res.status(404).json({
          error: `Insight not found: ${filename}. Use action "publish" to create it.`,
        });
      }

      // Preserve original createdAt if provided, otherwise keep what's there
      const insightData = {
        id:        insight.id,
        title:     insight.title,
        subtitle:  insight.subtitle || null,
        body:      insight.body,
        films:     insight.films.map(f => ({
          slug:  f.slug,
          color: f.color,
          label: f.label,
        })),
        createdAt: insight.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const content = Buffer.from(JSON.stringify(insightData, null, 2) + "\n").toString("base64");

      const commitRes = await fetch(fileApi, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Update insight: ${insight.title}`,
          content,
          sha: existingSha,
          branch,
        }),
      });

      if (!commitRes.ok) {
        const err = await commitRes.json();
        return res.status(500).json({ error: `GitHub API error updating file: ${err.message}` });
      }

      // Manifest order unchanged for updates
      return res.status(200).json({
        success: true,
        action: "update",
        id: slug,
        title: insight.title,
        message: `"${insight.title}" updated — live in ~60 seconds`,
      });
    }

  } catch (err) {
    return res.status(500).json({ error: `Unexpected error: ${err.message}` });
  }
}
