// scripts/generate-sitemap.js
// Runs at build time. Reads public/library/manifest.json and writes public/sitemap.xml.
// Automatically includes all script detail pages + static routes.

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const BASE_URL = "https://scriptgraph.ai";

// Static routes to always include
const STATIC_ROUTES = [
  { path: "/",        changefreq: "weekly",  priority: "1.0" },
  { path: "/about",   changefreq: "monthly", priority: "0.7" },
  { path: "/compare", changefreq: "monthly", priority: "0.7" },
];

// Read manifest
const manifestPath = join(root, "public/library/manifest.json");
let files = [];
try {
  files = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.warn("generate-sitemap: could not read manifest.json —", e.message);
}

// Build script routes from manifest filenames
// Handles both legacy flat-string entries and new enriched object entries
const scriptRoutes = files.map((entry) => {
  const filename = typeof entry === "string" ? entry : entry.filename;
  const slug = filename.replace(/\.json$/, "");
  return {
    path: `/script/${slug}`,
    changefreq: "monthly",
    priority: "0.9",
  };
});

const allRoutes = [...STATIC_ROUTES, ...scriptRoutes];
const today = new Date().toISOString().split("T")[0];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map(
    ({ path, changefreq, priority }) => `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

const outPath = join(root, "public/sitemap.xml");
writeFileSync(outPath, xml, "utf8");
console.log(`generate-sitemap: wrote ${allRoutes.length} URLs to public/sitemap.xml`);
