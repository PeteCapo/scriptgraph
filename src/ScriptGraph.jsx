import { useState, useRef, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIG
// VITE_PUBLIC_MODE=true  → public site (curated library only, no upload UI)
// VITE_PUBLIC_MODE=false → local dev (full app, all features)
// VITE_ANTHROPIC_KEY     → Anthropic API key (never hardcode here)
// ═══════════════════════════════════════════════════════════════════════════════
const PUBLIC_MODE = import.meta.env.VITE_PUBLIC_MODE === "true";
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";

// Inject Inter font + global resets
if (typeof document !== "undefined" && !document.getElementById("sg-fonts")) {
  const link = document.createElement("link");
  link.id = "sg-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Barlow+Condensed:wght@200;600;700;800&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; -webkit-font-smoothing: antialiased; }
    button { font-family: inherit; }
    @keyframes sgToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes sgFadeIn  { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEME — edit only this object to reskin the entire app
// ═══════════════════════════════════════════════════════════════════════════════
const THEME = {
  bgPage:        "#0d0d0f",
  bgPanel:       "#111113",
  bgCard:        "#151518",
  bgHover:       "#ffffff07",
  borderSubtle:  "#ffffff0e",
  borderMid:     "#ffffff1a",
  borderStrong:  "#ffffff36",
  textPrimary:   "#f0ece4",
  textSecondary: "#a89e90",
  textMuted:     "#6a6258",
  textDim:       "#5a5a62",
  accent:        "#c8a060",
  accentDim:     "#8a6a38",
  fwColors: {
    natural:       "#c8a060",
    three_act:     "#d46050",
    save_the_cat:  "#c8a060",
    heros_journey: "#48b878",
    story_circle:  "#5090d8",
  },
  colorError:    "#d46050",
  colorWarning:  "#c8a060",
  colorSuccess:  "#48b878",
  fontSans:      "'Inter', system-ui, -apple-system, sans-serif",
  fontDisplay:   "'Barlow Condensed', 'Arial Narrow', sans-serif",
  fontSerif:     "Georgia, 'Times New Roman', serif",
  fontMono:      "'Courier New', 'Courier', monospace",
  radiusSm:      "3px",
  radiusMd:      "6px",
  radiusLg:      "10px",
  appName:       "ScriptGraph",
  appTagline:    "Story Structure, Visualized.",
};
const T = THEME;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const FRAMEWORKS = [
  { id: "three_act",     label: "3-Act Structure" },
  { id: "save_the_cat",  label: "Save the Cat"    },
  { id: "heros_journey", label: "Hero's Journey"  },
  { id: "story_circle",  label: "Story Circle"    },
];

const FRAMEWORK_DEFS = {
  three_act: {
    beats: ["Opening Image","Inciting Incident","Act 1 End","Midpoint","All Is Lost","Dark Night of Soul","Climax","Resolution"],
    expectedPositions: [1, 12, 25, 50, 75, 80, 90, 99],
    guide: "3-Act: Opening Image ~1%, Inciting Incident ~10-15%, Act 1 End ~25%, Midpoint ~50%, All Is Lost ~75%, Dark Night ~80%, Climax ~90-95%, Resolution ~98-99%.",
  },
  save_the_cat: {
    beats: ["Opening Image","Theme Stated","Set-Up","Catalyst","Debate","Break into Two","B Story","Fun and Games","Midpoint","Bad Guys Close In","All Is Lost","Dark Night of the Soul","Break into Three","Finale","Final Image"],
    expectedPositions: [1, 5, 8, 10, 15, 20, 22, 35, 50, 62, 75, 78, 80, 90, 99],
    guide: "Save the Cat: Opening Image 1%, Theme 5%, Set-Up 1-10%, Catalyst 10%, Debate 10-20%, Break into 2 at 20%, B Story 22%, Fun & Games 20-50%, Midpoint 50%, Bad Guys 50-75%, All Is Lost 75%, Dark Night 75-80%, Break into 3 at 80%, Finale 80-99%, Final Image 99%.",
  },
  heros_journey: {
    beats: ["Ordinary World","Call to Adventure","Refusal of the Call","Meeting the Mentor","Crossing the Threshold","Tests Allies Enemies","Approach to Inmost Cave","The Ordeal","Reward","The Road Back","Resurrection","Return with Elixir"],
    expectedPositions: [3, 10, 13, 16, 20, 32, 45, 55, 65, 72, 87, 99],
    guide: "Hero's Journey: Ordinary World 1-5%, Call ~10%, Refusal ~12%, Mentor ~15%, Crossing ~20%, Tests 20-45%, Approach ~45%, Ordeal 50-60%, Reward ~65%, Road Back ~70%, Resurrection ~85-90%, Return ~99%.",
  },
  story_circle: {
    beats: ["You","Need","Go","Search","Find","Take","Return","Change"],
    expectedPositions: [1, 12, 25, 37, 50, 62, 75, 99],
    guide: "Story Circle: You 1%, Need 12%, Go 25%, Search 37%, Find 50%, Take 62%, Return 75%, Change 99%.",
  },
};

const API_HEADERS = {
  "Content-Type": "application/json",
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
  ...(ANTHROPIC_KEY ? { "x-api-key": ANTHROPIC_KEY } : {}),
};

// ═══════════════════════════════════════════════════════════════════════════════
// PDF EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const taggedLines = [];
  let totalChars = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const yGroups = {};
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!yGroups[y]) yGroups[y] = [];
      yGroups[y].push(item.str);
    }
    const sortedYs = Object.keys(yGroups).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const line = yGroups[y].join(" ").trim();
      if (line) { taggedLines.push({ page: pageNum, text: line }); totalChars += line.length; }
    }
  }
  return { taggedLines, totalPages, totalChars };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL COMPRESSOR
// ═══════════════════════════════════════════════════════════════════════════════

function isSceneHeading(text) {
  const t = text.trim();
  // Standard: INT. / EXT. / INT/EXT. / I/E.
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) return true;
  // Production draft: scene number prefix without dot — "26 INT. LOCATION - DAY. 26"
  if (/^\d+[A-Z]?\s+(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) return true;
  // Production draft: scene number prefix with dot — "124. INT. LOCATION - DAY"
  if (/^\d+[A-Z]?\.\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) return true;
  // Production draft: numbered angle/insert/POV — "57 INTO THE 44 BELOW 57" or "18 THE STUDY 18"
  const numberedAngle = t.match(/^(\d+[A-Z]?)\s+([A-Z][A-Z0-9\s'\"\-\/\(\)!]+?)\s+\1\*?$/);
  if (numberedAngle && numberedAngle[2].trim().length > 3 && !/^[.\s]+$/.test(numberedAngle[2])) return true;
  return false;
}
function isCharacterCue(text) {
  const t = text.trim();
  return t === t.toUpperCase() && t.length > 1 && t.length < 60 &&
    !/^(FADE|CUT|DISSOLVE|SMASH|TITLE|THE END|CONTINUED|OVER BLACK)/i.test(t) &&
    !/^\d/.test(t) && /[A-Z]/.test(t);
}
function isTransition(text) {
  return /^(FADE (IN|OUT|TO)|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT)/i.test(text.trim());
}

function compressScript(taggedLines) {
  const kept = [];
  let mode = "action";
  let actionLinesInScene = 0;
  let postCharLine = false;

  for (const { page, text } of taggedLines) {
    const t = text.trim();
    if (!t) continue;
    if (isSceneHeading(t)) {
      kept.push({ page, text: t });
      mode = "action"; actionLinesInScene = 0; postCharLine = false;
      continue;
    }
    if (isTransition(t)) { kept.push({ page, text: t }); continue; }
    if (isCharacterCue(t)) {
      kept.push({ page, text: t });
      mode = "dialogue"; postCharLine = true;
      continue;
    }
    if (mode === "action" && actionLinesInScene < 2) {
      kept.push({ page, text: t });
      actionLinesInScene++;
    }
    if (mode === "dialogue") {
      // skip dialogue body, reset to action after first dialogue line
      if (postCharLine) { postCharLine = false; } else { mode = "action"; }
    }
  }
  return kept;
}

function formatForClaude(keptLines) {
  return keptLines.map(l => `[p${l.page}] ${l.text}`).join("\n");
}

// Build a map of scene number -> rich content string for Phase 1B
// Uses RAW taggedLines (not compressed) so dialogue is included
// Cap per scene scales with scene length — longer scenes get more content
function buildSceneContentMap(taggedLines, sceneSkeletons) {
  const map = {};
  for (const skeleton of sceneSkeletons) {
    let lines;
    if (skeleton.lineStart != null && skeleton.lineEnd != null) {
      // Line-index based — precise, handles multiple scenes on same page
      lines = taggedLines.slice(skeleton.lineStart + 1, skeleton.lineEnd + 1); // +1 to skip heading
    } else {
      // Page-based fallback
      lines = taggedLines.filter(
        l => l.page >= skeleton.startPage && l.page <= skeleton.endPage
      ).filter(l => !isSceneHeading(l.text));
    }

    // Filter out pure technical lines
    const usable = lines.filter(l => {
      const t = l.text.trim();
      return t.length > 1
        && !/^(CONTINUED|CONT'D|\(CONT'D\)|MORE)$/i.test(t)
        && !/^\d+\.$/.test(t)
        && !/^[A-Z]\.$/.test(t);
    });

    // Build content: action lines + character cues + up to 2 dialogue lines per cue
    const parts = [];
    let lastWasChar = false;
    let dialogueLinesAfterCue = 0;

    for (const { text } of usable) {
      const t = text.trim();
      if (isCharacterCue(t)) {
        parts.push(t + ":");
        lastWasChar = true;
        dialogueLinesAfterCue = 0;
      } else if (lastWasChar || dialogueLinesAfterCue < 2) {
        parts.push(t);
        lastWasChar = false;
        dialogueLinesAfterCue++;
      } else {
        parts.push(t);
        lastWasChar = false;
        dialogueLinesAfterCue = 0;
      }
    }

    // Cap scales with scene length
    const lengthPages = skeleton.lengthPages || 1;
    const charCap = lengthPages <= 1 ? 600 : lengthPages <= 3 ? 900 : 1200;
    const joined = parts.join(" | ");
    map[skeleton.number] = joined.slice(0, charCap);
  }
  return map;
}

function computeSceneLengths(taggedLines, totalPages) {
  const headings = [];
  for (let i = 0; i < taggedLines.length; i++) {
    if (isSceneHeading(taggedLines[i].text)) {
      headings.push({ page: taggedLines[i].page, heading: taggedLines[i].text.trim(), lineIndex: i });
    }
  }
  return headings.map((h, i) => {
    const endPage = i < headings.length - 1 ? headings[i + 1].page - 1 : totalPages;
    const lineEnd = i < headings.length - 1 ? headings[i + 1].lineIndex - 1 : taggedLines.length - 1;
    return {
      heading: h.heading,
      startPage: h.page,
      endPage,
      lengthPages: Math.max(1, endPage - h.page + 1),
      lineStart: h.lineIndex,
      lineEnd,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL RHYTHM ENGINE
// Builds markers from:
//   1. keyMoments (Phase 1A) — inciting incident, midpoint, climax
//   2. scenes — pacing signals (rapid clusters, sustained scenes) from PDF
// Act breaks are passed separately and rendered directly from p1.naturalStructure.
// All narrative content comes from Phase 1A reading the full script.
// ═══════════════════════════════════════════════════════════════════════════════

// Smooth the tension curve with a rolling average to reduce run-to-run variance
// and give a cleaner overall shape rather than a spiky read
function smoothTension(arr, window = 5) {
  if (!arr?.length) return arr;
  return arr.map((_, i) => {
    const half = Math.floor(window / 2);
    const lo = Math.max(0, i - half);
    const hi = Math.min(arr.length - 1, i + half);
    const slice = arr.slice(lo, hi + 1);
    return parseFloat((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(2));
  });
}

// Resolve a keyMoment object to {page, position} regardless of schema version.
// Old data: has sceneNumber only. New data: has page + position directly.
function resolveKM(km, scenes, totalPages) {
  if (!km) return null;
  let page = km.page ?? null;
  let position = km.position ?? null;
  // Fallback: resolve from sceneNumber via scenes array
  if (!page && km.sceneNumber && scenes?.length) {
    const sc = scenes.find(s => s.number === km.sceneNumber);
    if (sc) { page = sc.startPage; }
  }
  // Fallback: compute position from page
  if (!position && page && totalPages) {
    position = parseFloat((page / totalPages * 100).toFixed(1));
  }
  if (!page || !position) return null;
  return { page, position, description: km.description || km.note || "" };
}

function computeStructuralRhythm(overallTension, actBreaks, scenes, keyMoments) {
  const markers = [];

  // ── Key moments from Phase 1A (narrative, Claude-identified) ────────────────
  // resolveKM handles both old schema (sceneNumber only) and new (page + position)
  const totalPages = scenes?.length
    ? scenes[scenes.length - 1]?.endPage || scenes[scenes.length - 1]?.startPage
    : 109;

  const kmDefs = [
    { key: "incitingIncident", id: "inciting_incident", subtype: "inciting_incident", label: "Inciting Incident" },
    { key: "midpoint",         id: "midpoint",          subtype: "midpoint",          label: "Midpoint" },
    { key: "climax",           id: "climax",            subtype: "climax",            label: "Climax" },
  ];
  for (const { key, id, subtype, label } of kmDefs) {
    const km = keyMoments?.[key];
    const resolved = resolveKM(km, scenes, totalPages);
    if (!resolved) continue;
    markers.push({
      id, type: "key_moment", subtype,
      position: resolved.position,
      page: resolved.page,
      label,
      note: resolved.description,
      sceneHeading: km?.sceneHeading || "",
      validation: km?.validation || null,
    });
  }

  // ── Pacing signals from scene lengths (PDF ground truth) ────────────────────
  if (scenes?.length > 4) {
    const avgLen = scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / scenes.length;

    // Rapid sequence: 4+ consecutive scenes shorter than 0.6× avg
    let rapidStart = null;
    for (let i = 0; i < scenes.length; i++) {
      const isShort = (scenes[i].lengthPages || 1) < avgLen * 0.6;
      if (isShort && rapidStart === null) rapidStart = i;
      if (!isShort && rapidStart !== null) {
        if (i - rapidStart >= 4) {
          const mid = scenes[Math.floor((rapidStart + i) / 2)];
          markers.push({
            id: `rapid_${rapidStart}`,
            type: "pacing",
            subtype: "rapid_sequence",
            position: mid.position,
            page: mid.startPage,
            label: "Rapid Sequence",
            note: `${i - rapidStart} quick scenes — pacing accelerates`,
          });
        }
        rapidStart = null;
      }
    }

    // Sustained scene: single scene 3× avg or longer
    scenes.forEach((sc, i) => {
      if ((sc.lengthPages || 1) >= avgLen * 3) {
        markers.push({
          id: `sustained_${i}`,
          type: "pacing",
          subtype: "sustained_scene",
          position: sc.position,
          page: sc.startPage,
          label: "Sustained Scene",
          note: `${sc.lengthPages}pp — ${sc.heading}`,
        });
      }
    });
  }

  return markers.sort((a, b) => a.position - b.position);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEAT VALIDATION
// Checks that beats are distributed across the full script, not clustered
// Returns { valid, warnings[] }
// ═══════════════════════════════════════════════════════════════════════════════

function validateBeats(beats, frameworkId) {
  const warnings = [];
  const found = beats.filter(b => b.found);
  if (!found.length) return { valid: false, warnings: ["No beats were identified."] };

  const positions = found.map(b => b.position);
  const maxPos = Math.max(...positions);
  const minPos = Math.min(...positions);
  const spread = maxPos - minPos;

  // All beats clustered in first half
  if (maxPos < 55) {
    warnings.push(`Beat mapping suspect: all ${found.length} beats fall before ${maxPos}% — expected coverage across full script.`);
  }

  // Spread too narrow for the number of beats
  const fw = FRAMEWORK_DEFS[frameworkId];
  const expectedSpread = fw.expectedPositions[fw.expectedPositions.length - 1] - fw.expectedPositions[0];
  if (spread < expectedSpread * 0.5) {
    warnings.push(`Beats clustered in a ${spread.toFixed(0)}% window — expected spread of ~${expectedSpread}%.`);
  }

  // Check beats are roughly in order
  let outOfOrder = 0;
  for (let i = 1; i < found.length; i++) {
    if (found[i].position < found[i - 1].position - 5) outOfOrder++;
  }
  if (outOfOrder > 1) warnings.push(`${outOfOrder} beats appear out of sequence.`);

  // Tension peak vs climax position
  if (frameworkId === "three_act" || frameworkId === "save_the_cat") {
    const climax = beats.find(b => b.label === "Climax" || b.label === "Finale");
    if (climax && climax.position < 70) {
      warnings.push(`Climax mapped at ${climax.position}% — expected 85-95%.`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

// Phase 1A — structural analysis only, NO scene list
// Freed from generating 100+ scenes, this fits comfortably in 4000 tokens
function buildPhase1APrompt(compressedText, totalPages, sceneLengths, sceneSkeletons) {
  const avgLen = sceneLengths.length
    ? (sceneLengths.reduce((s, sc) => s + sc.lengthPages, 0) / sceneLengths.length).toFixed(1)
    : "unknown";

  // Ground-truth scene index — Claude MUST pick from these scene numbers
  // This is the PDF's own scene list: page numbers here are exact
  const sceneIndex = sceneSkeletons
    .map(s => `${s.number}. p${s.startPage} ${s.heading}`)
    .join("\n");

  return `You are an expert script analyst. Read this screenplay and identify its structure, arc, and pacing.

FORMAT: Lines tagged [pN] = exact page number. Script is ${totalPages} pages total. ${sceneSkeletons.length} scenes. Avg scene length: ${avgLen}pp.

GROUND-TRUTH SCENE INDEX (scene number → exact page from PDF):
${sceneIndex}

You MUST use scene numbers from the index above when identifying act breaks and key moments.
Do NOT invent page numbers — only use pages that appear in the scene index.
Do NOT impose any pre-existing framework. Identify structure as it ACTUALLY EXISTS.

Return ONLY valid JSON, no markdown:

{
  "title": string,
  "writer": string (full name(s) as credited on the cover page — "Written by", "Screenplay by", etc. If not found, empty string),
  "logline": string,
  "totalPages": ${totalPages},
  "totalScenes": ${sceneSkeletons.length},
  "protagonist": string,
  "antagonistOrConflict": string,
  "genre": string,
  "tone": string,
  "themes": [string],
  "naturalStructure": {
    "actCount": number,
    "structureType": string (one of: "linear" | "non-linear" | "circular" | "episodic" | "triptych" | "anthology" — choose whichever best describes how the story is actually organized, regardless of act count),
    "actBreaks": [
      {
        "actNumber": int (1 = end of Act 1, 2 = end of Act 2, etc.),
        "sceneNumber": int (MUST be a scene number from the scene index above),
        "description": string (one sentence: what structural shift happens at this scene)
      }
    ],
    "structuralPersonality": string (1-2 paragraphs max — story consultant voice, specific to THIS script),
    "pacingNotes": string (1 paragraph max — specific scene references, pacing shifts)
  },
  "keyMoments": {
    "incitingIncident": {
      "sceneNumber": int (MUST be a scene number from the scene index),
      "note": string (one sentence: what specifically happens that launches the story — read the script, be specific)
    },
    "midpoint": {
      "sceneNumber": int,
      "note": string (one sentence: what fundamentally shifts at the story's center)
    },
    "climax": {
      "sceneNumber": int,
      "note": string (one sentence: the moment of peak confrontation or highest stakes)
    }
  }
}

RULES:
- actBreaks sceneNumber and keyMoments sceneNumber MUST exist in the scene index above
- Do NOT include a scenes array
- Do NOT include an overallTension array — tension is derived from scene-level scoring in a later phase

SCRIPT:
${compressedText}`;
}

// Phase 1B — scene enrichment with actual compressed content
// sceneSlice: array of scene skeletons (heading, pages, position)
// sceneContentMap: map of scene number -> compressed content string from PDF
// structureSummary: Phase 1A result (title, genre, tension arc, act breaks, etc.)
function buildPhase1BPrompt(sceneSlice, totalPages, structureSummary, sceneContentMap) {
  // Key moment scene numbers from Phase 1A — these scenes need accurate descriptions
  const kmSceneNumbers = new Set([
    structureSummary.keyMoments?.incitingIncident?.sceneNumber,
    structureSummary.keyMoments?.midpoint?.sceneNumber,
    structureSummary.keyMoments?.climax?.sceneNumber,
  ].filter(Boolean));

  const sceneList = sceneSlice.map(s => {
    const content = sceneContentMap?.[s.number] || "";
    const contentStr = content ? `\n   CONTENT: ${content}` : "";
    const isKeyMoment = kmSceneNumbers.has(s.number);
    const keyTag = isKeyMoment ? " ★KEY MOMENT★" : "";
    return `${s.number}. [p${s.startPage}-p${s.endPage}] (${s.lengthPages}pp) pos:${s.position.toFixed(1)}%${keyTag} — ${s.heading}${contentStr}`;
  }).join("\n");

  return `You are an expert script analyst. Read the actual scene content below and enrich each scene for "${structureSummary.title}".

SCRIPT CONTEXT:
- ${totalPages} pages | ${structureSummary.genre} | ${structureSummary.tone}
- Protagonist: ${structureSummary.protagonist}
- Conflict: ${structureSummary.antagonistOrConflict}
- ${structureSummary.naturalStructure?.actCount}-act structure
- Act breaks: ${(structureSummary.naturalStructure?.actBreaks || []).map(ab => `Act${ab.actNumber}@${ab.position}%p${ab.page}`).join(" | ")}

TENSION SCORING — score each scene based purely on what is happening in its content:

Tension is not limited to physical danger. Emotional confrontations, psychological crises, devastating revelations, and moments of irreversible loss can score just as high as violence or mortal threat. Use the full scale regardless of genre.

10: The highest possible stakes are in immediate play with no escape. A character's life, freedom, or identity is being destroyed in real time. A confrontation that cannot be walked back. A truth that obliterates everything. Unendurable — the reader cannot look away.
9: A crisis that feels unavoidable and is actively unfolding. Imminent physical danger OR an emotional/psychological breaking point — a confession that shatters a relationship, a character hitting rock bottom, an irreversible act. The situation is critical.
8: High stakes actively in motion. A significant threat, a desperate act, a betrayal landing, a character collapsing under the weight of something they can no longer carry. The outcome is uncertain and failure costs everything.
7: Real pressure with meaningful consequences. Something important could go very wrong — physically, emotionally, or relationally. A confrontation building toward a breaking point. Tension is present and felt.
6: Growing conflict with real stakes. A difficult situation that is worsening. An argument escalating, a secret getting closer to exposure, a character making a choice they'll regret. The pressure is building noticeably.
5: Moderate conflict or emotional weight. Something is at stake but the scene has room to breathe. A hard conversation, a setback, a discovery that raises uncomfortable questions. Stakes exist but resolution feels possible.
4: Low-level tension or mild friction. Setup scenes where something feels slightly off. Character scenes with underlying unease or unspoken conflict that hasn't surfaced yet.
3: Mostly calm with a hint of dread or dramatic irony. The audience senses something the character doesn't, or a quiet scene carries subtle emotional weight beneath a peaceful surface.
2: Deliberately low tension. Character work, worldbuilding, breathing room between escalations. Nothing is immediately at stake.
1: Near-zero tension. Pure setup, transition, or atmosphere. No conflict, no stakes, no threat.

IMPORTANT: Score based on what the content actually is — not the genre, not where the scene falls in the script. A quiet drama about grief and estrangement should use the full scale. A devastating emotional confrontation in a family film earns the same score as a chase scene in a thriller. A weak horror scene earns a low score. Let the content speak. Emotional and psychological stakes are real stakes.

For EACH scene, read the CONTENT lines provided. Content includes action lines, character names followed by their dialogue, and stage directions. Write a summary of what specifically happens — who does or says what, what changes. Do not summarize the heading.

SCENES (heading + compressed content from script):
${sceneList}

Return ONLY valid JSON, no markdown:
{
  "scenes": [
    {
      "number": int,
      "summary": string (one tight sentence describing what ACTUALLY HAPPENS in this specific scene — active voice, specific to the content provided, not generic),
      "tension": number 0-10 (score from content only — see definitions above),
      "turningPoint": boolean,
      "turningPointNote": string (only if turningPoint:true)
    }
  ]
}

RULES:
- Base summaries STRICTLY on the CONTENT lines provided. Do NOT invent events, actions, or outcomes that are not in the content.
- If content is sparse, write a minimal accurate summary of what IS there — do not fill gaps with assumed plot logic.
- NEVER state that a character is dead, killed, or harmed unless the content explicitly shows it happening in THIS scene.
- NEVER attribute an action to a character unless the content shows that specific character performing it.
- ★KEY MOMENT★ scenes must have especially accurate, specific summaries — these are displayed as structural markers. Be precise about who does what to whom. Do not conflate separate characters' actions or attribute one character's action to another.
- turningPoint: true only for scenes that genuinely shift the story — expect 8-15 total across full script
- Return exactly ${sceneSlice.length} objects, one per scene number`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1C — KEY MOMENT VALIDATION
// Validates Phase 1A's candidate scenes against explicit structural criteria.
// Receives full scene content for each candidate, confirms or replaces.
// ═══════════════════════════════════════════════════════════════════════════════

function buildPhase1CPrompt(candidates, sceneSkeletons, totalPages) {
  // candidates: { incitingIncident, midpoint, climax, actBreaks }
  // each has { sceneNumber, heading, page, position, content }

  const sceneIndex = sceneSkeletons
    .map(s => `${s.number}. p${s.startPage} [${s.lengthPages}pp] ${s.heading}`)
    .join("\n");

  const formatCandidate = (key, c) => {
    if (!c) return `${key}: NO CANDIDATE PROVIDED`;
    const neighborsBlock = c.neighbors ? `\n  NEIGHBORING SCENES (for context if replacement needed):\n${c.neighbors}` : "";
    return `${key.toUpperCase()}
  Scene #${c.sceneNumber} · p${c.page} · ${c.position}% · ${c.heading}
  CONTENT:
${c.content || "(no content available)"}${neighborsBlock}`;
  };

  const candidateBlock = [
    formatCandidate("incitingIncident", candidates.incitingIncident),
    formatCandidate("midpoint", candidates.midpoint),
    formatCandidate("climax", candidates.climax),
    ...(candidates.actBreaks || []).map((ab, i) =>
      formatCandidate(`actBreak_${i + 1} (end of Act ${ab.actNumber})`, ab)
    ),
  ].join("\n\n---\n\n");

  // Build a set of act break scene numbers so 1C knows they are claimed
  const actBreakSceneNums = (candidates.actBreaks || []).map(ab => ab.sceneNumber).filter(Boolean);
  const actBreakWarning = actBreakSceneNums.length
    ? `IMPORTANT — COLLISION PREVENTION: The following scenes are already identified as ACT BREAKS: ${actBreakSceneNums.map(n => `#${n}`).join(", ")}. Do NOT select these same scenes as inciting incident, midpoint, or climax. If your candidate for a key moment is one of these act break scenes, you MUST replace it with a different scene.`
    : "";

  // Expected position windows for sanity reference
  const iiWindow  = `${Math.round(totalPages * 0.10)}–${Math.round(totalPages * 0.25)}pp (10–25%)`;
  const mpWindow  = `${Math.round(totalPages * 0.40)}–${Math.round(totalPages * 0.60)}pp (40–60%)`;
  const clxWindow = `${Math.round(totalPages * 0.82)}–${totalPages}pp (82–100%)`;

  return `You are an expert script analyst validating structural moment identifications for a ${totalPages}-page screenplay.

You will evaluate each candidate scene against the criteria below. For each one: confirm it if it genuinely fits, or reject it and nominate a better scene from the index.

POSITION REFERENCE WINDOWS (use these as anchors, not hard rules — unconventional structure is valid):
- Inciting Incident: typically ${iiWindow}
- Midpoint: typically ${mpWindow}
- Climax: typically ${clxWindow}

${actBreakWarning}

IMPORTANT: Some scripts intentionally subvert standard structure. If a script uses a non-standard approach (late inciting incident, quiet midpoint, diffuse climax), you may confirm an unconventional candidate and note the deviation — do NOT force a wrong scene into the right shape.

═══════════════════════════════════
STRUCTURAL CRITERIA
═══════════════════════════════════

ACT BREAK — confirms if ALL of:
• Major, irreversible plot twist, character decision, or thematic shift
• Fundamentally changes the story's direction
• Forces the protagonist into new, higher-stakes conflict
• Functions as a crucial, often climactic turning point
• The story cannot return to its pre-break state
• IMPORTANT: The act break scene is the LAST scene of the act ending, not the first scene of the next act. If a script cuts to black and jumps forward in time, the act break is the final scene BEFORE the cut — not the first scene after it. Do not select the opening scene of a new time period or new act as the break point.

INCITING INCIDENT — confirms if MOST of:
• Shatters the protagonist's ordinary world / status quo
• Timing: roughly 10–30 pages in (10–25% of script)
• Forces the protagonist to take action — cannot be ignored
• Establishes the main conflict and goal
• Introduces irreversible stakes
• Causes the protagonist to react or proact toward a new situation

MIDPOINT — confirms if MOST of:
• Timing: roughly 40–60% into the script
• Protagonist shifts from REACTIVE to PROACTIVE
• A "point of no return" — protagonist cannot revert to original plan
• Raises stakes significantly (more personal, more dangerous)
• Features a false victory, false defeat, key revelation, or identity shift
• Character undergoes a moment of truth or internal transformation

CLIMAX — confirms if MOST of:
• Timing: roughly 85–100% into the script
• Highest dramatic tension in the script — peak confrontation, peak danger, or peak stakes
• Protagonist confronts the ultimate obstacle or antagonist directly — action, not setup for action
• Resolves the main story question
• Demonstrates character arc completion — lessons applied
• Final, unavoidable confrontation or defining choice
• Pays off foreshadowing and rising action
• NOTE: A scene where a character spots the protagonist or a transitional moment BEFORE the confrontation is NOT the climax — the climax is the confrontation itself

═══════════════════════════════════
GROUND-TRUTH SCENE INDEX
═══════════════════════════════════
${sceneIndex}

═══════════════════════════════════
CANDIDATES TO EVALUATE
═══════════════════════════════════
${candidateBlock}

Return ONLY valid JSON, no markdown:
{
  "incitingIncident": {
    "verdict": "confirmed" | "replaced" | "none",
    "sceneNumber": int (confirmed scene, or replacement from index, or null if none found),
    "confidence": "high" | "medium" | "low",
    "ruling": string (1-2 sentences: why this specific sceneNumber was confirmed or chosen — the ruling MUST describe the scene at this sceneNumber, not any other scene)
  },
  "midpoint": {
    "verdict": "confirmed" | "replaced" | "none",
    "sceneNumber": int | null,
    "confidence": "high" | "medium" | "low",
    "ruling": string (MUST describe what happens in the scene at sceneNumber — not a different scene)
  },
  "climax": {
    "verdict": "confirmed" | "replaced" | "none",
    "sceneNumber": int | null,
    "confidence": "high" | "medium" | "low",
    "ruling": string (MUST describe what happens in the scene at sceneNumber — not a different scene)
  },
  "actBreaks": [
    {
      "actNumber": int,
      "verdict": "confirmed" | "replaced" | "none",
      "sceneNumber": int | null,
      "confidence": "high" | "medium" | "low",
      "ruling": string (MUST describe what happens in the scene at sceneNumber)
    }
  ]
}

CRITICAL: Every ruling must describe the scene at the sceneNumber you returned. If you replaced a scene, the ruling must explain why the original failed AND describe why the replacement (at its sceneNumber) is correct. Do not describe a third scene in the ruling.`;
}

// Extract full scene content from taggedLines for a given scene skeleton
// Used by Phase 1C to give the validator the actual scene text
function extractFullSceneContent(skeleton, taggedLines, charCap = 1500) {
  if (!skeleton) return "";
  let lines;
  if (skeleton.lineStart != null && skeleton.lineEnd != null) {
    // Line-index based — precise boundary
    lines = taggedLines.slice(skeleton.lineStart + 1, skeleton.lineEnd + 1);
  } else {
    // Page-based fallback
    lines = taggedLines.filter(
      l => l.page >= skeleton.startPage && l.page <= skeleton.endPage
    ).filter(l => !isSceneHeading(l.text));
  }
  const usable = lines.filter(l => {
    const t = l.text.trim();
    return t.length > 1
      && !/^(CONTINUED|CONT'D|\(CONT'D\)|MORE)$/i.test(t)
      && !/^\d+\.?$/.test(t);
  });
  return usable.map(l => l.text.trim()).join("\n").slice(0, charCap);
}

function buildPhase2Prompt(p1, frameworkId) {
  const fw = FRAMEWORK_DEFS[frameworkId];
  const fwLabel = FRAMEWORKS.find(f => f.id === frameworkId)?.label;

  // Tension curve as explicit anchor
  const tensionCurve = (p1.overallTension || [])
    .map((t, i) => `${Math.round(i / 39 * 100)}%:${t}`)
    .join(" ");

  // Turning points as structural anchors
  const turningPoints = (p1.scenes || [])
    .filter(s => s.turningPoint)
    .map(s => `p${s.startPage}(${s.position}%) — ${s.turningPointNote || s.summary}`)
    .join("\n");

  // Natural act breaks
  const actBreaks = (p1.naturalStructure?.actBreaks || [])
    .map(ab => `Act ${ab.actNumber} break at p${ab.page} (${ab.position}%): ${ab.description}`)
    .join("\n");

  // Tension peak position — key anchor for climax
  const tensionVals = p1.overallTension || [];
  const peakIdx = tensionVals.indexOf(Math.max(...tensionVals));
  const peakPct = Math.round(peakIdx / 39 * 100);

  // Full scene list
  const sceneList = (p1.scenes || [])
    .map(s => `p${s.startPage}(${s.position.toFixed(0)}%) [${s.lengthPages}pp] ${s.heading} — ${s.summary} T:${s.tension}${s.turningPoint ? " ★" : ""}`)
    .join("\n");

  return `You are an expert script analyst mapping "${p1.title}" to the ${fwLabel} framework.

SCRIPT FACTS — USE THESE AS HARD ANCHORS:
- Total pages: ${p1.totalPages}
- Tension peak: ${peakPct}% (page ~${Math.round(peakPct / 100 * p1.totalPages)})
- Natural act breaks:\n${actBreaks || "none identified"}
- Confirmed turning points:\n${turningPoints || "none identified"}
- Tension curve (position%:tension): ${tensionCurve}

FRAMEWORK: ${fwLabel}
${fw.guide}

BEAT MAPPING RULES — NON-NEGOTIABLE:
1. Beats MUST be distributed across the FULL script (0-100%), not clustered in the first half
2. The climax/ordeal/finale beat MUST be near the tension peak (~${peakPct}%), not before it
3. Each beat position must match a real scene from the scene list below
4. Beats must be in chronological order — no beat can precede the one before it by more than 5%
5. Use the tension curve to validate — a beat marked tension:8 must occur where the curve shows high tension
6. If a beat is genuinely absent from this specific story, mark found:false — but do not mark found:false just because you can't place it early

SCENE LIST (page / position / length / heading — summary / tension):
${sceneList}

Return ONLY valid JSON, no markdown:
{
  "beats": [
    {
      "id": string (snake_case),
      "label": string (EXACT name from: ${fw.beats.join(", ")}),
      "page": number (real page from scene list),
      "position": number (position% from scene list — must match a real scene),
      "tension": number 0-10,
      "description": string (2-3 sentences specific to THIS script and THIS scene — not generic),
      "found": boolean,
      "sceneRef": string (exact scene heading from scene list)
    }
  ]
}`;
}

function buildComparisonPrompt(a, b) {
  const hasOutline = a.isOutline || b.isOutline;
  const outline = a.isOutline ? a : (b.isOutline ? b : null);
  const reference = a.isOutline ? b : a;

  const fmt = e => {
    const isOL = e.isOutline;
    const avgLen = (!isOL && e.scenes?.length)
      ? (e.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / e.scenes.length).toFixed(1)
      : null;
    const docType = isOL
      ? (e.formatTransition?.transitionScene ? "HYBRID (partial script + outline)" : "DEVELOPMENT OUTLINE")
      : "FINISHED SCREENPLAY";
    const lengthLine = isOL
      ? `${e.totalScenes} scenes (outline — no page count)`
      : `${e.totalPages}pp · ${e.totalScenes} scenes · avg ${avgLen}pp/scene`;
    return `Title: "${e.title}" [${docType}]
Length: ${lengthLine}
Genre: ${e.genre} | Tone: ${e.tone}
Natural structure: ${e.naturalStructure?.actCount}-act
Act breaks: ${(e.naturalStructure?.actBreaks || []).map(ab => `Act${ab.actNumber}@${ab.position}%`).join(", ")}
Key moments: II@${e.keyMoments?.incitingIncident?.position?.toFixed(0)}% · MP@${e.keyMoments?.midpoint?.position?.toFixed(0)}% · CLX@${e.keyMoments?.climax?.position?.toFixed(0)}%
Structural personality: ${e.naturalStructure?.structuralPersonality}
Pacing notes: ${e.naturalStructure?.pacingNotes}
Tension curve (40pts): ${(e.overallTension || []).join(",")}
Turning points: ${(e.scenes || []).filter(s => s.turningPoint).map(s => `[${s.position}%] ${s.turningPointNote || s.summary}`).join(" | ")}`;
  };

  const devInstructions = hasOutline ? `
IMPORTANT — DEVELOPMENT COMPARISON MODE:
One document is a development outline, the other is a finished produced script used as a structural reference.
- Do NOT compare page counts or scene lengths — the outline has no meaningful page count
- Frame all analysis from the writer's perspective: what does the reference script do that the outline should consider?
- Be specific about structural positions (%) when citing differences
- The "developmentNotes" field is required: give the writer 3 concrete, actionable recommendations for how to strengthen the outline's structure before writing it out, based on what the reference script demonstrates
- "scriptAStrengths" and "scriptBStrengths" should be relabeled in your thinking: for the outline entry, focus on what the story concept and structure already do well; for the reference, focus on what techniques the writer can study
` : "";

  return `You are an expert script analyst comparing two scripts.
${devInstructions}
SCRIPT A:
${fmt(a)}

SCRIPT B:
${fmt(b)}

Return ONLY valid JSON, no markdown:
{
  "headline": string (one punchy sentence — the essential structural insight from this comparison),
  "comparison": string (2-3 focused paragraphs: ${hasOutline ? "how the reference script's structure can inform the outline — cite specific positions. What does the reference do at key structural moments that the outline writer should study?" : "structural and pacing comparison — cite specific positions/pages. How do tension curves compare? What can a writer learn?"}),
  "scriptAStrengths": [string] (2 ${a.isOutline ? "structural strengths already present in this outline/story concept" : "structural or pacing strengths with evidence"}),
  "scriptBStrengths": [string] (2 ${b.isOutline ? "structural strengths already present in this outline/story concept" : "structural or pacing strengths with evidence"}),
  "keyDifferences": [string] (3 concrete structural differences with position references)${hasOutline ? `,
  "developmentNotes": [string] (3 specific, actionable recommendations for the writer — what to address before writing the outline out as a full script, based on what the reference demonstrates)` : ""}
}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTLINE ANALYSIS — PROMPT BUILDERS

// ─────────────────────────────────────────────────────────────────────────────
// Scans raw scenes to estimate where finished screenplay writing ends and
// outline/description begins. Returns { transitionScene, transitionPct, confidence }.
// ─────────────────────────────────────────────────────────────────────────────
function detectFormatTransition(rawScenes) {
  if (!rawScenes || rawScenes.length < 4) return { transitionScene: null, transitionPct: null, confidence: "low" };

  // Score each scene for "screenplay-ness": dialogue, action lines, character cues
  const scores = rawScenes.map((raw) => {
    const lines = raw.split("\n");
    let score = 0;
    for (const line of lines) {
      const t = line.trim();
      if (/^[A-Z][A-Z\s\.\(\)]{2,30}$/.test(t) && t.length < 35) score += 2;  // character cues
      if (t.length > 0 && t.length < 80 && !/^(INT|EXT|INT\/EXT)/.test(t) && !/^[A-Z\s]+$/.test(t)) score += 0.5; // dialogue
      if (t.length > 40 && t.length < 200 && /[A-Z][a-z]/.test(t)) score += 1; // action lines
      if (/^(INT\.|EXT\.|INT\/EXT\.)/.test(t)) score += 3; // scene headings
    }
    return score;
  });

  // Smooth with window of 3
  const smoothed = scores.map((s, i) => {
    const w = scores.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });

  const half = Math.floor(smoothed.length / 2);
  const firstHalfAvg  = smoothed.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
  const secondHalfAvg = smoothed.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, smoothed.length - half);

  // Uniform throughout — no meaningful transition
  if (firstHalfAvg < 1 && secondHalfAvg < 1) return { transitionScene: null, transitionPct: null, confidence: "low" };
  if (Math.abs(firstHalfAvg - secondHalfAvg) < 1.5)  return { transitionScene: null, transitionPct: null, confidence: "low" };

  // Find first scene where score drops below 40% of first-half average
  const threshold = firstHalfAvg * 0.4;
  let transitionIdx = null;
  for (let i = Math.floor(smoothed.length * 0.2); i < smoothed.length; i++) {
    if (smoothed[i] < threshold && smoothed[Math.max(0, i - 1)] >= threshold) {
      transitionIdx = i;
      break;
    }
  }

  if (transitionIdx === null) return { transitionScene: null, transitionPct: null, confidence: "low" };

  const transitionScene = transitionIdx + 1;
  const transitionPct   = parseFloat(((transitionScene / rawScenes.length) * 100).toFixed(1));
  const confidence      = firstHalfAvg > 4 ? "high" : "medium";

  return { transitionScene, transitionPct, confidence };
}

// Parallel intake path: text outline → same parsed schema as script analysis.
// Phase OA = structural analysis (mirrors Phase 1A)
// Phase OB = scene enrichment (mirrors Phase 1B, no page data)
// ═══════════════════════════════════════════════════════════════════════════════

function buildOutlinePhaseOAPrompt(outlineText, sceneCount, formatHint) {
  const hybridNote = formatHint && formatHint.transitionScene
    ? `IMPORTANT — HYBRID DOCUMENT: This document contains finished screenplay writing in the first portion, shifting to outline/description format around scene ${formatHint.transitionScene} of ${sceneCount} (approx. ${formatHint.transitionPct}%). Treat BOTH halves as equally valid narrative evidence. The described portion tells you exactly what happens — use it with full confidence to place act breaks, the midpoint, and the climax. Do NOT favor the finished half. Commit to structural placements wherever story logic demands, regardless of which half they fall in.`
    : `This document may contain finished screenplay, outline descriptions, or both. Every scene description — even a single sentence — is valid narrative evidence. Read it as a story and commit to structural placements with the same confidence you would apply to a finished script.`;

  return `You are an expert script analyst performing a structural read of a screenplay document.

${hybridNote}

SCENE COUNT: ${sceneCount} scenes/sequences identified.
DOCUMENT TEXT:
${outlineText.slice(0, 14000)}

Identify the story's NATURAL structure. Do not hedge or reduce precision because material is descriptive rather than dramatized. A scene described as "Marcus discovers the evidence was planted — he has been working for the wrong side" is a perfectly valid midpoint. Commit to it.

Return ONLY valid JSON, no markdown:
{
  "title": string,
  "writer": string (full name(s) as credited on the cover page — "Written by", "Screenplay by", etc. If not found, empty string),
  "logline": string (1-2 sentences),
  "totalPages": ${sceneCount},
  "totalScenes": ${sceneCount},
  "protagonist": string,
  "antagonistOrConflict": string,
  "genre": string,
  "tone": string,
  "themes": [string],
  "naturalStructure": {
    "actCount": number (2, 3, or 4),
    "actBreaks": [
      {
        "actNumber": number,
        "sceneNumber": number (1-based scene index),
        "description": string (what happens, why it is a structural break — 1-2 sentences)
      }
    ],
    "structuralPersonality": string (2-3 sentences: what makes this story's structure distinctive),
    "pacingNotes": string (2-3 sentences: pacing character, where it accelerates or breathes)
  },
  "keyMoments": {
    "incitingIncident": { "sceneNumber": number },
    "midpoint":         { "sceneNumber": number },
    "climax":           { "sceneNumber": number }
  }
}
Note: Do NOT include overallTension — it is derived from per-scene scores in Phase OB.`;
}

function buildOutlinePhaseOBPrompt(sceneSlice, totalScenes, structureSummary, formatHint) {
  const kmScenes = new Set(
    ["incitingIncident","midpoint","climax"]
      .map(k => structureSummary.keyMoments?.[k]?.sceneNumber)
      .filter(Boolean)
  );

  const transitionNote = formatHint && formatHint.transitionScene
    ? `\nFORMAT NOTE: Scenes 1–${formatHint.transitionScene} are finished screenplay. Scenes ${formatHint.transitionScene + 1}+ are outline/description. Calibrate tension values to dramatic stakes — a described climactic scene should score as high as a written one. Do not penalize sparse text.\n`
    : "";

  const sceneBlock = sceneSlice.map(s => {
    const isKM = kmScenes.has(s.number);
    const tag = isKM ? ` ★KEY MOMENT★` : "";
    return `SCENE ${s.number}${tag} (${s.position.toFixed(0)}%)\n${s.rawText || s.heading}`;
  }).join("\n\n---\n\n");

  return `You are an expert script analyst enriching a scene list. This document may contain finished screenplay, outline descriptions, or both.
${transitionNote}
STORY CONTEXT:
Title: "${structureSummary.title}"
Genre: ${structureSummary.genre} | Tone: ${structureSummary.tone}
Structure: ${structureSummary.naturalStructure?.actCount}-act | Total scenes: ${totalScenes}

For each scene: provide a concise summary of what happens, a tension value (0-10 based on dramatic stakes, not prose quality), whether it is a structural turning point, and a brief note if so. Key moment scenes (marked ★) need accurate summaries even if source text is sparse — infer from context what the scene accomplishes structurally.

SCENES:
${sceneBlock}

Return ONLY valid JSON, no markdown:
{
  "scenes": [
    {
      "number": number,
      "summary": string (1-2 sentences — what happens and why it matters),
      "tension": number 0-10,
      "turningPoint": boolean,
      "turningPointNote": string (1 sentence if turningPoint, else "")
    }
  ]
}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════════

async function callClaude(content, maxTokens = 4000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: API_HEADERS,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const d = await r.json();

  // Check stop_reason — if max_tokens, response was cut off
  const stopReason = d.stop_reason;
  const text = d.content?.map(b => b.text || "").join("") || "";
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const wasTruncated = stopReason === "max_tokens";

  // Attempt 1: clean parse
  try {
    const r = JSON.parse(clean);
    if (wasTruncated) r._truncated = true;
    return r;
  } catch {}

  // Attempt 2: extract outermost object
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try {
    const r = JSON.parse(m[0]);
    if (wasTruncated) r._truncated = true;
    return r;
  } catch {} }

  // Attempt 3: truncation recovery — robustly heal cut-off JSON
  try {
    let s = clean;

    // Step 1: find the last COMPLETE scene object — ends with a boolean or number
    // before the cut. We look for the last well-formed object boundary.
    // Priority: last complete object ending },  or }\n or just }
    // Strategy: scan backwards for the last position after which everything is incomplete.

    // Find candidates for "last safe trim point" — positions after a complete value
    const safeEnds = [];
    // After a complete object: "...}"  followed by , or whitespace
    let re = /\}[\s,\n]/g, match;
    while ((match = re.exec(s)) !== null) safeEnds.push(match.index + 1);
    // After a complete string value with comma: "...",
    re = /"[\s]*,/g;
    while ((match = re.exec(s)) !== null) safeEnds.push(match.index + 1);
    // After a complete number/bool with comma: 5, or false,
    re = /(?:true|false|null|\d+)\s*,/g;
    while ((match = re.exec(s)) !== null) safeEnds.push(match.index + match[0].trimEnd().length - 1);

    // Pick the last safe end that still leaves meaningful content (>50 chars)
    const validEnds = safeEnds.filter(p => p > 50).sort((a, b) => b - a);
    if (validEnds.length > 0) {
      s = s.slice(0, validEnds[0]);
    }

    // Step 2: if there's an unclosed string (odd number of unescaped quotes
    // after the last { or [), remove the trailing partial string
    const trailingPartial = s.match(/,\s*"[^"]*$/);
    if (trailingPartial) {
      s = s.slice(0, s.length - trailingPartial[0].length);
    }

    // Step 3: close open arrays and objects in correct order
    // Build a stack to know what needs closing
    const stack = [];
    let inString = false, escape = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if (c === "}" || c === "]") stack.pop();
    }
    // Close in reverse order
    s += stack.reverse().join("");

    const result = JSON.parse(s);
    result._truncated = true;
    return result;
  } catch {}

  throw new Error(`Parse failed: ${clean.slice(0, 400)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "scriptgraph_v11";

async function loadLibrary() {
  if (PUBLIC_MODE) {
    try {
      const res = await fetch("/library/manifest.json");
      if (!res.ok) return [];
      const manifest = await res.json();
      const entries = await Promise.all(
        manifest.map(async (filename) => {
          try {
            const r = await fetch(`/library/${filename}`);
            if (!r.ok) return null;
            const data = await r.json();
            return { ...data, _filename: filename };
          } catch { return null; }
        })
      );
      return entries.filter(Boolean);
    } catch { return []; }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function persistLibrary(entries) {
  if (PUBLIC_MODE) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}


// ═══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

function Toast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", bottom: 88, right: 24, zIndex: 1000,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: T.bgCard,
          border: `1px solid ${t.type === "error" ? T.colorError + "50" : T.accent + "50"}`,
          borderRadius: T.radiusMd,
          padding: "12px 18px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 8px 32px #00000060",
          animation: "sgToastIn 0.2s ease",
          minWidth: 260, maxWidth: 380,
        }}>
          <span style={{ fontSize: 14, color: t.type === "error" ? T.colorError : T.accent }}>
            {t.type === "error" ? "✕" : "✓"}
          </span>
          <span style={{ fontSize: 13, color: T.textSecondary, fontFamily: T.fontSans, fontWeight: 400, lineHeight: 1.4 }}>
            {t.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

function Btn({ children, onClick, color, variant = "outline", disabled, small, style = {} }) {
  const c = color || T.borderMid;
  return (
    <button style={{
      padding: small ? "5px 14px" : "9px 22px",
      border: `1px solid ${variant === "ghost" ? T.borderSubtle : c}`,
      borderRadius: T.radiusSm,
      background: variant === "fill" ? `${c}20` : "transparent",
      color: variant === "ghost" ? T.textMuted : c,
      fontSize: small ? 11 : 12,
      fontFamily: T.fontSans,
      fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.35 : 1,
      letterSpacing: 0.2,
      transition: "all 0.12s",
      ...style,
    }} onClick={onClick} disabled={disabled}>{children}</button>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 300, color: color || T.textPrimary, fontFamily: T.fontSans, letterSpacing: -0.8 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontFamily: T.fontSans, fontWeight: 600, color: T.textMuted, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 16 }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: T.borderSubtle, margin: "24px 0" }} />;
}

function ErrorBox({ message }) {
  return (
    <div style={{ marginTop: 14, padding: "12px 16px", background: `${T.colorError}10`, border: `1px solid ${T.colorError}35`, borderRadius: T.radiusMd, color: T.colorError, fontSize: 12, lineHeight: 1.6, wordBreak: "break-word", fontFamily: T.fontMono }}>
      {message}
    </div>
  );
}

function WarningBox({ messages }) {
  if (!messages?.length) return null;
  return (
    <div style={{ marginBottom: 16, padding: "12px 16px", background: `${T.colorWarning}10`, border: `1px solid ${T.colorWarning}35`, borderRadius: T.radiusMd }}>
      <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.colorWarning, letterSpacing: 2, marginBottom: 8 }}>VALIDATION WARNINGS</div>
      {messages.map((m, i) => (
        <div key={i} style={{ fontSize: 12, color: T.colorWarning, lineHeight: 1.65, fontFamily: T.fontSans, fontWeight: 300, opacity: 0.85 }}>⚠ {m}</div>
      ))}
    </div>
  );
}

function TruncationWarning({ p1 }) {
  if (!p1?._truncated) return null;
  const received = p1.scenes?.length || 0;
  const expected = p1.totalScenes || 0;
  return (
    <div style={{ marginBottom: 16, padding: "12px 16px", background: `${T.colorWarning}10`, border: `1px solid ${T.colorWarning}35`, borderRadius: T.radiusMd }}>
      <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.colorWarning, letterSpacing: 2, marginBottom: 4 }}>PARTIAL ANALYSIS</div>
      <div style={{ fontSize: 12, color: T.colorWarning, lineHeight: 1.65, fontFamily: T.fontSans, fontWeight: 300, opacity: 0.85 }}>
        Response was truncated. Received {received} of ~{expected} scenes. Tension arc and structure summary are complete, but some late scenes may be missing from the scene list. The analysis accuracy is not affected.
      </div>
    </div>
  );
}

function Loader({ color, label, sublabel }) {
  return (
    <div style={{ textAlign: "center", padding: "70px 0" }}>
      <div style={{ fontSize: 12, color, fontFamily: T.fontMono, letterSpacing: 3, marginBottom: 14 }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono, marginBottom: 28 }}>{sublabel}</div>}
      <div style={{ height: 2, background: T.borderSubtle, borderRadius: 2, overflow: "hidden", maxWidth: 280, margin: "0 auto" }}>
        <div style={{ height: "100%", width: "42%", background: color, borderRadius: 2, animation: "sgpulse 1.5s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes sgpulse{0%{transform:translateX(-120%)}100%{transform:translateX(350%)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RHYTHM MARKER COLORS & ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const MARKER_STYLE = {
  inciting_incident: { color: "#c8a060", icon: "◉" },
  midpoint:          { color: "#e0c890", icon: "◆" },
  climax:            { color: "#d46050", icon: "▲" },
  rapid_sequence:    { color: "#48b878", icon: "≡" },
  sustained_scene:   { color: "#8870d8", icon: "━" },
  format_shift:      { color: "#5090d8", icon: "⬡" },
};

function markerStyle(subtype) {
  return MARKER_STYLE[subtype] || { color: "#888", icon: "·" };
}

function RhythmPanel({ markers, actBreaks, hoveredMarkerId, onMarkerHover }) {
  const allItems = [
    ...(actBreaks || []).map((ab, i) => ({
      id: `ab_${i}`, type: "act_break", subtype: "act_break",
      position: ab.position, page: ab.page,
      label: `Act ${ab.actNumber} Break`, note: ab.description, tension: null,
      validation: ab.validation || null,
    })),
    ...markers,
  ].sort((a, b) => a.position - b.position);

  if (!allItems.length) return <div style={{ color: T.textMuted, fontSize: 13, fontFamily: T.fontMono }}>No markers computed.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {allItems.map(m => {
        const ms = m.type === "act_break" ? { color: "#c8a060", icon: "◇" } : markerStyle(m.subtype);
        const isHov = hoveredMarkerId === m.id;
        return (
          <div key={m.id}
            onMouseEnter={() => onMarkerHover && onMarkerHover(m.id)}
            onMouseLeave={() => onMarkerHover && onMarkerHover(null)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px",
              background: isHov ? `${ms.color}18` : T.bgHover,
              border: `1px solid ${isHov ? ms.color + "60" : T.borderSubtle}`,
              borderRadius: T.radiusMd, cursor: "default", transition: "all 0.1s",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 44 }}>
              <span style={{ fontSize: 15, color: ms.color, lineHeight: 1 }}>{ms.icon}</span>
              <span style={{ fontSize: 9, fontFamily: T.fontMono, color: ms.color }}>{m.position}%</span>
              {m.page && <span style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted }}>p{m.page}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontFamily: T.fontMono, color: isHov ? ms.color : T.textSecondary, marginBottom: m.note ? 4 : 0, letterSpacing: 0.5 }}>
                {m.label}
                {m.tension != null && <span style={{ marginLeft: 8, opacity: 0.45, fontSize: 10 }}>T:{m.tension.toFixed(1)}</span>}
              </div>
              {m.note && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.65, fontFamily: T.fontSans, fontWeight: 3005, fontFamily: T.fontSans, fontWeight: 300 }}>{m.note}</div>}
              {m.sceneHeading && (
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.sceneHeading}
                </div>
              )}
              {m.validation && (
                <div style={{ marginTop: 6, padding: "5px 8px", borderRadius: T.radiusSm,
                  background: m.validation.verdict === "replaced" ? "#d4605018" : "#48b87814",
                  border: `1px solid ${m.validation.verdict === "replaced" ? "#d4605038" : "#48b87830"}`,
                }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: m.validation.ruling ? 3 : 0 }}>
                    <span style={{ fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1.2,
                      color: m.validation.verdict === "replaced" ? "#d46050" : "#48b878" }}>
                      {m.validation.verdict === "replaced" ? "⚠ CORRECTED" : "✓ VALIDATED"}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 1 }}>
                      {m.validation.confidence?.toUpperCase()}
                    </span>
                  </div>
                  {m.validation.ruling && (
                    <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.55 }}>{m.validation.ruling}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RhythmLegend({ showFormatShift }) {
  const items = [
    ["inciting_incident","Inciting Incident"],
    ["midpoint","Midpoint"],
    ["climax","Climax"],
    ["rapid_sequence","Rapid Sequence"],
    ["sustained_scene","Sustained Scene"],
    ["act_break","Act Break"],
  ];
  if (showFormatShift) items.push(["format_shift","Format Shift"]);
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      {items.map(([sub, label]) => {
        const ms = sub === "act_break" ? { color: "#c8a060", icon: "◇" }
          : sub === "format_shift" ? { color: "#5090d8", icon: "⬡" }
          : markerStyle(sub);
        const isShift = sub === "format_shift";
        return (
          <div key={sub} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {isShift
              ? <span style={{ display: "inline-block", width: 10, height: 12, borderLeft: "1px dashed #5090d8", opacity: 0.7 }} />
              : <span style={{ fontSize: 12, color: ms.color }}>{ms.icon}</span>}
            <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textMuted }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENSION CHART with hover interaction
// ═══════════════════════════════════════════════════════════════════════════════

// Interpolate tension from the overallTension array at a given position 0-100
// This ensures beat dots and highlight circles always sit ON the curve line
function interpolateTension(tensionArr, positionPct) {
  if (!tensionArr?.length) return 5;
  const idx = (positionPct / 100) * (tensionArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return tensionArr[lo];
  const frac = idx - lo;
  return tensionArr[lo] * (1 - frac) + tensionArr[hi] * frac;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARE TENSION CHART
// Renders two tension curves with act break + key moment markers overlaid
// Markers include page labels when showPages=true
// ═══════════════════════════════════════════════════════════════════════════════

const KM_SHAPES = {
  incitingIncident: (cx, cy, sz, color) => <circle cx={cx} cy={cy} r={sz} fill={color} />,
  midpoint:  (cx, cy, sz, color) => <polygon points={`${cx},${cy-sz} ${cx+sz},${cy} ${cx},${cy+sz} ${cx-sz},${cy}`} fill={color} />,
  climax:    (cx, cy, sz, color) => <polygon points={`${cx},${cy-sz} ${cx-sz},${cy+sz*0.7} ${cx+sz},${cy+sz*0.7}`} fill={color} />,
};

function CompareTensionChart({ datasets, markers = [], showPages, normalized, maxPages, pageLengths = [] }) {
  const W = 900, H = 400, P = { t: 54, r: 28, b: 92, l: 52 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const [tooltip, setTooltip] = useState(null);

  const interpT = (arr, pos) => {
    if (!arr?.length) return 5;
    const idx = (pos / 100) * (arr.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? arr[lo] : arr[lo] * (1 - (idx - lo)) + arr[hi] * (idx - lo);
  };
  // In true-length mode: map percentage position relative to this script's own length
  // then scale that page onto the full axis (which spans maxPages)
  const toX = (pos, scriptPages) => {
    if (!normalized && maxPages && scriptPages) {
      // pos is 0-100% of scriptPages; map to fraction of maxPages axis
      const page = (pos / 100) * scriptPages;
      return P.l + (page / maxPages) * iw;
    }
    return P.l + (pos / 100) * iw;
  };
  const toY = (tension, val) => P.t + ih - (val / 10) * ih;
  const snapY = (arr, pos, scriptPages) => toY(null, interpT(arr, pos));

  // Stagger overlapping markers vertically by script index
  const STAGGER = 14;

  return (
    <div style={{ position: "relative" }}>
      {tooltip && (
        <div style={{
          position: "absolute",
          left: `${Math.min(Math.max(tooltip.pct * 100, 5), 70)}%`,
          top: 4,
          transform: "translateX(-50%)",
          background: T.bgCard,
          border: `1px solid ${tooltip.color}55`,
          borderRadius: T.radiusMd,
          padding: "8px 12px",
          maxWidth: 280,
          pointerEvents: "none",
          zIndex: 20,
          boxShadow: "0 4px 20px #00000070",
        }}>
          <div style={{ fontSize: 9, fontFamily: T.fontMono, color: tooltip.color, letterSpacing: 1.4, marginBottom: 3 }}>
            {tooltip.label} · p{tooltip.page} · {tooltip.position?.toFixed(0)}%
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5, marginBottom: tooltip.validation ? 6 : 0 }}>{tooltip.note}</div>
          {tooltip.validation && (
            <div style={{
              padding: "4px 7px", borderRadius: T.radiusSm,
              background: tooltip.validation.verdict === "replaced" ? "#d4605018" : "#48b87814",
              border: `1px solid ${tooltip.validation.verdict === "replaced" ? "#d4605038" : "#48b87830"}`,
            }}>
              <div style={{ fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1.2, marginBottom: tooltip.validation.ruling ? 3 : 0,
                color: tooltip.validation.verdict === "replaced" ? "#d46050" : "#48b878" }}>
                {tooltip.validation.verdict === "replaced" ? "⚠ CORRECTED" : "✓ VALIDATED"} {tooltip.validation.confidence?.toUpperCase()}
              </div>
              {tooltip.validation.ruling && (
                <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>{tooltip.validation.ruling}</div>
              )}
            </div>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
        onMouseLeave={() => setTooltip(null)}>
        <defs>
          {datasets.map((ds, i) => (
            <linearGradient key={i} id={`ctg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ds.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={ds.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {[0,2,4,6,8,10].map(v => {
          const y = P.t + ih - (v/10)*ih;
          return (
            <g key={v}>
              <line x1={P.l} y1={y} x2={P.l+iw} y2={y} stroke="#ffffff07" strokeWidth="1" />
              <text x={P.l-7} y={y+4} textAnchor="end" fill={T.textMuted} fontSize="10">{v}</text>
            </g>
          );
        })}

        {/* ── Act bands — only when viewing a single script ── */}
        {(() => {
          // In single-script view: draw shaded act bands with 2a/2b midpoint split
          // In both-script view: no bands — marker lines do the work
          const scriptMarkers = markers.filter(m => m.type === "actBreak");
          const scriptIndices = [...new Set(markers.map(m => m.scriptIndex))];
          if (scriptIndices.length !== 1) return null; // overlay mode — no bands

          const si = scriptIndices[0];
          const actBreakPositions = scriptMarkers
            .filter(m => m.scriptIndex === si)
            .map(m => m.position)
            .sort((a, b) => a - b);

          const midpointMarker = markers.find(m =>
            m.type === "keyMoment" && m.subtype === "midpoint" && m.scriptIndex === si
          );
          // midpointPos is already resolved via resolveKM in the marker build loop
          const midpointPos = midpointMarker?.position ?? null;

          const bandTints = ["#c8a0600e", "#ffffff08", "#c8a06009", "#ffffff06"];
          const band2aTint = "#c8a06012";
          const band2bTint = "#7b6ee80a";

          const segs = [];
          const breaks = [0, ...actBreakPositions, 100];
          breaks.slice(0, -1).forEach((start, i) => {
            const end = breaks[i + 1];
            const actNum = i + 1;
            // Split whichever segment the midpoint actually falls inside — not assumed to be Act 2
            const midInThisSeg = midpointPos !== null && midpointPos > start && midpointPos < end;
            if (midInThisSeg) {
              segs.push({ start, end: midpointPos, label: `ACT ${actNum}A`, tint: band2aTint });
              segs.push({ start: midpointPos, end, label: `ACT ${actNum}B`, tint: band2bTint });
            } else {
              segs.push({ start, end, label: `ACT ${actNum}`, tint: bandTints[i % bandTints.length] });
            }
          });

          return segs.map((seg, i) => {
            const x1 = P.l + (seg.start / 100) * iw;
            const x2 = P.l + (seg.end / 100) * iw;
            const isMidpointBoundary = seg.start === midpointPos;
            return (
              <g key={i}>
                <rect x={x1} y={P.t} width={x2 - x1} height={ih} fill={seg.tint} />
                {/* Midpoint boundary — dashed divider to distinguish from act breaks */}
                {isMidpointBoundary && (
                  <line x1={x1} y1={P.t} x2={x1} y2={P.t + ih}
                    stroke="#e0c890" strokeWidth="1" strokeDasharray="4,3" opacity="0.35" />
                )}
                <text x={x1 + (x2 - x1) / 2} y={P.t + 13} textAnchor="middle"
                  fill={seg.tint.replace(/[0-9a-f]{2}$/, "90")}
                  fontSize="9" fontFamily={T.fontMono} letterSpacing="1.5">
                  {seg.label}
                </text>
              </g>
            );
          });
        })()}

        {/* Curves */}
        {datasets.map((ds, di) => {
          if (!ds.tension?.length) return null;
          const sp = (!normalized && maxPages) ? (pageLengths[di] || maxPages) : null;
          const endFrac = sp ? sp / maxPages : 1;
          const endX = P.l + endFrac * iw;
          const pts = ds.tension.map((t, i) => {
            const pos = (i / (ds.tension.length - 1)) * 100;
            return {
              x: toX(pos, sp),
              y: P.t + ih - (t / 10) * ih,
            };
          });
          const pd = pts.map((p, i) => `${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const ad = `${pd} L${endX},${P.t+ih} L${pts[0].x},${P.t+ih} Z`;
          return (
            <g key={di}>
              <path d={ad} fill={`url(#ctg${di})`} />
              <path d={pd} fill="none" stroke={ds.color} strokeWidth="2.5" strokeLinejoin="round" />
              {/* End marker for shorter script in true-length mode */}
              {!normalized && sp && sp < maxPages && (
                <line x1={endX} y1={P.t} x2={endX} y2={P.t+ih}
                  stroke={ds.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
              )}
            </g>
          );
        })}

        {/* Markers */}
        {markers.map(m => {
          const sp = (!normalized && maxPages) ? (pageLengths[markers.filter(mk => mk.scriptIndex === m.scriptIndex)[0]?.scriptIndex] || maxPages) : null;
          const x = toX(m.position, sp || (pageLengths[m.scriptIndex] || maxPages));
          // For act breaks: diamond at top, staggered by script
          // For key moments: shape on the nearest dataset curve
          const ds = datasets[m.scriptIndex] || datasets[0];
          const curveY = ds?.tension ? snapY(ds.tension, m.position) : P.t + ih/2;
          const isActBreak = m.type === "actBreak";
          const staggerY = P.t + 8 + m.scriptIndex * STAGGER;

          if (isActBreak) {
            return (
              <g key={m.id} style={{ cursor: "pointer" }}
                onMouseEnter={() => setTooltip({ pct: (x-P.l)/iw, ...m })}
                onMouseLeave={() => setTooltip(null)}>
                <line x1={x} y1={P.t} x2={x} y2={P.t+ih} stroke={m.color} strokeWidth="1" opacity="0.5" />
                <polygon
                  points={`${x},${staggerY-6} ${x+5},${staggerY} ${x},${staggerY+6} ${x-5},${staggerY}`}
                  fill={T.bgPanel} stroke={m.color} strokeWidth="1.5" opacity="0.9"
                />
                {showPages && (
                  <text x={x} y={staggerY + 18} textAnchor="middle" fill={m.color} fontSize="8" opacity="0.75">
                    p{m.page}
                  </text>
                )}
                <rect x={x-10} y={P.t} width={20} height={ih} fill="transparent" />
              </g>
            );
          }

          // Key moment shape on curve
          const sz = 7;
          const shapeFn = KM_SHAPES[m.subtype] || KM_SHAPES.incitingIncident;
          return (
            <g key={m.id} style={{ cursor: "pointer" }}
              onMouseEnter={() => setTooltip({ pct: (x-P.l)/iw, ...m })}
              onMouseLeave={() => setTooltip(null)}>
              <line x1={x} y1={P.t} x2={x} y2={P.t+ih} stroke={m.color} strokeWidth="0.8" opacity="0.25" />
              {shapeFn(x, curveY, sz, m.color)}
              {showPages && (
                <text x={x} y={curveY - sz - 5} textAnchor="middle" fill={m.color} fontSize="8" opacity="0.85">
                  p{m.page}
                </text>
              )}
              <rect x={x-10} y={curveY-14} width={20} height={28} fill="transparent" />
            </g>
          );
        })}

        {/* Axes */}
        <line x1={P.l} y1={P.t} x2={P.l} y2={P.t+ih} stroke={T.borderMid} strokeWidth="1" />
        <line x1={P.l} y1={P.t+ih} x2={P.l+iw} y2={P.t+ih} stroke={T.borderMid} strokeWidth="1" />
        {[0,25,50,75,100].map(p => {
          const xPos = P.l + (p/100)*iw;
          const label = (!normalized && maxPages)
            ? `p${Math.round(p/100*maxPages)}`
            : `${p}%`;
          return (
            <g key={p}>
              <line x1={xPos} y1={P.t+ih} x2={xPos} y2={P.t+ih+5} stroke={T.borderMid} strokeWidth="1" />
              <text x={xPos} y={P.t+ih+16} textAnchor="middle" fill={T.textMuted} fontSize="10">{label}</text>
            </g>
          );
        })}
        {/* Axis labels */}
        <text x={P.l+iw/2} y={P.t+ih+34} textAnchor="middle" fill={T.textMuted} fontSize="10">
          {(!normalized && maxPages) ? `PAGES (MAX ${maxPages})` : "SCRIPT PROGRESSION"}
        </text>
        <text x={14} y={P.t+ih/2} textAnchor="middle" fill={T.textMuted} fontSize="10"
          transform={`rotate(-90,14,${P.t+ih/2})`}>TENSION</text>

        {/* Legend — sits below axis label with enough clearance */}
        {datasets.map((ds, i) => (
          <g key={i} transform={`translate(${P.l + i * 260}, ${H - 10})`}>
            <rect x="0" y="-4" width="18" height="3" fill={ds.color} rx="1.5" />
            <text x="24" y="0" fill={ds.color} fontSize="10" opacity="0.85">{ds.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function TensionChart({ datasets, actBreaks, showActs, normalized, hoveredBeatId, onBeatHover,
                          hoveredTpId, onTpHover, rhythmMarkers, hoveredMarkerId, onMarkerHover,
                          totalPages, showPages, onToggleAxis, midpointPosition, formatTransition }) {
  const W = 900, H = 340, P = { t: 48, r: 28, b: 52, l: 52 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const [tooltipTp, setTooltipTp] = useState(null);
  const svgRef = useRef();

  // Interpolate tension from array at position 0-100
  const interpT = (arr, pos) => {
    if (!arr?.length) return 5;
    const idx = (pos / 100) * (arr.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    return arr[lo] * (1 - (idx - lo)) + arr[hi] * (idx - lo);
  };
  const snapY = (arr, pos) => P.t + ih - (interpT(arr, pos) / 10) * ih;

  // Act band colors — alternating subtle tints
  const bandTints = ["#c8a06012", "#ffffff08", "#c8a06009", "#ffffff06", "#c8a06007"];

  // X-axis tick labels — % or page numbers
  const xTicks = [0, 25, 50, 75, 100];
  const tickLabel = (pct) => {
    if (!showPages || !totalPages) return `${pct}%`;
    return `p${Math.round(pct / 100 * totalPages)}`;
  };

  // Marker shape renderers — each drawn ON the curve
  const renderMarkerShape = (subtype, cx, cy, color, size) => {
    switch (subtype) {
      case "climax":
        // Upward triangle
        return <polygon key="s" points={`${cx},${cy - size} ${cx - size},${cy + size * 0.6} ${cx + size},${cy + size * 0.6}`} fill={color} />;
      case "inciting_incident":
        // Filled circle
        return <circle key="s" cx={cx} cy={cy} r={size} fill={color} />;
      case "midpoint":
        // Diamond
        return <polygon key="s" points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`} fill={color} />;
      case "rapid_sequence":
        // Three horizontal bars
        return <g key="s">{[-3,0,3].map((dy,i) => <rect key={i} x={cx-size} y={cy+dy-1} width={size*2} height={1.5} fill={color} />)}</g>;
      case "sustained_scene":
        // Horizontal bar
        return <rect key="s" x={cx - size * 1.4} y={cy - 1.5} width={size * 2.8} height={3} fill={color} />;
      default:
        return <circle key="s" cx={cx} cy={cy} r={size} fill={color} />;
    }
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Hover tooltip */}
      {tooltipTp && (
        <div style={{
          position: "absolute",
          left: `${Math.min(Math.max(tooltipTp.svgPct * 100, 8), 72)}%`,
          top: 4,
          transform: "translateX(-50%)",
          background: T.bgCard,
          border: `1px solid ${tooltipTp.color}55`,
          borderRadius: T.radiusMd,
          padding: "8px 12px",
          maxWidth: 240,
          pointerEvents: "none",
          zIndex: 20,
          boxShadow: `0 4px 20px #00000060`,
        }}>
          <div style={{ fontSize: 9, fontFamily: T.fontMono, color: tooltipTp.color, letterSpacing: 1.5, marginBottom: 4 }}>
            {tooltipTp.label} · p{tooltipTp.page} · {tooltipTp.position}%
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>{tooltipTp.note}</div>
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
        onMouseLeave={() => setTooltipTp(null)}>

        <defs>
          {datasets.map((ds, i) => (
            <linearGradient key={i} id={`tg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ds.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={ds.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* ── Act bands — with 2A/2B midpoint split ── */}
        {(() => {
          if (!actBreaks?.length) return null;
          const band2aTint = "#c8a06014";
          const band2bTint = "#ffffff07";
          const segs = [];
          const breaks = [0, ...actBreaks.map(ab => ab.position), 100];
          breaks.slice(0, -1).forEach((start, i) => {
            const end = breaks[i + 1];
            const actNum = i + 1;
            const midInSeg = midpointPosition != null && midpointPosition > start && midpointPosition < end;
            if (midInSeg) {
              segs.push({ start, end: midpointPosition, label: `ACT ${actNum}A`, tint: band2aTint });
              segs.push({ start: midpointPosition, end, label: `ACT ${actNum}B`, tint: band2bTint });
            } else {
              segs.push({ start, end, label: `ACT ${actNum}`, tint: bandTints[i % bandTints.length] });
            }
          });
          return segs.map((seg, si) => {
            const x1 = P.l + (seg.start / 100) * iw;
            const x2 = P.l + (seg.end / 100) * iw;
            const isMid = seg.start === midpointPosition;
            return (
              <g key={si}>
                <rect x={x1} y={P.t} width={x2 - x1} height={ih} fill={seg.tint} />
                {isMid && (
                  <line x1={x1} y1={P.t} x2={x1} y2={P.t + ih}
                    stroke="#e0c890" strokeWidth="1" strokeDasharray="4,3" opacity="0.35" />
                )}
                <text x={x1 + (x2 - x1) / 2} y={P.t + 13} textAnchor="middle"
                  fill={seg.tint.replace(/[0-9a-f]{2}$/, "80")}
                  fontSize="9" fontFamily={T.fontMono} letterSpacing="2">
                  {seg.label}
                </text>
              </g>
            );
          });
        })()}

        {/* Grid lines */}
        {[0, 2, 4, 6, 8, 10].map(v => {
          const y = P.t + ih - (v / 10) * ih;
          return (
            <g key={v}>
              <line x1={P.l} y1={y} x2={P.l + iw} y2={y} stroke="#ffffff07" strokeWidth="1" />
              <text x={P.l - 7} y={y + 4} textAnchor="end" fill={T.textMuted} fontSize="10">{v}</text>
            </g>
          );
        })}

        {/* Act break dividers — visible diamond at top of chart + wide invisible hit area */}
        {(actBreaks || []).map((ab, i) => {
          const x = P.l + (ab.position / 100) * iw;
          const abColor = "#c8a060";
          const isHov = hoveredTpId === `ab-${i}`;
          const dmY = P.t + 10; // diamond sits inside chart area, near top
          return (
            <g key={`ab-${i}`} style={{ cursor: "pointer" }}
              onMouseEnter={() => {
                onTpHover && onTpHover(`ab-${i}`);
                setTooltipTp({ svgPct: (x - P.l) / iw, page: ab.page, position: ab.position,
                  note: ab.description, color: abColor, label: `Act ${ab.actNumber} Break` });
              }}
              onMouseLeave={() => { onTpHover && onTpHover(null); setTooltipTp(null); }}
            >
              {/* Full-height line */}
              <line x1={x} y1={P.t} x2={x} y2={P.t + ih}
                stroke={abColor} strokeWidth={isHov ? 2 : 1}
                opacity={isHov ? 1 : 0.6} />
              {/* Diamond marker inside chart */}
              <polygon
                points={`${x},${dmY - 7} ${x + 6},${dmY} ${x},${dmY + 7} ${x - 6},${dmY}`}
                fill={isHov ? abColor : T.bgPanel}
                stroke={abColor}
                strokeWidth="1.5"
                opacity={isHov ? 1 : 0.85}
              />
              {/* Wide invisible hit area for easy hover */}
              <rect x={x - 10} y={P.t} width={20} height={ih}
                fill="transparent" />
            </g>
          );
        })}

        {/* Hovered beat highlight */}
        {hoveredBeatId && datasets[0]?.tension && (() => {
          const b = datasets.flatMap(ds => ds.beats || []).find(b => b.id === hoveredBeatId);
          if (!b) return null;
          const x = P.l + (b.position / 100) * iw;
          const y = snapY(datasets[0].tension, b.position);
          return (
            <g>
              <line x1={x} y1={P.t} x2={x} y2={P.t + ih} stroke={datasets[0].color} strokeWidth="1.5" opacity="0.7" />
              <circle cx={x} cy={y} r="9" fill="none" stroke={datasets[0].color} strokeWidth="2" opacity="0.9" />
            </g>
          );
        })()}

        {/* Datasets — curve + fill */}
        {datasets.map((ds, di) => {
          if (!ds.tension?.length) return null;
          const pts = ds.tension.map((t, i) => ({
            x: P.l + (i / (ds.tension.length - 1)) * iw,
            y: P.t + ih - (t / 10) * ih,
          }));
          const pd = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const ad = `${pd} L${pts[pts.length - 1].x},${P.t + ih} L${pts[0].x},${P.t + ih} Z`;
          return (
            <g key={di}>
              <path d={ad} fill={`url(#tg${di})`} />
              <path d={pd} fill="none" stroke={ds.color} strokeWidth={datasets.length > 1 ? 2 : 2.5} strokeLinejoin="round" />
            </g>
          );
        })}

        {/* Format shift line — shown only for hybrid outline documents */}
        {formatTransition?.transitionScene && (() => {
          const x = P.l + (formatTransition.transitionPct / 100) * iw;
          const shiftColor = "#5090d8";
          return (
            <g key="format-shift">
              <line x1={x} y1={P.t} x2={x} y2={P.t + ih}
                stroke={shiftColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.45" />
              <text x={x + 4} y={P.t + 22} fill={shiftColor} fontSize="8"
                fontFamily={T.fontMono} letterSpacing="1" opacity="0.7">FORMAT SHIFT</text>
            </g>
          );
        })()}

        {/* Rhythm markers — shape ON the curve, subtle vertical line */}
        {(rhythmMarkers || []).map(m => {
          const x = P.l + (m.position / 100) * iw;
          const ms = markerStyle(m.subtype);
          const isHov = hoveredMarkerId === m.id;
          const tension0 = datasets[0]?.tension;
          const cy = tension0 ? snapY(tension0, m.position) : P.t + ih / 2;
          const sz = isHov ? 8 : 6;
          return (
            <g key={m.id} style={{ cursor: "pointer" }}
              onMouseEnter={() => {
                onMarkerHover && onMarkerHover(m.id);
                setTooltipTp({ svgPct: (x - P.l) / iw, page: m.page, position: m.position,
                  note: m.note || m.label, color: ms.color, label: m.label });
              }}
              onMouseLeave={() => { onMarkerHover && onMarkerHover(null); setTooltipTp(null); }}
            >
              <line x1={x} y1={P.t} x2={x} y2={P.t + ih}
                stroke={ms.color} strokeWidth={isHov ? 1.2 : 0.6}
                opacity={isHov ? 0.55 : 0.18} />
              {renderMarkerShape(m.subtype, x, cy, ms.color, sz)}
              {isHov && <circle cx={x} cy={cy} r={sz + 4} fill="none" stroke={ms.color} strokeWidth="1.5" opacity="0.6" />}
            </g>
          );
        })}

        {/* Axes */}
        <line x1={P.l} y1={P.t} x2={P.l} y2={P.t + ih} stroke={T.borderMid} strokeWidth="1" />
        <line x1={P.l} y1={P.t + ih} x2={P.l + iw} y2={P.t + ih} stroke={T.borderMid} strokeWidth="1" />

        {/* X axis ticks */}
        {xTicks.map(p => (
          <g key={p}>
            <line x1={P.l + (p / 100) * iw} y1={P.t + ih} x2={P.l + (p / 100) * iw} y2={P.t + ih + 5} stroke={T.borderMid} strokeWidth="1" />
            <text x={P.l + (p / 100) * iw} y={P.t + ih + 17} textAnchor="middle" fill={T.textMuted} fontSize="10">{tickLabel(p)}</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={P.l + iw / 2} y={H - 5} textAnchor="middle" fill={T.textMuted} fontSize="10">
          SCRIPT PROGRESSION
        </text>
        <text x={14} y={P.t + ih / 2} textAnchor="middle" fill={T.textMuted} fontSize="10"
          transform={`rotate(-90,14,${P.t + ih / 2})`}>TENSION</text>

        {/* Multi-script legend */}
        {datasets.length > 1 && datasets.map((ds, i) => (
          <g key={i} transform={`translate(${P.l + i * 220}, ${H - 10})`}>
            <rect x="0" y="-5" width="16" height="3" fill={ds.color} rx="1.5" />
            <text x="22" y="0" fill={ds.color} fontSize="10" opacity="0.85">{ds.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE LENGTH CHART
// ═══════════════════════════════════════════════════════════════════════════════

function SceneLengthChart({ scenes, color, showPages, totalPages }) {
  if (!scenes?.length) return null;
  const W = 900, H = 160, P = { t: 14, r: 28, b: 40, l: 52 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxLen = Math.max(...scenes.map(s => s.lengthPages), 1);
  const avgLen = scenes.reduce((s, sc) => s + sc.lengthPages, 0) / scenes.length;
  const barW = Math.max(1.5, iw / scenes.length - 0.8);
  const [hovered, setHovered] = useState(null); // { scene, x, y }

  const tickLabel = (pct) => {
    if (!showPages || !totalPages) return `${pct}%`;
    return `p${Math.round(pct / 100 * totalPages)}`;
  };

  return (
    <div style={{ position: "relative" }}>
      {hovered && (
        <div style={{
          position: "absolute",
          left: `${Math.min(Math.max((hovered.x / W) * 100, 5), 70)}%`,
          top: `${(hovered.y / H) * 100}%`,
          transform: "translate(-50%, -110%)",
          background: T.bgCard,
          border: `1px solid ${color}55`,
          borderRadius: T.radiusMd,
          padding: "7px 11px",
          pointerEvents: "none",
          zIndex: 10,
          boxShadow: "0 4px 16px #00000060",
          minWidth: 160,
          maxWidth: 260,
        }}>
          <div style={{ fontSize: 9, fontFamily: T.fontMono, color, letterSpacing: 1.2, marginBottom: 3 }}>
            p{hovered.scene.startPage} · {hovered.scene.lengthPages}pp · {hovered.scene.position}%
          </div>
          <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.5, wordBreak: "break-word" }}>
            {hovered.scene.heading}
          </div>
          {hovered.scene.summary && hovered.scene.summary !== "(no summary)" && (
            <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5, marginTop: 3 }}>
              {hovered.scene.summary}
            </div>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
        onMouseLeave={() => setHovered(null)}>
        {/* Avg line */}
        <line x1={P.l} y1={P.t + ih - (avgLen / maxLen) * ih}
          x2={P.l + iw} y2={P.t + ih - (avgLen / maxLen) * ih}
          stroke={color} strokeWidth="1" strokeDasharray="4,4" opacity="0.4" />
        <text x={P.l + iw + 3} y={P.t + ih - (avgLen / maxLen) * ih + 4}
          fill={color} fontSize="8" opacity="0.5">avg</text>

        {scenes.map((s, i) => {
          const x = P.l + (i / scenes.length) * iw;
          const barH = Math.max(1.5, (s.lengthPages / maxLen) * ih);
          const notable = s.lengthPages >= avgLen * 2;
          const isHov = hovered?.scene === s;
          return (
            <rect key={i}
              x={x} y={P.t + ih - barH} width={barW} height={barH}
              fill={isHov ? color : notable ? color : color + "45"}
              opacity={isHov ? 1 : notable ? 0.85 : 0.5}
              rx="0.5"
              style={{ cursor: notable ? "pointer" : "default" }}
              onMouseEnter={(e) => {
                if (notable || true) setHovered({ scene: s, x, y: P.t + ih - barH });
              }}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        <line x1={P.l} y1={P.t + ih} x2={P.l + iw} y2={P.t + ih} stroke={T.borderMid} strokeWidth="1" />
        <line x1={P.l} y1={P.t} x2={P.l} y2={P.t + ih} stroke={T.borderMid} strokeWidth="1" />

        <text x={P.l - 7} y={P.t + 4} textAnchor="end" fill={T.textMuted} fontSize="9">{maxLen}p</text>
        <text x={P.l - 7} y={P.t + ih + 4} textAnchor="end" fill={T.textMuted} fontSize="9">1p</text>

        {[0, 25, 50, 75, 100].map(p => (
          <text key={p} x={P.l + (p / 100) * iw} y={P.t + ih + 16}
            textAnchor="middle" fill={T.textMuted} fontSize="9">{tickLabel(p)}</text>
        ))}
        <text x={P.l + iw / 2} y={H - 2} textAnchor="middle" fill={T.textMuted} fontSize="9">
          SCENE LENGTH RHYTHM · HIGHLIGHTED = 2× AVG
        </text>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORY CIRCLE
// ═══════════════════════════════════════════════════════════════════════════════

function StoryCircle({ beats, color }) {
  const cx = 210, cy = 210, r = 135;
  const shorten = s => s.replace(/ — .*/, "").replace(", Allies, Enemies", "").replace(", Allies & Enemies", "");
  const wrap = (s, max = 12) => {
    const words = s.split(" "); const lines = []; let cur = "";
    words.forEach(w => {
      if ((cur + " " + w).trim().length <= max) cur = (cur + " " + w).trim();
      else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur); return lines;
  };

  return (
    <svg viewBox="0 0 420 420" style={{ width: "100%", maxWidth: 440 }}>
      <defs>
        <radialGradient id="scg2">
          <stop offset="0%" stopColor={color} stopOpacity="0.04" />
          <stop offset="100%" stopColor={color} stopOpacity="0.14" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="url(#scg2)" stroke={color} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r * 0.48} fill="none" stroke={color} strokeWidth="0.4" opacity="0.15" />
      <line x1={cx - r - 16} y1={cy} x2={cx + r + 16} y2={cy} stroke={color} strokeWidth="0.5" strokeDasharray="3,3" opacity="0.22" />
      <text x={cx + r + 20} y={cy - 5} fill={color} fontSize="8" opacity="0.35">COMFORT</text>
      <text x={cx + r + 20} y={cy + 12} fill={color} fontSize="8" opacity="0.35">UNKNOWN</text>

      {beats.map((b, i) => {
        const n = beats.length;
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const midAng = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
        const dx = cx + r * Math.cos(ang), dy = cy + r * Math.sin(ang);
        const tr = r * 0.22 + (b.tension / 10) * r * 0.3;
        const tx = cx + tr * Math.cos(midAng), ty = cy + tr * Math.sin(midAng);
        const lx = cx + r * 1.28 * Math.cos(midAng), ly = cy + r * 1.28 * Math.sin(midAng);
        const wlines = wrap(shorten(b.label));

        return (
          <g key={b.id}>
            <line x1={cx} y1={cy} x2={dx} y2={dy} stroke={color} strokeWidth="0.4" opacity="0.1" />
            <circle cx={dx} cy={dy} r={b.found ? 10 : 6} fill={b.found ? color : "transparent"} stroke={color} strokeWidth={b.found ? 0 : 1.5} opacity={b.found ? 1 : 0.3} />
            <text x={dx} y={dy + 1} textAnchor="middle" dominantBaseline="middle" fill={T.bgPage} fontSize="10" fontWeight="bold" fontFamily={T.fontMono}>{i + 1}</text>
            <circle cx={tx} cy={ty} r="3.5" fill={color} opacity={b.found ? 0.5 : 0.1} />
            {wlines.map((l, li) => (
              <text key={li} x={lx} y={ly - ((wlines.length - 1) / 2 - li) * 12}
                textAnchor="middle" dominantBaseline="middle"
                fill={b.found ? T.textPrimary : T.textMuted} fontSize="10" fontFamily={T.fontMono}>{l}</text>
            ))}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="6" fill={color} opacity="0.6" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEAT TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════

function BeatTimeline({ beats, color, hoveredBeatId, onBeatHover }) {
  const short = s => s
    .replace(", Allies, Enemies", "").replace(", Allies & Enemies", "")
    .replace(" of the Soul", "").replace("Approach to Inmost Cave", "Approach")
    .replace("Meeting the Mentor", "Mentor").replace("Crossing the Threshold", "Crossing")
    .replace("Refusal of the Call", "Refusal").replace("Return with Elixir", "Return")
    .replace("Dark Night of the Soul", "Dark Night").replace("Break into Three", "Br.→3")
    .replace("Break into Two", "Br.→2").replace("Fun and Games", "Fun & Games")
    .replace("Bad Guys Close In", "Bad Guys");

  return (
    <div style={{ position: "relative", padding: "32px 0 16px" }}>
      <div style={{ position: "absolute", top: 40, left: 0, right: 0, height: 1, background: `${color}25` }} />
      <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
        {beats.map(b => {
          const isHovered = hoveredBeatId === b.id;
          return (
            <div
              key={b.id}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6, cursor: "pointer" }}
              onMouseEnter={() => onBeatHover && onBeatHover(b.id)}
              onMouseLeave={() => onBeatHover && onBeatHover(null)}
            >
              <div style={{
                fontSize: 8.5, fontFamily: T.fontMono,
                color: isHovered ? color : b.found ? T.textSecondary : T.textDim,
                textAlign: "center", maxWidth: 56, lineHeight: 1.35, minHeight: 24,
                transition: "color 0.12s",
              }}>
                {short(b.label)}
              </div>
              <div style={{
                width: isHovered ? 14 : b.found ? 12 : 7,
                height: isHovered ? 14 : b.found ? 12 : 7,
                borderRadius: "50%",
                background: b.found ? color : "transparent",
                border: `2px solid ${b.found ? color : T.borderSubtle}`,
                zIndex: 1,
                transition: "all 0.12s",
                boxShadow: isHovered ? `0 0 10px ${color}80` : "none",
              }} />
              <div style={{ fontSize: 8, color: isHovered ? color : T.textDim, fontFamily: T.fontMono, transition: "color 0.12s" }}>p{b.page}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEATS PANEL with hover
// ═══════════════════════════════════════════════════════════════════════════════

function BeatsPanel({ beats, color, hoveredBeatId, onBeatHover }) {
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (hoveredBeatId) {
      const idx = beats.findIndex(b => b.id === hoveredBeatId);
      if (idx >= 0) setOpen(idx);
    }
  }, [hoveredBeatId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {beats.map((b, i) => {
        const isHovered = hoveredBeatId === b.id;
        return (
          <div
            key={b.id}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => onBeatHover && onBeatHover(b.id)}
            onMouseLeave={() => onBeatHover && onBeatHover(null)}
            style={{
              background: isHovered ? `${color}15` : open === i ? `${color}0e` : T.bgHover,
              border: `1px solid ${isHovered ? color + "60" : b.found ? color + "30" : T.borderSubtle}`,
              borderRadius: T.radiusMd, padding: "11px 15px", cursor: "pointer",
              transition: "all 0.12s",
              boxShadow: isHovered ? `0 0 0 1px ${color}30` : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: b.found ? color : T.borderMid, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontFamily: T.fontMono, color: b.found ? T.textPrimary : T.textMuted }}>{b.label}</span>
                {b.sceneRef && (
                  <span style={{ fontSize: 10, color: T.textMuted, fontStyle: "italic", overflow: "hidden", maxWidth: 200, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    — {b.sceneRef}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>p{b.page} · {b.position}%</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <div key={j} style={{ width: 3, height: 9, borderRadius: 1.5, background: j < b.tension ? color : T.borderSubtle }} />
                  ))}
                </div>
                <span style={{ fontSize: 9, color: T.textDim }}>{open === i ? "▲" : "▼"}</span>
              </div>
            </div>
            {(open === i || isHovered) && b.found && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${color}18`, fontSize: 13, color: T.textSecondary, lineHeight: 1.7 }}>
                {b.description}
              </div>
            )}
            {(open === i) && !b.found && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.borderSubtle}`, fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>
                Beat not clearly identified in this script.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE LIST
// ═══════════════════════════════════════════════════════════════════════════════

function SceneList({ scenes, color }) {
  const [filter, setFilter] = useState("all");
  const avgLen = scenes.length ? scenes.reduce((s, sc) => s + sc.lengthPages, 0) / scenes.length : 1;
  const longThreshold = avgLen * 2;
  const shown = filter === "turning" ? scenes.filter(s => s.turningPoint)
    : filter === "long" ? scenes.filter(s => s.lengthPages >= longThreshold)
    : scenes;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { id: "all", label: `All Scenes (${scenes.length})` },
          { id: "turning", label: `Turning Points (${scenes.filter(s => s.turningPoint).length})` },
          { id: "long", label: `Long Scenes (${scenes.filter(s => s.lengthPages >= longThreshold).length})` },
        ].map(f => (
          <Btn key={f.id} small color={filter === f.id ? color : T.borderMid} variant={filter === f.id ? "fill" : "ghost"} onClick={() => setFilter(f.id)}>
            {f.label}
          </Btn>
        ))}
        <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>avg {avgLen.toFixed(1)}pp/scene</span>
      </div>
      <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {shown.map(s => (
          <div key={s.number} style={{ display: "flex", gap: 12, padding: "9px 13px", background: T.bgHover, borderRadius: T.radiusSm, borderLeft: `3px solid ${s.turningPoint ? color + "80" : T.borderSubtle}` }}>
            <div style={{ flexShrink: 0, textAlign: "right", minWidth: 48 }}>
              <div style={{ fontSize: 11, color: T.textPrimary, fontFamily: T.fontMono }}>p{s.startPage}</div>
              <div style={{ fontSize: 10, color: s.lengthPages >= longThreshold ? color : T.textMuted, fontFamily: T.fontMono }}>{s.lengthPages}pp</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: s.turningPoint ? color : T.textSecondary, fontFamily: T.fontMono, marginBottom: 3 }}>{s.heading}</div>
              <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.55 }}>{s.summary}</div>
              {s.turningPoint && s.turningPointNote && (
                <div style={{ fontSize: 11, color, marginTop: 4, fontStyle: "italic" }}>★ {s.turningPointNote}</div>
              )}
            </div>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
              <div style={{ width: 3, height: Math.min(44, Math.max(5, s.lengthPages * 5)), background: s.lengthPages >= longThreshold ? color : color + "35", borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function StructuralSummary({ naturalStructure, color }) {
  if (!naturalStructure) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: T.bgHover, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusMd, padding: "20px 22px" }}>
        <SectionLabel>Structural Personality</SectionLabel>
        <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
          {naturalStructure.structuralPersonality}
        </div>
      </div>
      <div style={{ background: T.bgHover, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusMd, padding: "20px 22px" }}>
        <SectionLabel>Pacing Notes</SectionLabel>
        <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.8 }}>
          {naturalStructure.pacingNotes}
        </div>
      </div>
      <div>
        <SectionLabel>Natural Act Breaks — {naturalStructure.actCount}-Act Structure</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(naturalStructure.actBreaks || []).map((ab, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "10px 14px", background: T.bgHover, borderRadius: T.radiusSm, borderLeft: `3px solid ${color}55` }}>
              <span style={{ fontSize: 11, fontFamily: T.fontMono, color, minWidth: 72 }}>Act {ab.actNumber} break</span>
              <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textMuted, minWidth: 60 }}>p{ab.page} · {ab.position}%</span>
              <span style={{ fontSize: 13, color: T.textSecondary }}>{ab.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY CARD
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// MINI TENSION CURVE — library card thumbnail, no markers, no axes
// ═══════════════════════════════════════════════════════════════════════════════

function MiniTensionCurve({ tension, color, actBreaks, height = 52 }) {
  if (!tension?.length) return (
    <div style={{ height, background: T.bgHover, borderRadius: T.radiusSm, opacity: 0.4 }} />
  );

  const W = 400, H = height * 2; // render at 2× then scale down via viewBox
  const P = { t: 6, r: 4, b: 6, l: 4 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;

  // Smooth slightly
  const smooth = tension.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(tension.length - 1, i + 1);
    const slice = tension.slice(lo, hi + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const pts = smooth.map((t, i) => ({
    x: P.l + (i / (smooth.length - 1)) * iw,
    y: P.t + ih - (t / 10) * ih,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length-1].x},${P.t+ih} L${pts[0].x},${P.t+ih} Z`;

  // Act break vertical lines
  const abLines = (actBreaks || []).map((ab, i) => {
    const x = P.l + (ab.position / 100) * iw;
    return <line key={i} x1={x} y1={P.t} x2={x} y2={P.t+ih} stroke={color} strokeWidth="1.5" opacity="0.25" />;
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height, display: "block", borderRadius: T.radiusSm, overflow: "hidden" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`mcg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill={T.bgPage} />
      {abLines}
      <path d={areaPath} fill={`url(#mcg-${color.replace("#","")})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryCard({ entry, onOpen, onDelete, onToggleCompare, compareSelected, compareIndex }) {
  const color = T.fwColors.natural;
  const avgLen = entry.scenes?.length
    ? (entry.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / entry.scenes.length).toFixed(1)
    : entry.avgSceneLength || "?";

  return (
    <div style={{
      background: compareSelected ? `${color}0e` : T.bgCard,
      border: `1px solid ${compareSelected ? color + "55" : T.borderSubtle}`,
      borderRadius: T.radiusLg,
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 8,
      transition: "border-color 0.15s",
      cursor: "default",
    }}>
      {/* Title */}
      <div style={{
        fontSize: 20, fontWeight: 700,
        color: T.textPrimary,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontFamily: T.fontDisplay, letterSpacing: 1.5, lineHeight: 1.2, textTransform: "uppercase",
      }}>{entry.title}</div>

      {/* Development status badge — only for non-finished material */}
      {entry.isOutline && (() => {
        const isHybrid = entry.formatTransition?.transitionScene;
        const label = isHybrid ? "IN DEVELOPMENT" : "OUTLINE";
        return (
          <div style={{ display: "inline-flex", width: "fit-content" }}>
            <span style={{
              fontSize: 8, fontFamily: T.fontMono, letterSpacing: 1.8,
              textTransform: "uppercase", fontWeight: 600,
              color: T.accent, background: T.accent + "18",
              border: `1px solid ${T.accent}35`,
              borderRadius: "3px", padding: "2px 7px",
            }}>{label}</span>
          </div>
        );
      })()}
      {/* Genre — own line */}
      {entry.genre && (
        <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.fontSans, fontWeight: 400 }}>
          {entry.genre}
        </div>
      )}
      {/* Stats */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontFamily: T.fontMono, color, letterSpacing: 1 }}>
          {entry.naturalStructure?.structureType
            ? entry.naturalStructure.structureType.toUpperCase()
            : `${entry.naturalStructure?.actCount}-ACT`}
        </span>
        <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textMuted }}>
          {entry.isOutline
            ? `${entry.totalScenes} scenes · outline`
            : `${entry.totalPages}p · ${entry.totalScenes} scenes · ${avgLen}pp avg`}
        </span>
        {entry.savedAt && (
          <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textDim, marginLeft: "auto" }}>
            {new Date(entry.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>
      {/* Mini tension curve — replaces logline */}
      <div style={{ borderRadius: T.radiusSm, overflow: "hidden", margin: "2px 0" }}>
        <MiniTensionCurve
          tension={entry.overallTension}
          color={color}
          actBreaks={entry.naturalStructure?.actBreaks}
          height={52}
        />
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 7, marginTop: 2 }}>
        <Btn small color={color} variant="fill" onClick={() => onOpen(entry)} style={{ flex: 1 }}>Open</Btn>
        <Btn small color={compareSelected ? T.accent : T.borderMid} variant={compareSelected ? "fill" : "ghost"} onClick={() => onToggleCompare(entry)} style={{ flex: 1 }}>
          {compareSelected ? `✓ Script ${compareIndex + 1}` : "Compare"}
        </Btn>
        {!PUBLIC_MODE && (
          <Btn small color={T.textMuted} variant="ghost" onClick={() => onDelete(entry.id)}>✕</Btn>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// DERIVE OVERALL TENSION FROM SCENE-LEVEL SCORES
// Builds the 40-point tension curve from Phase 1B per-scene tension values.
// More reliable than Phase 1A holistic scoring — grounded in actual scene content.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// MIDPOINT RULING CORRECTION
// Phase 1C sometimes returns the wrong sceneNumber for the midpoint while the
// ruling text correctly identifies the intended scene. This runs at both analysis
// time and display time (openEntry) so saved JSONs also benefit.
// ═══════════════════════════════════════════════════════════════════════════════
function applyMidpointRulingCorrection(keyMoments, scenes) {
  if (!keyMoments?.midpoint?.validation?.ruling) return keyMoments;
  const mp = keyMoments.midpoint;
  const ruling = mp.validation.ruling;
  const currentSN = mp.sceneNumber;

  // Find all Scene #N references in the ruling — the LAST one is what the model argues for
  const sceneRefs = [...ruling.matchAll(/[Ss]cene\s*#(\d+)/g)].map(m => parseInt(m[1]));
  const targetSN = [...sceneRefs].reverse().find(sn => {
    if (sn === currentSN) return false;
    const sc = scenes?.find(s => s.number === sn);
    if (!sc) return false;
    return sc.position >= 35 && sc.position <= 72;
  });

  if (!targetSN) return keyMoments;

  const targetScene = scenes?.find(s => s.number === targetSN);
  if (!targetScene) return keyMoments;

  return {
    ...keyMoments,
    midpoint: {
      ...mp,
      sceneNumber: targetSN,
      page: targetScene.startPage,
      position: targetScene.position,
      description: targetScene.summary || mp.description,
      sceneHeading: targetScene.heading || mp.sceneHeading,
      validation: {
        ...mp.validation,
        verdict: "replaced",
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISH STUDIO — password-protected JSON publisher with delete
// ═══════════════════════════════════════════════════════════════════════════════
function PublishStudio({ T, insights = [], onDownloadInsight, library: appLibrary = [] }) {
  const [tab, setTab] = useState("publish");
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [manifestFiles, setManifestFiles] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const [deleteMessage, setDeleteMessage] = useState("");

  const reserved = ["manifest.json", "index.json", "config.json"];

  // Load manifest once on mount — shared across Delete and Director's Notes tabs
  useEffect(() => {
    setLibraryLoading(true);
    fetch("/library/manifest.json")
      .then(r => r.json())
      .then(m => setManifestFiles(m.filter(f => !reserved.includes(f))))
      .catch(() => setManifestFiles([]))
      .finally(() => setLibraryLoading(false));
  }, []);

  // Resolve insight cards against the app library passed in as prop
  const slugFromFilename = (filename) => filename.replace(/\.json$/i, "");
  const resolvedInsights = insights.map(insight => ({
    ...insight,
    resolvedFilms: insight.films.map(f => ({
      ...f,
      entry: appLibrary.find(e =>
        slugFromFilename(e._filename || "") === f.slug ||
        slugFromFilename((e.title || "").replace(/[^a-z0-9]/gi, "-").toLowerCase()) === f.slug
      ),
    })),
  }));

  const parseFiles = (rawFiles) => {
    const results = [];
    let pending = rawFiles.length;
    if (!pending) return;
    [...rawFiles].forEach(f => {
      if (!f.name.endsWith(".json")) {
        results.push({ filename: f.name, title: f.name, content: null, status: "error", message: "Not a .json file" });
        if (--pending === 0) setFiles(prev => [...prev, ...results]);
        return;
      }
      const fname = f.name.toLowerCase().replace(/[^a-z0-9\-.]/g, "-");
      if (reserved.includes(fname)) {
        results.push({ filename: fname, title: fname, content: null, status: "error", message: "Reserved filename" });
        if (--pending === 0) setFiles(prev => [...prev, ...results]);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed.title || !parsed.scenes) throw new Error("Invalid");
          results.push({ filename: fname, title: parsed.title, content: e.target.result, status: "ready", message: "" });
        } catch {
          results.push({ filename: fname, title: fname, content: null, status: "error", message: "Invalid ScriptGraph JSON" });
        }
        if (--pending === 0) setFiles(prev => {
          const merged = [...prev];
          results.forEach(r => {
            const idx = merged.findIndex(p => p.filename === r.filename);
            if (idx >= 0) merged[idx] = r; else merged.push(r);
          });
          return merged;
        });
      };
      reader.readAsText(f);
    });
  };

  const handlePublishAll = async () => {
    const ready = files.filter(f => f.status === "ready" && f.content);
    if (!ready.length || !password) return;
    setPublishing(true);
    for (const file of ready) {
      setFiles(prev => prev.map(f => f.filename === file.filename ? { ...f, status: "loading", message: "Publishing..." } : f));
      try {
        const res = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, filename: file.filename, content: file.content }),
        });
        const data = await res.json();
        setFiles(prev => prev.map(f => f.filename === file.filename
          ? { ...f, status: res.ok ? "success" : "error", message: res.ok ? data.message : (data.error || "Failed") }
          : f));
      } catch {
        setFiles(prev => prev.map(f => f.filename === file.filename ? { ...f, status: "error", message: "Network error" } : f));
      }
    }
    setPublishing(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !password) return;
    setDeleteStatus("loading"); setDeleteMessage(`Deleting ${deleteTarget}...`);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, filename: deleteTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeleteStatus("success"); setDeleteMessage(data.message);
        setDeleteTarget(null);
        setManifestFiles(prev => prev.filter(f => f !== deleteTarget));
      } else {
        setDeleteStatus("error"); setDeleteMessage(data.error || "Delete failed");
      }
    } catch {
      setDeleteStatus("error"); setDeleteMessage("Network error — try again");
    }
  };

  const removeFile = (filename) => setFiles(prev => prev.filter(f => f.filename !== filename));
  const readyCount = files.filter(f => f.status === "ready").length;
  const statusColor = (s) => s === "success" ? T.colorSuccess : s === "error" ? T.colorError : s === "loading" ? T.accent : T.textMuted;
  const delMsgColor = deleteStatus === "success" ? T.colorSuccess : deleteStatus === "error" ? T.colorError : T.accent;
  const tabStyle = (active) => ({
    padding: "6px 16px", borderRadius: T.radiusSm, cursor: "pointer", border: "none",
    fontSize: 11, fontFamily: T.fontMono, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase",
    background: active ? T.accent : "transparent", color: active ? T.bgPage : T.textMuted,
  });

  const handleGateSubmit = () => {
    // Probe the publish API — 400 means auth passed but payload invalid (correct password),
    // 401 means wrong password. No side effects either way.
    fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: gateInput, filename: "__gate-check__.json", content: "{}" }),
    })
      .then(r => {
        if (r.status === 400 || r.status === 200) {
          setPassword(gateInput);
          setUnlocked(true);
        } else {
          setGateError(true);
          setTimeout(() => setGateError(false), 1800);
        }
      })
      .catch(() => {
        // Network error — admit and let API calls surface the real error
        setPassword(gateInput);
        setUnlocked(true);
      });
  };

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 340, margin: "0 auto", padding: "120px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontFamily: T.fontMono, letterSpacing: 2, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>ScriptGraph Studio</div>
        <h1 style={{ margin: "0 0 32px", fontSize: 32, fontWeight: 800, fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary, letterSpacing: 2 }}>Library Manager</h1>
        <div style={{ width: "100%" }}>
          <label style={{ display: "block", fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1.5, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={gateInput}
            onChange={e => { setGateInput(e.target.value); setGateError(false); }}
            onKeyDown={e => e.key === "Enter" && gateInput && handleGateSubmit()}
            placeholder="Enter password"
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              background: T.bgPanel,
              border: `1px solid ${gateError ? T.colorError : T.borderMid}`,
              borderRadius: T.radiusSm, padding: "10px 14px",
              color: T.textPrimary, fontFamily: T.fontSans, fontSize: 14, outline: "none",
              transition: "border-color 0.15s",
            }}
          />
          {gateError && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.colorError, fontFamily: T.fontMono, letterSpacing: 1 }}>
              Incorrect password
            </div>
          )}
          <button
            onClick={handleGateSubmit}
            disabled={!gateInput}
            style={{
              width: "100%", marginTop: 12, padding: "12px",
              borderRadius: T.radiusSm,
              background: gateInput ? T.accent : T.borderMid,
              color: T.bgPage, border: "none",
              cursor: gateInput ? "pointer" : "not-allowed",
              fontSize: 13, fontFamily: T.fontMono, fontWeight: 600,
              letterSpacing: 1.5, textTransform: "uppercase",
            }}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "60px 0" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: T.fontMono, letterSpacing: 2, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>ScriptGraph Studio</div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary, letterSpacing: 2 }}>Library Manager</h1>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 28, padding: "4px", background: T.bgPanel, borderRadius: T.radiusSm, width: "fit-content" }}>
        <button style={tabStyle(tab === "publish")} onClick={() => setTab("publish")}>Publish</button>
        <button style={tabStyle(tab === "delete")} onClick={() => setTab("delete")}>Delete</button>
        <button style={tabStyle(tab === "notes")} onClick={() => setTab("notes")}>Director's Notes</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1.5, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Enter publish password"
          style={{ width: "100%", boxSizing: "border-box", background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: T.radiusSm, padding: "10px 14px", color: T.textPrimary, fontFamily: T.fontSans, fontSize: 14, outline: "none" }}
        />
      </div>

      {tab === "publish" && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); parseFiles(e.dataTransfer.files); }}
            onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = ".json"; i.multiple = true; i.onchange = ev => parseFiles(ev.target.files); i.click(); }}
            style={{
              border: `2px dashed ${dragOver ? T.accent : files.length ? T.borderMid : T.borderSubtle}`,
              borderRadius: T.radiusLg, padding: "32px 24px", textAlign: "center",
              cursor: "pointer", marginBottom: 16, transition: "border-color 0.15s",
              background: dragOver ? `${T.accent}08` : T.bgPanel,
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6, color: T.textMuted }}>↓</div>
            <div style={{ fontSize: 13, color: T.textSecondary, fontFamily: T.fontSans }}>Drop JSON files here or click to browse</div>
            <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono, marginTop: 4 }}>Multiple files supported</div>
          </div>

          {files.length > 0 && (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {files.map(f => (
                <div key={f.filename} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.bgPanel, borderRadius: T.radiusSm, border: `1px solid ${T.borderSubtle}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.textPrimary, fontFamily: T.fontSans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                    <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>{f.filename}</div>
                  </div>
                  <div style={{ fontSize: 11, color: statusColor(f.status), fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                    {f.status === "ready" ? "ready" : f.status === "loading" ? "publishing..." : f.status === "success" ? "✓ live" : `✗ ${f.message}`}
                  </div>
                  {(f.status === "ready" || f.status === "error") && (
                    <button onClick={() => removeFile(f.filename)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 14, padding: "0 2px" }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button onClick={handlePublishAll} disabled={!readyCount || !password || publishing}
            style={{
              width: "100%", padding: "12px", borderRadius: T.radiusSm,
              background: (!readyCount || !password || publishing) ? T.borderMid : T.accent,
              color: T.bgPage, border: "none", cursor: (!readyCount || !password || publishing) ? "not-allowed" : "pointer",
              fontSize: 13, fontFamily: T.fontMono, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase",
            }}
          >
            {publishing ? "Publishing..." : readyCount > 1 ? `Publish ${readyCount} Scripts` : "Publish to Library"}
          </button>
          <div style={{ marginTop: 12, fontSize: 11, color: T.textMuted, fontFamily: T.fontSans, textAlign: "center" }}>
            Live on scriptgraph.ai in ~60 seconds
          </div>
        </>
      )}

      {tab === "delete" && (
        <>
          {libraryLoading ? (
            <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontMono, padding: "20px 0" }}>Loading library...</div>
          ) : manifestFiles.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontSans, padding: "20px 0" }}>No scripts in library.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {manifestFiles.map(f => {
                const title = f.replace(".json", "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                const isSelected = deleteTarget === f;
                return (
                  <div key={f} onClick={() => setDeleteTarget(isSelected ? null : f)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: T.radiusSm, cursor: "pointer",
                      border: `1px solid ${isSelected ? T.colorError + "60" : T.borderSubtle}`,
                      background: isSelected ? `${T.colorError}10` : T.bgPanel,
                      transition: "all 0.15s",
                    }}>
                    <div>
                      <div style={{ fontSize: 13, color: isSelected ? T.colorError : T.textPrimary, fontFamily: T.fontSans }}>{title}</div>
                      <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>{f}</div>
                    </div>
                    {isSelected && <div style={{ fontSize: 11, color: T.colorError, fontFamily: T.fontMono }}>selected</div>}
                  </div>
                );
              })}
            </div>
          )}

          {deleteMessage && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: T.radiusSm, background: `${delMsgColor}15`, border: `1px solid ${delMsgColor}40`, fontSize: 13, color: delMsgColor, fontFamily: T.fontSans }}>
              {deleteMessage}
            </div>
          )}

          <button onClick={handleDelete} disabled={!deleteTarget || !password || deleteStatus === "loading"}
            style={{
              width: "100%", padding: "12px", borderRadius: T.radiusSm,
              background: (!deleteTarget || !password || deleteStatus === "loading") ? T.borderMid : T.colorError,
              color: T.bgPage, border: "none", cursor: (!deleteTarget || !password || deleteStatus === "loading") ? "not-allowed" : "pointer",
              fontSize: 13, fontFamily: T.fontMono, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase",
            }}
          >
            {deleteStatus === "loading" ? "Deleting..." : deleteTarget ? `Delete ${deleteTarget}` : "Select a Script to Delete"}
          </button>
          <div style={{ marginTop: 12, fontSize: 11, color: T.textMuted, fontFamily: T.fontSans, textAlign: "center" }}>
            Deletion is permanent and cannot be undone
          </div>
        </>
      )}

      {tab === "notes" && (
        <>
          {resolvedInsights.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontSans, padding: "20px 0" }}>No Director's Notes defined.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {resolvedInsights.map((insight, idx) => {
                const hasData = insight.resolvedFilms.some(f => f.entry);
                return (
                  <div key={idx} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                    padding: "12px 14px", background: T.bgPanel, borderRadius: T.radiusSm,
                    border: `1px solid ${T.borderSubtle}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.textPrimary, lineHeight: 1.2 }}>
                        {insight.title}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {insight.resolvedFilms.map((f, fi) => (
                          <div key={fi} style={{
                            fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase",
                            padding: "2px 6px", borderRadius: T.radiusSm,
                            color: f.color, border: `1px solid ${f.color}38`, background: `${f.color}10`,
                          }}>
                            {f.label}
                          </div>
                        ))}
                        {!hasData && (
                          <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.colorError, letterSpacing: 1, textTransform: "uppercase", padding: "2px 6px" }}>
                            missing library data
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => hasData && onDownloadInsight && onDownloadInsight(insight)}
                      disabled={!hasData}
                      title={hasData ? "Download share image" : "Library data not loaded"}
                      style={{
                        flexShrink: 0, background: "none",
                        border: `1px solid ${hasData ? T.borderMid : T.borderSubtle}`,
                        borderRadius: T.radiusSm, padding: "6px 14px",
                        color: hasData ? T.textSecondary : T.textMuted,
                        fontFamily: T.fontMono, fontSize: 10, letterSpacing: 1.5,
                        textTransform: "uppercase", cursor: hasData ? "pointer" : "not-allowed",
                        transition: "color 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={e => { if (hasData) { e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent + "60"; } }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.textSecondary; e.currentTarget.style.borderColor = T.borderMid; }}
                    >
                      Export
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 11, color: T.textMuted, fontFamily: T.fontSans, textAlign: "center" }}>
            Downloads a 1800×2250 PNG — ready for Instagram
          </div>
        </>
      )}
    </div>
  );
}

function deriveOverallTension(enrichedScenes, totalPages) {
  if (!enrichedScenes?.length) return Array(40).fill(5);

  // Map each scene to position, tension, and length weight
  const scenePts = enrichedScenes.map(s => ({
    pos: s.position ?? ((s.startPage || 1) / totalPages * 100),
    tension: typeof s.tension === "number" ? s.tension : 5,
    weight: Math.max(0.5, s.lengthPages || 1),
  })).sort((a, b) => a.pos - b.pos);

  // For each of 40 sample points, blend weighted average with weighted peak.
  // This preserves the overall shape while allowing genuine high-tension moments
  // to register fully rather than being diluted by surrounding low-tension scenes.
  const raw = [];
  const WINDOW = 5; // tighter window prevents high-tension peaks bleeding into distant scenes
  const PEAK_BLEND = 0.55; // 55% peak, 45% average — tune here if needed

  for (let i = 0; i < 40; i++) {
    const targetPos = (i / 39) * 100;
    const nearby = scenePts.filter(s => Math.abs(s.pos - targetPos) <= WINDOW);

    if (nearby.length === 0) {
      const nearest = scenePts.reduce((a, b) =>
        Math.abs(a.pos - targetPos) < Math.abs(b.pos - targetPos) ? a : b
      );
      raw.push(nearest.tension);
      continue;
    }

    // Weighted average (length × proximity)
    let sumW = 0, sumWT = 0, peakT = 0, peakW = 0;
    for (const s of nearby) {
      const dist = Math.abs(s.pos - targetPos);
      const proximityW = 1 - dist / WINDOW;
      const w = s.weight * proximityW;
      sumW += w;
      sumWT += w * s.tension;
      // Track the heaviest high-tension scene in the window
      if (w * s.tension > peakW * peakT) { peakW = w; peakT = s.tension; }
    }
    const avg = sumW > 0 ? sumWT / sumW : 5;
    // Blend: pull toward peak for high-tension moments, stay near average for low ones
    const blended = avg + PEAK_BLEND * (peakT - avg);
    raw.push(blended);
  }

  // Light smoothing pass — window of 1
  return raw.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(39, i + 1);
    const slice = raw.slice(lo, hi + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return Math.round(Math.min(10, Math.max(0, avg)) * 10) / 10;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILM PERFORMANCE ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchFilmPerf(title, year) {
  const OMDB_KEY = import.meta.env.VITE_OMDB_KEY || "";
  const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || "";

  const omdbUrl = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(title)}${year ? `&y=${year}` : ""}&plot=short`;
  const tmdbSearchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ""}`;

  const results = { boxOffice: null, budget: null, rt: null, mc: null, awards: null, awardNames: [] };

  // Maps TMDb award category names to clean display labels
  const NOTABLE_MAP = [
    { match: /academy award|oscar/i,          label: "Academy Award"       },
    { match: /bafta/i,                         label: "BAFTA"               },
    { match: /independent spirit/i,            label: "Independent Spirit"  },
    { match: /cannes|palme d.or/i,             label: "Cannes"              },
    { match: /golden globe/i,                  label: "Golden Globe"        },
    { match: /screen actors guild|sag award/i, label: "SAG Award"           },
    { match: /sundance/i,                      label: "Sundance"            },
    { match: /south by southwest|sxsw/i,       label: "SXSW"               },
    { match: /tribeca/i,                       label: "Tribeca"             },
    { match: /berlinale|golden bear/i,         label: "Berlinale"           },
    { match: /venice|golden lion/i,            label: "Venice"              },
    { match: /gotham award/i,                  label: "Gotham Award"        },
    { match: /critics choice/i,                label: "Critics Choice"      },
  ];

  // Parse notable award names from OMDb awards string as a baseline
  const parseOmdbAwardNames = (str) => {
    if (!str || str === "N/A") return [];
    const found = [];
    const seen = new Set();
    NOTABLE_MAP.forEach(({ match, label }) => {
      if (match.test(str) && !seen.has(label)) {
        seen.add(label);
        found.push(label);
      }
    });
    return found;
  };

  try {
    const [omdbRes, tmdbRes] = await Promise.allSettled([
      fetch(omdbUrl).then(r => r.json()),
      fetch(tmdbSearchUrl).then(r => r.json()),
    ]);

    // ── OMDb: box office, RT score, Metacritic, awards count + baseline names ──
    if (omdbRes.status === "fulfilled" && omdbRes.value?.Response === "True") {
      const d = omdbRes.value;
      if (d.BoxOffice && d.BoxOffice !== "N/A") results.boxOffice = d.BoxOffice;
      const rt = d.Ratings?.find(r => r.Source === "Rotten Tomatoes");
      if (rt) results.rt = rt.Value;
      if (d.Metascore && d.Metascore !== "N/A") results.mc = d.Metascore;
      const aw = d.Awards || "";
      if (aw && aw !== "N/A") {
        const wins = aw.match(/(\d+)\s+win/i);
        const noms = aw.match(/(\d+)\s+nomination/i);
        if (wins || noms) results.awards = { wins: wins ? parseInt(wins[1]) : 0, noms: noms ? parseInt(noms[1]) : 0 };
        results.awardNames = parseOmdbAwardNames(aw);
      }
    }

    // ── TMDb: budget, fallback revenue, richer award names from awards endpoint ──
    if (tmdbRes.status === "fulfilled" && tmdbRes.value?.results?.length > 0) {
      const movieId = tmdbRes.value.results[0].id;
      try {
        const [detail, awards] = await Promise.allSettled([
          fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_KEY}`).then(r => r.json()),
          fetch(`https://api.themoviedb.org/3/movie/${movieId}/awards?api_key=${TMDB_KEY}`).then(r => r.json()),
        ]);

        if (detail.status === "fulfilled") {
          const d = detail.value;
          if (d.budget && d.budget > 0) {
            const b = d.budget;
            results.budget = b >= 1_000_000 ? `$${(b / 1_000_000).toFixed(0)}M` : `$${(b / 1_000).toFixed(0)}K`;
          }
          if (!results.boxOffice && d.revenue && d.revenue > 0) {
            const r = d.revenue;
            results.boxOffice = r >= 1_000_000 ? `$${(r / 1_000_000).toFixed(1)}M` : `$${(r / 1_000).toFixed(0)}K`;
          }
        }

        // TMDb awards endpoint returns results array with organization names
        if (awards.status === "fulfilled" && awards.value?.results?.length > 0) {
          const seen = new Set();
          const tmdbNames = [];
          awards.value.results.forEach(entry => {
            const org = entry.organization?.name || "";
            NOTABLE_MAP.forEach(({ match, label }) => {
              if (match.test(org) && !seen.has(label)) {
                seen.add(label);
                tmdbNames.push(label);
              }
            });
          });
          // TMDb names are more reliable — replace OMDb baseline if we got any
          if (tmdbNames.length > 0) results.awardNames = tmdbNames;
        }
      } catch {}
    }

    // Cap at 3 notable names
    results.awardNames = results.awardNames.slice(0, 3);

  } catch {}

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function ScriptGraph() {
  // ── URL routing helpers ──────────────────────────────────────────────────────
  function slugFromFilename(filename) {
    return filename.replace(/\.json$/i, "");
  }
  function screenFromPath(path, lib) {
    if (path === "/" || path === "") return { screen: "library", entry: null };
    if (path === "/about") return { screen: "about", entry: null };
    if (path === "/compare") return { screen: "compare", entry: null, compareEntries: null };
    if (path === "/studio") return { screen: "studio", entry: null };
    const compareMatch = path.match(/^\/compare\/([^/]+)\/([^/]+)$/);
    if (compareMatch && lib) {
      const findEntry = slug => lib.find(e =>
        slugFromFilename(e._filename || "") === slug ||
        slugFromFilename((e.title || "").replace(/[^a-z0-9]/gi, "-").toLowerCase()) === slug
      );
      const entryA = findEntry(compareMatch[1]);
      const entryB = findEntry(compareMatch[2]);
      if (entryA && entryB) return { screen: "compare", entry: null, compareEntries: [entryA, entryB] };
    }
    const scriptMatch = path.match(/^\/script\/(.+)$/);
    if (scriptMatch && lib) {
      const slug = scriptMatch[1];
      const entry = lib.find(e => slugFromFilename(e._filename || "") === slug || slugFromFilename((e.title || "").replace(/[^a-z0-9]/gi, "-").toLowerCase()) === slug);
      if (entry) return { screen: "results", entry };
    }
    return { screen: "library", entry: null };
  }
  function pushPath(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
      // Track SPA route change in GA4
      if (typeof gtag === "function") {
        gtag("event", "page_view", { page_path: path, page_title: document.title });
      }
    }
  }

  const [screen, setScreen]               = useState("library");
  const [shareCopied, setShareCopied]     = useState(false);
  const [pdfFile, setPdfFile]             = useState(null);
  const [pdfName, setPdfName]             = useState("");
  const [p1, setP1]                       = useState(null);
  const [fwBeats, setFwBeats]             = useState({});
  const [fwValidation, setFwValidation]   = useState({});
  const [activeFw, setActiveFw]           = useState(null);
  const [tab, setTab]                     = useState("arc");
  const [loading, setLoading]             = useState(null);
  const [loadingLabel, setLoadingLabel]   = useState("");
  const [err, setErr]                     = useState(null);
  const [library, setLibrary]             = useState([]);
  const [compareItems, setCompareItems]   = useState([]);
  const [comparison, setComparison]       = useState(null);
  const [compareView, setCompareView]     = useState("both"); // "both" | "a" | "b"
  const [showComparePages, setShowComparePages] = useState(false);
  const [comparingLoading, setComparingLoading] = useState(false);
  const [normalizedView, setNormalizedView]     = useState(true);
  const [hoveredBeatId, setHoveredBeatId]       = useState(null);
  const [hoveredTpId, setHoveredTpId]           = useState(null);
  const [hoveredMarkerId, setHoveredMarkerId]   = useState(null);
  const [showPages, setShowPages]               = useState(false);
  const [toasts, setToasts]                     = useState([]);
  const [exportJson, setExportJson]             = useState(null); // { json, filename }
  const [shareCard, setShareCard]               = useState(false); // "single" | "compare" | false
  const [libSearch, setLibSearch]               = useState("");
  const [libGenreFilter, setLibGenreFilter]     = useState(null);
  const [uploadMode, setUploadMode]             = useState("script");
  const [docsTab, setDocsTab]                   = useState("user");
  const [outlineText, setOutlineText]           = useState("");
  const [outlineFile, setOutlineFile]           = useState(null);
  const [outlineFileName, setOutlineFileName]   = useState("");
  const [filmPerf, setFilmPerf]                 = useState(null);
  const [filmPerfLoading, setFilmPerfLoading]   = useState(false);
  const outlineRef = useRef();
  const fileRef = useRef();

  // Toast helper — auto-dismisses after 3s
  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const naturalColor = T.accent;
  const fwColor = T.accent;

  // ── Film performance enrichment — fires when a script result loads ──
  useEffect(() => {
    if (screen === "results" && p1 && !p1.isOutline) {
      setFilmPerf(null);
      setFilmPerfLoading(true);
      fetchFilmPerf(p1.title, p1.year || null).then(data => {
        setFilmPerf(data);
        setFilmPerfLoading(false);
      });
    }
  }, [screen, p1]);

  useEffect(() => {
    loadLibrary().then(lib => {
      setLibrary(lib);
      // Handle initial URL on load
      const { screen: s, entry, compareEntries } = screenFromPath(window.location.pathname, lib);
      if (s === "results" && entry) {
        setP1({
          title: entry.title, logline: entry.logline, writer: entry.writer || "",
          totalPages: entry.totalPages, totalScenes: entry.totalScenes,
          protagonist: entry.protagonist, antagonistOrConflict: entry.antagonistOrConflict,
          genre: entry.genre, tone: entry.tone, themes: entry.themes,
          naturalStructure: entry.naturalStructure,
          keyMoments: entry.keyMoments || null,
          overallTension: entry.overallTension,
          scenes: entry.scenes || [],
          isOutline: entry.isOutline || false,
          formatTransition: entry.formatTransition || null,
          _truncated: entry._truncated,
        });
        setFwBeats(entry.frameworkBeats || {});
        setActiveFw(entry.activeFramework || null);
        setTab("arc");
      }
      if (s === "compare" && compareEntries) {
        startCompare(compareEntries);
        return;
      }
      setScreen(s);
    });

    // Handle browser back/forward
    function onPopState() {
      loadLibrary().then(lib => {
        const { screen: s, entry, compareEntries } = screenFromPath(window.location.pathname, lib);
        if (s === "results" && entry) {
          setP1({
            title: entry.title, logline: entry.logline, writer: entry.writer || "",
            totalPages: entry.totalPages, totalScenes: entry.totalScenes,
            protagonist: entry.protagonist, antagonistOrConflict: entry.antagonistOrConflict,
            genre: entry.genre, tone: entry.tone, themes: entry.themes,
            naturalStructure: entry.naturalStructure,
            keyMoments: entry.keyMoments || null,
            overallTension: entry.overallTension,
            scenes: entry.scenes || [],
            isOutline: entry.isOutline || false,
            formatTransition: entry.formatTransition || null,
            _truncated: entry._truncated,
          });
          setFwBeats(entry.frameworkBeats || {});
          setActiveFw(entry.activeFramework || null);
          setTab("arc");
        }
        if (s === "compare" && compareEntries) {
          startCompare(compareEntries);
          return;
        }
        setScreen(s);
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Scroll to top on every screen transition
  useEffect(() => { window.scrollTo(0, 0); }, [screen]);

  // ─── SEO — Dynamic titles, meta descriptions, JSON-LD ───────────────────────
  useEffect(() => {
    const BASE = "ScriptGraph";
    const BASE_DESC = "A curated public library of screenplay structure analysis. Tension arcs, act breaks, and narrative shape — mapped as data for produced films.";
    const BASE_URL = "https://scriptgraph.ai";

    let title = BASE;
    let description = BASE_DESC;
    let jsonLd = null;

    if (screen === "results" && p1) {
      const writer = p1.writer ? ` — Written by ${p1.writer}` : "";
      title = `${p1.title} | Screenplay Structure Analysis | ${BASE}`;
      description = p1.logline
        ? `${p1.logline} Tension arc, act breaks, and structural breakdown of ${p1.title}${writer}.`
        : `Tension arc, act breaks, and structural breakdown of ${p1.title}${writer}. ${BASE_DESC}`;
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Movie",
        "name": p1.title,
        ...(p1.writer ? { "author": { "@type": "Person", "name": p1.writer } } : {}),
        ...(p1.genre  ? { "genre": p1.genre } : {}),
        ...(p1.logline ? { "description": p1.logline } : {}),
        "url": window.location.href,
        "publisher": {
          "@type": "Organization",
          "name": "ScriptGraph",
          "url": BASE_URL,
        },
      };
    } else if (screen === "compare" && compareItems.length === 2) {
      title = `${compareItems[0].title} vs ${compareItems[1].title} | Structure Comparison | ${BASE}`;
      description = `Compare the narrative tension arcs and screenplay structure of ${compareItems[0].title} and ${compareItems[1].title} side by side.`;
    } else if (screen === "about") {
      title = `About | ${BASE}`;
      description = `ScriptGraph is a public library of screenplay structure analysis, built by director Pete Capó. Learn how tension arcs and act breaks are mapped from produced films.`;
    } else if (screen === "compare") {
      title = `Compare Scripts | ${BASE}`;
      description = `Overlay tension arcs and compare the narrative structure of two screenplays side by side.`;
    }

    // Apply title
    document.title = title;

    // Apply / update meta description
    let metaDesc = document.querySelector("meta[name='description']");
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description);

    // Apply / update OG tags
    const ogTags = {
      "og:title":       title,
      "og:description": description,
      "og:url":         window.location.href,
    };
    Object.entries(ogTags).forEach(([prop, content]) => {
      let el = document.querySelector(`meta[property='${prop}']`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", prop);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    });

    // Apply / remove JSON-LD structured data
    const existingLd = document.getElementById("sg-jsonld");
    if (existingLd) existingLd.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.id = "sg-jsonld";
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [screen, p1, compareItems]);
  // ─── end SEO ─────────────────────────────────────────────────────────────────

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { setErr("Please upload a PDF file."); return; }
    setPdfFile(file); setPdfName(file.name.replace(/\.pdf$/i, "")); setErr(null);
    e.target.value = "";
  }

  async function analyze() {
    if (!pdfFile) return;
    setErr(null); setP1(null); setFwBeats({}); setFwValidation({}); setActiveFw(null);
    setScreen("analyzing");
    try {
      // Step 1: Extract text
      setLoading("extract"); setLoadingLabel("LOADING PDF…");
      const arrayBuffer = await pdfFile.arrayBuffer();

      setLoadingLabel("EXTRACTING TEXT & PAGE NUMBERS…");
      const { taggedLines, totalPages, totalChars } = await extractPdfText(arrayBuffer);

      if (totalChars < 500) {
        throw new Error("This appears to be a scanned or image-based PDF. ScriptGraph requires a text-based PDF. Export a digital PDF from WriterDuet, Final Draft, Highland, or Fade In.");
      }

      // Step 2: Build ground-truth scene list from PDF extraction
      setLoadingLabel("BUILDING SCENE MAP FROM PDF…");
      const sceneLengths = computeSceneLengths(taggedLines, totalPages);

      const sceneSkeletons = sceneLengths.map((s, i) => ({
        number: i + 1,
        heading: s.heading,
        startPage: s.startPage,
        endPage: s.endPage,
        lengthPages: s.lengthPages,
        position: parseFloat((s.startPage / totalPages * 100).toFixed(1)),
        lineStart: s.lineStart,
        lineEnd: s.lineEnd,
      }));

      // Step 3: Compress script and build per-scene content map
      setLoadingLabel(`COMPRESSING — ${taggedLines.length} lines → structural skeleton…`);
      const keptLines = compressScript(taggedLines);

      // Prepend raw cover page text (pages 1-2) so writer credit reaches Phase 1A
      // compressScript strips non-screenplay lines (cover page has no scene headings)
      const coverLines = taggedLines
        .filter(l => l.page <= 2 && l.text.trim())
        .map(l => l.text.trim())
        .join("\n");
      const compressedText = `COVER PAGE:\n${coverLines}\n\nSCRIPT:\n${formatForClaude(keptLines)}`;
      const MAX_COMPRESSED_CHARS = 40000;
      const compressedTextCapped = compressedText.length > MAX_COMPRESSED_CHARS
        ? compressedText.slice(0, MAX_COMPRESSED_CHARS) + "\n\n[COMPRESSED TEXT TRUNCATED — see scene index for full structure]"
        : compressedText;
      // Build content map AFTER sceneSkeletons is ready — maps scene number -> compressed content
      const sceneContentMap = buildSceneContentMap(taggedLines, sceneSkeletons);

      // Step 4: Phase 1A — structural analysis only (no scenes)
      setLoading("parsing");
      setLoadingLabel("STRUCTURAL ANALYSIS — READING ARC & TENSION…");
      const p1a = await callClaude(buildPhase1APrompt(compressedTextCapped, totalPages, sceneLengths, sceneSkeletons), 8000);

      // Step 5: Phase 1B — scene enrichment in batches of 50
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < sceneSkeletons.length; i += BATCH_SIZE) {
        batches.push(sceneSkeletons.slice(i, i + BATCH_SIZE));
      }

      const enrichedScenes = [];
      for (let bi = 0; bi < batches.length; bi++) {
        const batchNum = bi + 1;
        const totalBatches = batches.length;
        setLoadingLabel(`ENRICHING SCENES — BATCH ${batchNum}/${totalBatches} (${sceneSkeletons.length} SCENES TOTAL)…`);
        let batchResult = [];
        try {
          const result = await callClaude(buildPhase1BPrompt(batches[bi], totalPages, p1a, sceneContentMap), 4000);
          batchResult = result.scenes || [];
          // If result was truncated, it may have partial scenes — keep what we got
          if (result._truncated) {
            console.warn(`Phase 1B batch ${batchNum} was truncated — using partial results`);
          }
        } catch (batchErr) {
          console.warn(`Phase 1B batch ${batchNum} failed: ${batchErr.message} — using skeleton defaults`);
          // Fall through with empty batchResult — skeletons get default values below
        }

        batches[bi].forEach((skeleton, si) => {
          const enriched = batchResult.find(s => s.number === skeleton.number) || batchResult[si] || {};
          enrichedScenes.push({
            ...skeleton,
            summary: enriched.summary || "(no summary)",
            tension: typeof enriched.tension === "number" ? enriched.tension : 5,
            turningPoint: !!enriched.turningPoint,
            turningPointNote: enriched.turningPointNote || "",
          });
        });
      }

      // Step 6: Resolve act breaks and key moments from scene numbers → ground-truth pages
      // Phase 1A returned sceneNumbers (from our index). We resolve pages/positions
      // from sceneSkeletons — the only reliable page source.

      // Helper: resolve a scene number to ground-truth skeleton data
      const resolveSkeleton = (sceneNumber) => {
        if (!sceneNumber) return null;
        return sceneSkeletons.find(s => s.number === sceneNumber) || null;
      };

      // Resolve act breaks
      const resolvedActBreaks = (p1a.naturalStructure?.actBreaks || []).map(ab => {
        const sk = resolveSkeleton(ab.sceneNumber);
        if (!sk) return null;
        return {
          actNumber: ab.actNumber,
          sceneNumber: ab.sceneNumber,
          page: sk.startPage,
          position: sk.position,
          description: ab.description,
        };
      }).filter(Boolean);

      // Resolve key moments — page + position from skeleton, description from Phase 1B
      const resolvedKeyMoments = {};
      if (p1a.keyMoments) {
        for (const [key, km] of Object.entries(p1a.keyMoments)) {
          if (!km?.sceneNumber) { resolvedKeyMoments[key] = null; continue; }
          const sk = resolveSkeleton(km.sceneNumber);
          if (!sk) { resolvedKeyMoments[key] = null; continue; }
          // Look up Phase 1B summary for this scene (accurate, content-based)
          const enriched = enrichedScenes.find(s => s.number === km.sceneNumber);
          resolvedKeyMoments[key] = {
            sceneNumber: km.sceneNumber,
            page: sk.startPage,
            position: sk.position,
            description: enriched?.summary || km.note || "",
            sceneHeading: sk.heading,
          };
        }
      }

      // Step 7: Phase 1C — validate key moments and act breaks against structural criteria
      setLoadingLabel("VALIDATING STRUCTURAL MOMENTS…");

      // Build candidates: skeleton + full scene content for each
      // Also include enriched summaries of nearby scenes so validator can make informed replacements
      const buildCandidate = (sceneNumber) => {
        const sk = resolveSkeleton(sceneNumber);
        if (!sk) return null;
        // Include summaries of ±3 neighboring scenes so validator can see what surrounds the candidate
        const neighbors = enrichedScenes
          .filter(s => Math.abs(s.number - sk.number) <= 3 && s.number !== sk.number)
          .map(s => `  Scene #${s.number} [p${s.startPage}, ${s.position.toFixed(0)}%]: ${s.summary} (tension: ${s.tension})`)
          .join("\n");
        return {
          sceneNumber: sk.number,
          heading: sk.heading,
          page: sk.startPage,
          position: sk.position,
          content: extractFullSceneContent(sk, taggedLines, 1500),
          neighbors,
        };
      };

      const p1cCandidates = {
        incitingIncident: buildCandidate(p1a.keyMoments?.incitingIncident?.sceneNumber),
        midpoint:         buildCandidate(p1a.keyMoments?.midpoint?.sceneNumber),
        climax:           buildCandidate(p1a.keyMoments?.climax?.sceneNumber),
        actBreaks: (p1a.naturalStructure?.actBreaks || []).map(ab => {
          const c = buildCandidate(ab.sceneNumber);
          return c ? { ...c, actNumber: ab.actNumber } : null;
        }).filter(Boolean),
      };

      let p1c = null;
      try {
        p1c = await callClaude(buildPhase1CPrompt(p1cCandidates, sceneSkeletons, totalPages), 3000);
      } catch (e) {
        console.warn("Phase 1C validation failed, using Phase 1A candidates:", e.message);
      }

      // Apply Phase 1C corrections — replace sceneNumber if validator chose a different scene
      const applyValidation = (originalSceneNumber, validationResult) => {
        if (!validationResult || validationResult.verdict === "none") return originalSceneNumber;
        // Use validator's sceneNumber if it's different and valid
        const corrected = validationResult.sceneNumber;
        if (corrected && corrected !== originalSceneNumber && resolveSkeleton(corrected)) {
          return corrected;
        }
        return originalSceneNumber;
      };

      // Re-resolve key moments with any Phase 1C corrections
      const finalKeyMoments = {};
      const kmKeys = ["incitingIncident", "midpoint", "climax"];
      const p1cKM = p1c || {};
      for (const key of kmKeys) {
        const originalSN = p1a.keyMoments?.[key]?.sceneNumber;
        const validated = p1cKM[key];
        const finalSN = applyValidation(originalSN, validated);
        const sk = resolveSkeleton(finalSN);
        if (!sk) { finalKeyMoments[key] = null; continue; }
        const enriched = enrichedScenes.find(s => s.number === finalSN);
        finalKeyMoments[key] = {
          sceneNumber: finalSN,
          page: sk.startPage,
          position: sk.position,
          description: enriched?.summary || "",
          sceneHeading: sk.heading,
          // Attach validation metadata for display
          validation: validated ? {
            verdict: validated.verdict,
            confidence: validated.confidence,
            ruling: validated.ruling,
          } : null,
        };
      }

      // ── Ruling mismatch detection ────────────────────────────────────────────
      // Correct midpoint sceneNumber if ruling text argues for a different scene.
      // Uses the shared applyMidpointRulingCorrection function so saved entries
      // also benefit at display time via openEntry.
      Object.assign(finalKeyMoments, applyMidpointRulingCorrection(finalKeyMoments, enrichedScenes));

      // ── Position sanity check for midpoint ──────────────────────────────────
      // If the resolved midpoint falls outside 35-72% it almost certainly collided
      // with an act break or has no clean 50% pivot. Find the best turning-point scene in range instead.
      if (finalKeyMoments.midpoint) {
        const mpPos = finalKeyMoments.midpoint.position;
        const actBreakPositions = new Set(
          (p1a.naturalStructure?.actBreaks || []).map(ab => {
            const sk = resolveSkeleton(ab.sceneNumber);
            return sk ? sk.number : null;
          }).filter(Boolean)
        );
        const isActBreakScene = actBreakPositions.has(finalKeyMoments.midpoint.sceneNumber);

        if (isActBreakScene || mpPos < 35 || mpPos > 72) {
          console.warn(`ScriptGraph: midpoint at ${mpPos}% ${isActBreakScene ? "(act break collision)" : "(out of 35-72% window)"} — searching for better candidate`);
          // Find turning-point scenes in the 35-65% window from enriched data
          const candidates40_60 = enrichedScenes
            .filter(s => {
              const inWindow = s.position >= 35 && s.position <= 72;
              const notActBreak = !actBreakPositions.has(s.number);
              const hasTurning = s.turningPoint;
              return inWindow && notActBreak && hasTurning;
            })
            .sort((a, b) => {
              // Prefer scenes closest to 50%
              return Math.abs(a.position - 50) - Math.abs(b.position - 50);
            });

          if (candidates40_60.length > 0) {
            const best = candidates40_60[0];
            const bestSk = resolveSkeleton(best.number);
            if (bestSk) {
              console.warn(`ScriptGraph: midpoint corrected to scene #${best.number} at ${best.position}% — ${best.heading}`);
              finalKeyMoments.midpoint = {
                ...finalKeyMoments.midpoint,
                sceneNumber: best.number,
                page: bestSk.startPage,
                position: bestSk.position,
                description: best.summary || "",
                sceneHeading: bestSk.heading,
                validation: {
                  verdict: "replaced",
                  confidence: "medium",
                  ruling: `Position sanity check: original midpoint was at ${mpPos}%${isActBreakScene ? " and was also an act break scene" : ""}. Corrected to nearest turning-point scene in 35-72% window.`,
                },
              };
            }
          }
        }
      }

      // Re-resolve act breaks with any Phase 1C corrections
      const finalActBreaks = (p1a.naturalStructure?.actBreaks || []).map((ab, i) => {
        const validated = p1c?.actBreaks?.[i];
        const finalSN = applyValidation(ab.sceneNumber, validated);
        const sk = resolveSkeleton(finalSN);
        if (!sk) return null;
        return {
          actNumber: ab.actNumber,
          sceneNumber: finalSN,
          page: sk.startPage,
          position: sk.position,
          description: ab.description,
          validation: validated ? {
            verdict: validated.verdict,
            confidence: validated.confidence,
            ruling: validated.ruling,
          } : null,
        };
      }).filter(Boolean);

      // Step 8: Merge into complete p1 object
      // overallTension derived from Phase 1B per-scene scores — more reliable than Phase 1A holistic scoring
      const derivedTension = deriveOverallTension(enrichedScenes, totalPages);
      const parsed = {
        ...p1a,
        naturalStructure: {
          ...p1a.naturalStructure,
          actBreaks: finalActBreaks,
        },
        keyMoments: finalKeyMoments,
        totalScenes: sceneSkeletons.length,
        overallTension: derivedTension,
        scenes: enrichedScenes,
      };

      if (parsed._truncated) {
        console.warn("ScriptGraph: Phase 1A response was truncated — some fields may be incomplete.");
      }
      setP1(parsed);
      setScreen("results");
      setTab("arc");

      // Auto-save to library
      try {
        const autoEntry = {
          id: String(Date.now()), savedAt: Date.now(),
          title: parsed.title, logline: parsed.logline, writer: parsed.writer || "",
          totalPages: parsed.totalPages, totalScenes: parsed.totalScenes,
          protagonist: parsed.protagonist, antagonistOrConflict: parsed.antagonistOrConflict,
          genre: parsed.genre, tone: parsed.tone, themes: parsed.themes,
          avgSceneLength: parsed.scenes?.length
            ? (parsed.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / parsed.scenes.length).toFixed(1)
            : "?",
          naturalStructure: parsed.naturalStructure,
          keyMoments: parsed.keyMoments || null,
          overallTension: parsed.overallTension,
          scenes: parsed.scenes,
          frameworkBeats: {},
          activeFramework: null,
          _truncated: parsed._truncated,
        };
        const existingLib = await loadLibrary();
        // Replace if same title already exists, otherwise prepend
        const updatedLib = [autoEntry, ...existingLib.filter(e => e.title !== autoEntry.title)];
        await persistLibrary(updatedLib);
        setLibrary(updatedLib);
        showToast(`"${autoEntry.title}" saved to library`);
      } catch (saveErr) {
        console.warn("Auto-save failed:", saveErr.message);
      }
    } catch (e) {
      setErr(e.message);
      setScreen("upload");
    } finally { setLoading(null); setLoadingLabel(""); }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OUTLINE ANALYSIS — parallel intake path, same output schema as analyze()
  // ─────────────────────────────────────────────────────────────────────────────
  async function analyzeOutline() {
    const text = outlineText.trim();
    if (!text) return;
    setErr(null); setP1(null); setFwBeats({}); setFwValidation({}); setActiveFw(null);
    setScreen("analyzing");

    try {
      // Step 1: Parse scenes from outline text
      setLoading("extract"); setLoadingLabel("READING OUTLINE…");

      // Split into scenes: try numbered/headed scenes first, fall back to paragraphs
      let rawScenes = [];
      const headedSplit = text.split(/\n(?=(?:INT\.|EXT\.|INT\/EXT\.|SCENE\s+\d+|\d+\.\s+[A-Z]|ACT\s+[IVX\d]+))/i);
      if (headedSplit.length > 3) {
        rawScenes = headedSplit.map(s => s.trim()).filter(s => s.length > 20);
      } else {
        // Paragraph-based: split on double newlines
        rawScenes = text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 30);
      }

      // Cap at 120 scenes for very detailed outlines
      if (rawScenes.length > 120) rawScenes = rawScenes.slice(0, 120);
      const totalScenes = rawScenes.length;

      // Detect format transition (finished screenplay → outline/description)
      const formatHint = detectFormatTransition(rawScenes);
      if (formatHint.transitionScene) {
        console.log(`ScriptGraph: Format transition detected at scene ${formatHint.transitionScene}/${totalScenes} (${formatHint.transitionPct}%) — confidence: ${formatHint.confidence}`);
      }

      // Build scene skeletons with position derived from index
      const sceneSkeletons = rawScenes.map((raw, i) => {
        const num = i + 1;
        const position = parseFloat(((num / totalScenes) * 100).toFixed(1));
        // Extract heading: first line, or first 80 chars
        const firstLine = raw.split("\n")[0].trim().slice(0, 80);
        return {
          number: num,
          heading: firstLine,
          startPage: num,    // use scene number as proxy for page
          endPage: num,
          lengthPages: 1,    // normalized — all scenes equal weight
          position,
          rawText: raw.slice(0, 800),
          isOutline: true,
        };
      });

      // Step 2: Phase OA — structural analysis
      setLoading("parsing"); setLoadingLabel("ANALYZING STRUCTURE…");
      const oa = await callClaude(buildOutlinePhaseOAPrompt(text, totalScenes, formatHint), 6000);

      // Step 3: Phase OB — scene enrichment in batches of 50
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < sceneSkeletons.length; i += BATCH_SIZE) {
        batches.push(sceneSkeletons.slice(i, i + BATCH_SIZE));
      }

      const enrichedScenes = [];
      for (let bi = 0; bi < batches.length; bi++) {
        setLoadingLabel(`ENRICHING SCENES — BATCH ${bi+1}/${batches.length}…`);
        let batchResult = [];
        try {
          const result = await callClaude(buildOutlinePhaseOBPrompt(batches[bi], totalScenes, oa, formatHint), 4000);
          batchResult = result.scenes || [];
        } catch (batchErr) {
          console.warn("Outline Phase OB batch failed:", batchErr.message);
        }
        batches[bi].forEach((skeleton, si) => {
          const enriched = batchResult.find(s => s.number === skeleton.number) || batchResult[si] || {};
          enrichedScenes.push({
            ...skeleton,
            summary: enriched.summary || "(no summary)",
            tension: typeof enriched.tension === "number" ? enriched.tension : 5,
            turningPoint: !!enriched.turningPoint,
            turningPointNote: enriched.turningPointNote || "",
          });
        });
      }

      // Step 4: Resolve key moments from scene numbers → position
      const resolveOutlineKM = (sceneNumber) => {
        if (!sceneNumber) return null;
        const sk = sceneSkeletons.find(s => s.number === sceneNumber);
        if (!sk) return null;
        const enriched = enrichedScenes.find(s => s.number === sceneNumber);
        return {
          sceneNumber,
          page: sceneNumber,
          position: sk.position,
          description: enriched?.summary || "",
          sceneHeading: sk.heading,
          validation: null,
        };
      };

      const finalKeyMoments = {
        incitingIncident: resolveOutlineKM(oa.keyMoments?.incitingIncident?.sceneNumber),
        midpoint:         resolveOutlineKM(oa.keyMoments?.midpoint?.sceneNumber),
        climax:           resolveOutlineKM(oa.keyMoments?.climax?.sceneNumber),
      };

      // Step 5: Resolve act breaks
      const finalActBreaks = (oa.naturalStructure?.actBreaks || []).map(ab => {
        const sk = sceneSkeletons.find(s => s.number === ab.sceneNumber);
        if (!sk) return null;
        return {
          actNumber: ab.actNumber,
          sceneNumber: ab.sceneNumber,
          page: ab.sceneNumber,
          position: sk.position,
          description: ab.description,
          validation: null,
        };
      }).filter(Boolean);

      // Step 6: Apply midpoint sanity check (same logic as script pipeline)
      if (finalKeyMoments.midpoint) {
        const mpPos = finalKeyMoments.midpoint.position;
        const actBreakNums = new Set(finalActBreaks.map(ab => ab.sceneNumber));
        const isActBreak = actBreakNums.has(finalKeyMoments.midpoint.sceneNumber);
        if (isActBreak || mpPos < 35 || mpPos > 72) {
          const candidates = enrichedScenes.filter(s =>
            s.position >= 35 && s.position <= 72 &&
            !actBreakNums.has(s.number) &&
            s.turningPoint
          ).sort((a, b) => Math.abs(a.position - 50) - Math.abs(b.position - 50));
          if (candidates.length > 0) {
            const best = candidates[0];
            const bestSk = sceneSkeletons.find(s => s.number === best.number);
            if (bestSk) {
              finalKeyMoments.midpoint = {
                sceneNumber: best.number, page: best.number,
                position: bestSk.position, description: best.summary,
                sceneHeading: bestSk.heading,
                validation: { verdict: "replaced", confidence: "medium",
                  ruling: `Position sanity check: original midpoint at ${mpPos}%. Corrected to nearest turning-point scene in 35-72% window.` },
              };
            }
          }
        }
      }

      // Step 7: Assemble final parsed object — same schema as script pipeline
      // overallTension derived from Phase OB per-scene scores, same as script path
      const derivedTension = deriveOverallTension(enrichedScenes, totalScenes);
      const parsed = {
        ...oa,
        isOutline: true,
        totalPages: totalScenes,
        totalScenes,
        formatTransition: formatHint.transitionScene ? formatHint : null,
        naturalStructure: {
          ...oa.naturalStructure,
          actBreaks: finalActBreaks,
        },
        keyMoments: finalKeyMoments,
        overallTension: derivedTension,
        scenes: enrichedScenes,
      };

      setP1(parsed);
      setScreen("results");
      setTab("arc");

      // Auto-save
      try {
        const autoEntry = {
          id: String(Date.now()), savedAt: Date.now(),
          isOutline: true,
          formatTransition: parsed.formatTransition || null,
          title: parsed.title, logline: parsed.logline, writer: parsed.writer || "",
          totalPages: totalScenes, totalScenes,
          protagonist: parsed.protagonist, antagonistOrConflict: parsed.antagonistOrConflict,
          genre: parsed.genre, tone: parsed.tone, themes: parsed.themes,
          avgSceneLength: "—",
          naturalStructure: parsed.naturalStructure,
          keyMoments: parsed.keyMoments || null,
          overallTension: parsed.overallTension,
          scenes: parsed.scenes,
          frameworkBeats: {}, activeFramework: null,
          _truncated: parsed._truncated,
        };
        const existingLib = await loadLibrary();
        const updatedLib = [autoEntry, ...existingLib.filter(e => e.title !== autoEntry.title)];
        await persistLibrary(updatedLib);
        setLibrary(updatedLib);
        showToast(`"${autoEntry.title}" (outline) saved to library`);
      } catch (saveErr) {
        console.warn("Outline auto-save failed:", saveErr.message);
      }

    } catch (e) {
      setErr(e.message);
      setScreen("upload");
    } finally { setLoading(null); setLoadingLabel(""); }
  }

  async function switchFramework(fwId) {
    if (fwId === activeFw) { setActiveFw(null); setTab("structure"); return; }
    setActiveFw(fwId); setTab("arc");
    if (fwBeats[fwId]) return; // cached
    setLoading("mapping"); setLoadingLabel(`Mapping beats to ${FRAMEWORKS.find(f => f.id === fwId)?.label}…`);
    try {
      const result = await callClaude(buildPhase2Prompt(p1, fwId), 3500);
      const beats = result.beats || [];

      // Validate beat distribution
      const validation = validateBeats(beats, fwId);

      setFwBeats(prev => ({ ...prev, [fwId]: beats }));
      setFwValidation(prev => ({ ...prev, [fwId]: validation }));
    } catch (e) { setErr(`Framework mapping failed: ${e.message}`); }
    finally { setLoading(null); setLoadingLabel(""); }
  }

  async function saveScript() {
    if (!p1) return;
    const avgSceneLength = p1.scenes?.length
      ? (p1.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / p1.scenes.length).toFixed(1)
      : "?";
    const entry = {
      id: String(Date.now()), savedAt: Date.now(),
      title: p1.title, logline: p1.logline,
      totalPages: p1.totalPages, totalScenes: p1.totalScenes,
      protagonist: p1.protagonist, antagonistOrConflict: p1.antagonistOrConflict,
      genre: p1.genre, tone: p1.tone, themes: p1.themes,
      avgSceneLength,
      naturalStructure: p1.naturalStructure,
      keyMoments: p1.keyMoments || null,
      overallTension: p1.overallTension,
      scenes: p1.scenes,
      frameworkBeats: fwBeats,
      activeFramework: activeFw,
      _truncated: p1._truncated,
    };
    const updated = [entry, ...library.filter(e => e.id !== entry.id)];
    setLibrary(updated); await persistLibrary(updated);
    showToast(`"${entry.title}" saved to library`);
  }

  function openEntry(entry) {
    const slug = slugFromFilename(entry._filename || (entry.title || "script").replace(/[^a-z0-9]/gi, "-").toLowerCase() + ".json");
    const scenes = entry.scenes || [];
    const correctedKeyMoments = applyMidpointRulingCorrection(entry.keyMoments, scenes);
    setP1({
      title: entry.title, logline: entry.logline, writer: entry.writer || "",
      totalPages: entry.totalPages, totalScenes: entry.totalScenes,
      protagonist: entry.protagonist, antagonistOrConflict: entry.antagonistOrConflict,
      genre: entry.genre, tone: entry.tone, themes: entry.themes,
      naturalStructure: entry.naturalStructure,
      keyMoments: correctedKeyMoments || null,
      overallTension: entry.overallTension,
      scenes,
      isOutline: entry.isOutline || false,
      formatTransition: entry.formatTransition || null,
      _truncated: entry._truncated,
    });
    setFwBeats(entry.frameworkBeats || {});
    setActiveFw(entry.activeFramework || null);
    setTab("arc");
    pushPath(`/script/${slug}`);
    setScreen("results");
  }

  async function deleteEntry(id) {
    const updated = library.filter(e => e.id !== id);
    setLibrary(updated); await persistLibrary(updated);
    setCompareItems(prev => prev.filter(e => e.id !== id));
  }

  function toggleCompare(entry) {
    setCompareItems(prev => {
      if (prev.find(e => e.id === entry.id)) return prev.filter(e => e.id !== entry.id);
      if (prev.length >= 2) return [prev[1], entry];
      return [...prev, entry];
    });
  }

  async function startCompare(itemsOverride) {
    const items = itemsOverride || compareItems;
    if (items.length < 2) return;
    if (itemsOverride) setCompareItems(itemsOverride);
    const slugA = slugFromFilename(items[0]._filename || (items[0].title || "script").replace(/[^a-z0-9]/gi, "-").toLowerCase() + ".json");
    const slugB = slugFromFilename(items[1]._filename || (items[1].title || "script").replace(/[^a-z0-9]/gi, "-").toLowerCase() + ".json");
    pushPath(`/compare/${slugA}/${slugB}`);
    setScreen("compare"); setComparison(null); setComparingLoading(true);
    try {
      const result = await callClaude(buildComparisonPrompt(items[0], items[1]), 4000);

      // If truncated and key prose fields are empty, try to extract them from raw partial JSON
      let comparisonText = result.comparison || "";
      let headlineText   = result.headline   || "";
      if (result._truncated && !comparisonText) {
        // The "comparison" field value may have been cut mid-string — extract what we got
        const rawMatch = JSON.stringify(result).match(/"comparison":"([\s\S]*?)(?:","[a-z]|$)/);
        if (rawMatch?.[1]) comparisonText = rawMatch[1].replace(/\n/g, "\n").replace(/\"/g, '"') + "…";
      }
      if (result._truncated && !headlineText) {
        const rawMatch = JSON.stringify(result).match(/"headline":"([\s\S]*?)(?:","[a-z]|$)/);
        if (rawMatch?.[1]) headlineText = rawMatch[1].replace(/\"/g, '"') + "…";
      }

      const safeResult = {
        headline:         headlineText,
        comparison:       comparisonText,
        scriptAStrengths: result.scriptAStrengths || [],
        scriptBStrengths: result.scriptBStrengths || [],
        keyDifferences:   result.keyDifferences  || [],
        developmentNotes: result.developmentNotes || [],
        _truncated:       result._truncated || false,
      };
      setComparison(safeResult);
    } catch (e) { setErr(`Comparison failed: ${e.message}`); }
    finally { setComparingLoading(false); }
  }

  function getTabs() {
    return [
      { id: "structure", label: "Analysis" },
      { id: "arc",       label: "Tension Arc" },
      { id: "pacing",    label: "Scene Pacing" },
      { id: "scenes",    label: `All Scenes (${p1?.scenes?.length || 0})` },
    ];
  }

  const avgSceneLen = p1?.scenes?.length
    ? (p1.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / p1.scenes.length).toFixed(1)
    : null;

  const rawTension = p1?.overallTension || [];
  const smoothedTension = smoothTension(rawTension, 3);
  const rhythmMarkers = p1
    ? computeStructuralRhythm(p1.overallTension, p1.naturalStructure?.actBreaks, p1.scenes, p1.keyMoments)
    : [];


  // ── Share Card Generator ────────────────────────────────────────────────────
  // ── Share card helpers — shared by both single and compare generators ────────
  const _sgSmooth = (t) => t.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(t.length - 1, i + 1);
    const sl = t.slice(lo, hi + 1);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });

  // Shared layout constants — identical zones for both cards
  // Centered: equal outer pad both sides. Y-axis labels (16px left of plotX) sit within the pad.
  // 4:5 aspect ratio: 1800×2250. Chart ~43% of canvas — title/stats get more presence.
  const _sgOuterPad  = 132;  // (1800 - 1536) / 2 — same plotW as before, now centered
  const _sgPlotX     = _sgOuterPad;
  const _sgW         = 1800;
  const _sgH         = 2250;
  const _sgPlotW     = _sgW - _sgOuterPad * 2;
  const _sgHeaderH  = 700;  // expanded: 82px gap between body text and chart top
  const _sgPlotY    = _sgHeaderH + 24;
  const _sgXAxisH   = 64;
  const _sgStatH    = 400;  // stat numbers get more vertical room
  const _sgBotPad   = 100;  // reduced to offset header increase — chart stays 962px
  const _sgPlotH    = _sgH - _sgPlotY - _sgXAxisH - _sgStatH - _sgBotPad;
  const _sgInfoY    = _sgPlotY + _sgPlotH + _sgXAxisH + 18;
  const _sgInfoH    = _sgH - _sgInfoY - _sgBotPad;

  // Font sizes
  const _sgFStat    = 96;
  const _sgFLabel   = 44;
  const _sgFAxis    = 34;
  const _sgFActLbl  = 32;
  const _sgFWmark   = 44;

  const _sgChartCore = (ten, abs, mid, col, gid) => {
    const px = _sgPlotX, py = _sgPlotY, pw = _sgPlotW, ph = _sgPlotH;
    const ac = T.accent, bgPan = T.bgPanel;
    const ts = T.textSecondary, bMid = T.borderMid;
    const fontM = T.fontMono, fontS = T.fontSans, fontD = T.fontDisplay;
    const s = _sgSmooth(ten), iw = pw, ih = ph;
    const pts = s.map((t, i) => ({ x: px + (i / (s.length - 1)) * iw, y: py + ih - (t / 10) * ih }));
    const ln = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const ar = `${ln} L${(px + iw).toFixed(1)},${(py + ih).toFixed(1)} L${px},${(py + ih).toFixed(1)} Z`;
    const gr = [2, 4, 6, 8, 10].map(v => {
      const gy = (py + ih - (v / 10) * ih).toFixed(1);
      return `<line x1="${px}" y1="${gy}" x2="${(px + iw).toFixed(1)}" y2="${gy}" stroke="#ffffff09" stroke-width="2"/>`;
    }).join("");
    const bf = ["#c8a0600d", "#ffffff07", "#c8a06009"];
    const bks = [0, ...abs.map(b => b.position), 100];
    let ba = "";
    bks.slice(0, -1).forEach((st, i) => {
      const en = bks[i + 1], x1 = (px + (st / 100) * iw).toFixed(1), x2 = (px + (en / 100) * iw).toFixed(1);
      ba += `<rect x="${x1}" y="${py}" width="${(+x2 - +x1).toFixed(1)}" height="${ih}" fill="${bf[i % 3]}"/>`;
      ba += `<text x="${((+x1 + (+x2)) / 2).toFixed(1)}" y="${(py + 38).toFixed(1)}" text-anchor="middle" font-family="${fontM}" font-size="${_sgFActLbl}" fill="${ts}" letter-spacing="5">ACT ${i + 1}</text>`;
    });
    abs.forEach(ab => {
      const bx = (px + (ab.position / 100) * iw).toFixed(1);
      ba += `<line x1="${bx}" y1="${py}" x2="${bx}" y2="${(py + ih).toFixed(1)}" stroke="${ac}" stroke-width="2.5" opacity="0.35"/>`;
      ba += `<polygon points="${bx},${(py - 2).toFixed(1)} ${(+bx + 12).toFixed(1)},${(py + 22).toFixed(1)} ${bx},${(py + 46).toFixed(1)} ${(+bx - 12).toFixed(1)},${(py + 22).toFixed(1)}" fill="${bgPan}" stroke="${ac}" stroke-width="3.5" opacity="0.85"/>`;
    });
    if (mid != null) {
      const mx = (px + (mid / 100) * iw).toFixed(1);
      ba += `<line x1="${mx}" y1="${py}" x2="${mx}" y2="${(py + ih).toFixed(1)}" stroke="#e0c890" stroke-width="2" stroke-dasharray="10,7" opacity="0.3"/>`;
    }
    const wx = (px + iw - 12).toFixed(1), wy = (py + ih - 26).toFixed(1);
    return `<defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${col}" stop-opacity="0.03"/>
    </linearGradient>
    <clipPath id="cl${gid}"><rect x="${px}" y="${py - 4}" width="${iw}" height="${ih + 8}"/></clipPath>
  </defs>
  ${gr}${ba}
  <path d="${ar}" fill="url(#${gid})" clip-path="url(#cl${gid})"/>
  <path d="${ln}" fill="none" stroke="${col}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#cl${gid})"/>
  <text x="${wx}" y="${wy}" text-anchor="end" font-family="${fontD}" font-size="${_sgFWmark}" fill="${ac}" opacity="0.35"><tspan font-weight="200">SCRIPT</tspan><tspan font-weight="700">GRAPH</tspan><tspan font-weight="200">.ai</tspan></text>`;
  };

  const _sgYAxis = () => {
    const px = _sgPlotX, py = _sgPlotY, iw = _sgPlotW, ih = _sgPlotH;
    const ts = T.textSecondary, bMid = T.borderMid;
    const fontM = T.fontMono, fontS = T.fontSans;
    const lx = (px - 16).toFixed(1), my = (py + ih / 2).toFixed(1);
    let o = `<line x1="${px}" y1="${py}" x2="${px}" y2="${(py + ih).toFixed(1)}" stroke="${bMid}" stroke-width="2"/>`;
    o += `<line x1="${px}" y1="${(py + ih).toFixed(1)}" x2="${(px + iw).toFixed(1)}" y2="${(py + ih).toFixed(1)}" stroke="${bMid}" stroke-width="2"/>`;
    o += `<text x="${lx}" y="${(py + 12).toFixed(1)}" text-anchor="end" font-family="${fontM}" font-size="${_sgFAxis}" fill="${ts}">10</text>`;
    o += `<text x="${lx}" y="${(py + ih + 12).toFixed(1)}" text-anchor="end" font-family="${fontM}" font-size="${_sgFAxis}" fill="${ts}">0</text>`;
    o += `<text x="${lx}" y="${my}" text-anchor="middle" font-family="${fontM}" font-size="${Math.round(_sgFAxis * 0.82)}" fill="${ts}" letter-spacing="4" transform="rotate(-90,${lx},${my})">TENSION</text>`;
    [0, 25, 50, 75, 100].forEach(p => {
      const bx = (px + (p / 100) * iw).toFixed(1);
      o += `<line x1="${bx}" y1="${(py + ih).toFixed(1)}" x2="${bx}" y2="${(py + ih + 12).toFixed(1)}" stroke="${bMid}" stroke-width="2"/>`;
      o += `<text x="${bx}" y="${(py + ih + 52).toFixed(1)}" text-anchor="middle" font-family="${fontS}" font-size="${_sgFAxis}" fill="${ts}">${p}%</text>`;
    });
    return o;
  };

  const _sgStatStrip = (stats, colW) => {
    const fontD = T.fontDisplay, fontM = T.fontMono;
    const bMid = T.borderMid, bStr = T.borderStrong;
    let ss = "";
    stats.forEach((st, i) => {
      const sx = _sgPlotX + i * colW;
      if (i === 2) ss += `<line x1="${sx}" y1="${_sgInfoY + 8}" x2="${sx}" y2="${(_sgInfoY + _sgInfoH * 0.9).toFixed(0)}" stroke="${bStr}" stroke-width="3"/>`;
      else if (i > 0) ss += `<line x1="${sx}" y1="${_sgInfoY + 14}" x2="${sx}" y2="${(_sgInfoY + _sgInfoH * 0.88).toFixed(0)}" stroke="${bMid}" stroke-width="2"/>`;
      ss += `<text x="${(sx + colW / 2).toFixed(0)}" y="${(_sgInfoY + _sgInfoH * 0.50).toFixed(0)}" text-anchor="middle" font-family="${fontD}" font-weight="700" font-size="${_sgFStat}" fill="${st.c}">${st.v}</text>`;
      ss += `<text x="${(sx + colW / 2).toFixed(0)}" y="${(_sgInfoY + _sgInfoH * 0.82).toFixed(0)}" text-anchor="middle" font-family="${fontM}" font-size="${_sgFLabel}" fill="${st.tc}" letter-spacing="2" opacity="${st.op || 1}">${st.l}</text>`;
    });
    return ss;
  };

  // Shared glyph renderer — ScriptGraph mark scaled to match title font size.
  // Alignment: glyphTop = titleY - fontSize * 0.816
  // This aligns the glyph's visual content top with the title's cap height.
  // (Derived from glyph viewBox 0 0 58 52, content starting at y=5 → 9.6% top padding;
  //  Barlow Condensed 800 cap height ≈ 72% of em: 1 - 0.096 - 0.72 = 0.184 adjustment)
  const _sgGlyph = (x, y, size) => {
    const s = (size / 52).toFixed(4);
    return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s})">
    <path d="M22 5 L14 5 L14 47 L22 47" stroke="#c8a060" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M36 5 L44 5 L44 47 L36 47" stroke="#c8a060" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <line x1="19" y1="16" x2="34" y2="16" stroke="#3a3a42" stroke-width="1.0" stroke-linecap="round"/>
    <line x1="19" y1="22" x2="38" y2="22" stroke="#3a3a42" stroke-width="1.0" stroke-linecap="round"/>
    <line x1="19" y1="28" x2="31" y2="28" stroke="#3a3a42" stroke-width="1.0" stroke-linecap="round"/>
    <line x1="19" y1="34" x2="36" y2="34" stroke="#3a3a42" stroke-width="1.0" stroke-linecap="round"/>
    <path d="M19 38 Q24 30 28 24 Q32 17 39 11" stroke="#c8a060" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <circle cx="19" cy="38" r="2.4" fill="#c8a060"/>
    <circle cx="39" cy="11" r="2.4" fill="#c8a060"/>
  </g>`;
  };
  const generateShareCardSVG = (entry) => {
    const W = _sgW, H = _sgH;
    const ac = T.accent, bgP = T.bgPage;
    const textP = T.textPrimary, textS = T.textSecondary;
    const bSub = T.borderSubtle;
    const fontD = T.fontDisplay, fontS = T.fontSans;
    const plotX = _sgPlotX, plotW = _sgPlotW;

    // Dynamic title font — shrinks to fit long titles on one line.
    // Glyph width at fTitle height = fTitle * (58/52). Title indented by glyphW + gap.
    const glyphGap  = 32;
    const titleLen  = (entry.title || "").length;
    // Calculate title font using reduced width (plotW minus glyph space)
    const glyphWEst = Math.round(130 * 58 / 52); // ~145px at max font — use as max indent
    const fTitle    = Math.min(130, Math.max(60, Math.floor((plotW - glyphWEst - glyphGap) / (titleLen * 0.52))));
    const glyphW    = Math.round(fTitle * 58 / 52); // actual glyph width at fTitle
    const fWriter   = 66;
    const titleIndX = plotX + glyphW + glyphGap;
    // Title baseline; glyph aligned so visual top matches title cap height
    const titleY    = 80 + fTitle;
    const glyphTop  = titleY - fTitle * 0.816; // aligns glyph visual top to cap height
    const writerLineH = fWriter + 16;

    const esc = s => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // Wrap writer name at ~30 chars on word boundary
    const wrapWriter = (name, maxChars = 30) => {
      if (!name || name.length <= maxChars) return [name || ""];
      const mid = name.lastIndexOf(" ", maxChars);
      if (mid < 1) return [name];
      return [name.slice(0, mid), name.slice(mid + 1)];
    };
    const writerLines = wrapWriter(entry.writer || "");
    const writerStartY = titleY + 24 + fWriter;

    const actBreaks = entry.naturalStructure?.actBreaks || [];
    const midPos    = entry.keyMoments?.midpoint?.position ?? null;

    const peakT = (() => {
      const raw = entry.overallTension || [];
      const sm = _sgSmooth(raw);
      return sm.length ? Math.max(...sm).toFixed(1) : "—";
    })();
    const avgT = (() => {
      const raw = entry.overallTension || [];
      const sm = _sgSmooth(raw);
      return sm.length ? (sm.reduce((a, b) => a + b, 0) / sm.length).toFixed(1) : "—";
    })();
    const avgScLen = entry.scenes?.length
      ? (entry.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / entry.scenes.length).toFixed(1)
      : entry.avgSceneLength || "—";

    const sw = Math.round(plotW / 4);
    const stats = [
      { v: `${entry.totalPages}p`, l: "pages",       c: textP, tc: textS },
      { v: `${avgScLen}pp`,        l: "avg scene",    c: textP, tc: textS },
      { v: avgT,                   l: "avg tension",  c: textP, tc: textS },
      { v: peakT,                  l: "peak tension", c: textP, tc: textS },
    ];

    const writerSVG = writerLines.map((line, i) =>
      `<text x="${titleIndX}" y="${writerStartY + i * writerLineH}" font-family="${fontS}" font-weight="300" font-size="${fWriter}" fill="${textS}">${esc(line)}</text>`
    ).join("\n  ");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bgP}"/>
  <rect x="${plotX}" y="0" width="${plotW}" height="8" fill="${ac}" opacity="0.75"/>
  ${_sgGlyph(plotX, glyphTop, fTitle)}
  <text x="${titleIndX}" y="${titleY}" font-family="${fontD}" font-weight="800" font-size="${fTitle}" fill="${textP}" letter-spacing="1">${esc((entry.title || "").toUpperCase())}</text>
  ${writerSVG}
  <line x1="${plotX}" y1="${_sgHeaderH}" x2="${plotX + plotW}" y2="${_sgHeaderH}" stroke="${bSub}" stroke-width="1.5"/>
  <rect x="${plotX}" y="${_sgPlotY}" width="${plotW}" height="${_sgPlotH}" fill="#ffffff03" rx="6"/>
  ${_sgChartCore(entry.overallTension || [], actBreaks, midPos, ac, "sg")}
  ${_sgYAxis()}
  <line x1="${plotX}" y1="${_sgInfoY - 10}" x2="${plotX + plotW}" y2="${_sgInfoY - 10}" stroke="${bSub}" stroke-width="1.5"/>
  ${_sgStatStrip(stats, sw)}
</svg>`;
  };

  // ── Compare Card Generator ──────────────────────────────────────────────────
  const generateCompareCardSVG = (s1, s2) => {
    const W = _sgW, H = _sgH;
    const color1 = T.fwColors.three_act;
    const color2 = T.fwColors.story_circle;
    const bgP = T.bgPage;
    const bSub = T.borderSubtle, bMid = T.borderMid;
    const fontD = T.fontDisplay, fontS = T.fontSans;
    const plotX = _sgPlotX, plotW = _sgPlotW;
    const plotMidX = plotX + plotW / 2;

    const esc = str => (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // Dynamic title font — fits longest title in half the plot width
    const hw  = plotW / 2 - 48;
    const lng = Math.max((s1.title || "").length, (s2.title || "").length);
    const cft = Math.min(130, Math.max(52, Math.floor(hw / (lng * 0.58))));
    const cfw = Math.round(cft * 0.55);
    const cLineH = cfw + 14; // line height for wrapped writer lines

    // Wrap writer at ~28 chars on word boundary
    const wrapW = (name, max = 28) => {
      if (!name || name.length <= max) return [name || ""];
      const mid = name.lastIndexOf(" ", max);
      return mid > 0 ? [name.slice(0, mid), name.slice(mid + 1)] : [name];
    };
    const w1lines = wrapW(s1.writer || "");
    const w2lines = wrapW(s2.writer || "");
    const maxWriterLines = Math.max(w1lines.length, w2lines.length);

    // Vertically center title block (title + all writer lines) in the header zone
    const titleBlockH = cft + 14 + maxWriterLines * cLineH;
    const cTY  = Math.round(_sgHeaderH / 2 - titleBlockH / 2) + cft;
    const cWY1 = cTY + 14 + cfw; // baseline of first writer line

    // Glyph: size = cft, centered horizontally, top aligned to title cap height
    const cGlyphW   = Math.round(cft * 58 / 52);
    const cGlyphTop = cTY - 2 * cft - 32; // above title block top, with 32px gap
    const cGlyphX   = plotX + plotW / 2 - cGlyphW / 2;

    // Build writer SVG for left (text-anchor start) and right (text-anchor end)
    const writerLeft  = w1lines.map((l, i) =>
      `<text x="${plotX}" y="${cWY1 + i * cLineH}" font-family="${fontS}" font-weight="300" font-size="${cfw}" fill="${color1}" opacity="0.7">${esc(l)}</text>`
    ).join("\n  ");
    const writerRight = w2lines.map((l, i) =>
      `<text x="${(plotX + plotW).toFixed(1)}" y="${cWY1 + i * cLineH}" text-anchor="end" font-family="${fontS}" font-weight="300" font-size="${cfw}" fill="${color2}" opacity="0.7">${esc(l)}</text>`
    ).join("\n  ");

    const smT = t => _sgSmooth(t || []);
    const m1 = smT(s1.overallTension), m2 = smT(s2.overallTension);
    const avg1  = m1.length ? (m1.reduce((a, b) => a + b, 0) / m1.length).toFixed(1) : "—";
    const avg2  = m2.length ? (m2.reduce((a, b) => a + b, 0) / m2.length).toFixed(1) : "—";
    const avgSc1 = s1.scenes?.length
      ? (s1.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / s1.scenes.length).toFixed(1)
      : s1.avgSceneLength || "—";
    const avgSc2 = s2.scenes?.length
      ? (s2.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / s2.scenes.length).toFixed(1)
      : s2.avgSceneLength || "—";

    const cw = Math.round(plotW / 4);
    const stats = [
      { v: `${avgSc1}pp`, l: "avg scene",   c: color1, tc: color1, op: "0.9" },
      { v: avg1,          l: "avg tension", c: color1, tc: color1, op: "0.9" },
      { v: `${avgSc2}pp`, l: "avg scene",   c: color2, tc: color2, op: "0.9" },
      { v: avg2,          l: "avg tension", c: color2, tc: color2, op: "0.9" },
    ];

    const buildCurve = (entry, color, gid) => {
      const sm = smT(entry.overallTension);
      if (!sm.length) return "";
      const pts = sm.map((t, i) => ({
        x: plotX + (i / (sm.length - 1)) * plotW,
        y: _sgPlotY + _sgPlotH - (t / 10) * _sgPlotH,
      }));
      const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      const area = `${line} L${(plotX + plotW).toFixed(1)},${(_sgPlotY + _sgPlotH).toFixed(1)} L${plotX},${(_sgPlotY + _sgPlotH).toFixed(1)} Z`;
      return `<defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.03"/>
      </linearGradient>
      <clipPath id="cl${gid}"><rect x="${plotX}" y="${_sgPlotY - 4}" width="${plotW}" height="${_sgPlotH + 8}"/></clipPath>
    </defs>
    <path d="${area}" fill="url(#${gid})" clip-path="url(#cl${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round" clip-path="url(#cl${gid})"/>`;
    };

    const grid = [2, 4, 6, 8, 10].map(v => {
      const gy = (_sgPlotY + _sgPlotH - (v / 10) * _sgPlotH).toFixed(1);
      return `<line x1="${plotX}" y1="${gy}" x2="${(plotX + plotW).toFixed(1)}" y2="${gy}" stroke="#ffffff09" stroke-width="2"/>`;
    }).join("");

    const actBreaks1 = s1.naturalStructure?.actBreaks || [];
    const bf = ["#c8a0600d", "#ffffff07", "#c8a06009"];
    const bks = [0, ...actBreaks1.map(b => b.position), 100];
    let bands = "";
    bks.slice(0, -1).forEach((start, i) => {
      const end = bks[i + 1];
      const x1 = (plotX + (start / 100) * plotW).toFixed(1);
      const x2 = (plotX + (end / 100) * plotW).toFixed(1);
      bands += `<rect x="${x1}" y="${_sgPlotY}" width="${(+x2 - +x1).toFixed(1)}" height="${_sgPlotH}" fill="${bf[i % 3]}"/>`;
    });

    const wx = (plotX + plotW - 12).toFixed(1), wy = (_sgPlotY + _sgPlotH - 26).toFixed(1);
    const ac = T.accent;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bgP}"/>
  <rect x="${plotX}" y="0" width="${(plotMidX - plotX).toFixed(1)}" height="8" fill="${color1}" opacity="0.75"/>
  <rect x="${plotMidX.toFixed(1)}" y="0" width="${(plotX + plotW - plotMidX).toFixed(1)}" height="8" fill="${color2}" opacity="0.75"/>
  ${_sgGlyph(cGlyphX, cGlyphTop, cft)}
  <text x="${plotX}" y="${cTY}" font-family="${fontD}" font-weight="800" font-size="${cft}" fill="${color1}" letter-spacing="1">${esc((s1.title || "").toUpperCase())}</text>
  ${writerLeft}
  <text x="${(plotX + plotW).toFixed(1)}" y="${cTY}" text-anchor="end" font-family="${fontD}" font-weight="800" font-size="${cft}" fill="${color2}" letter-spacing="1">${esc((s2.title || "").toUpperCase())}</text>
  ${writerRight}
  <line x1="${plotX}" y1="${_sgHeaderH}" x2="${plotX + plotW}" y2="${_sgHeaderH}" stroke="${bSub}" stroke-width="1.5"/>
  <rect x="${plotX}" y="${_sgPlotY}" width="${plotW}" height="${_sgPlotH}" fill="#ffffff03" rx="6"/>
  ${grid}${bands}
  ${buildCurve(s1, color1, "cg1")}
  ${buildCurve(s2, color2, "cg2")}
  <text x="${wx}" y="${wy}" text-anchor="end" font-family="${fontD}" font-size="${_sgFWmark}" fill="${ac}" opacity="0.35"><tspan font-weight="200">SCRIPT</tspan><tspan font-weight="700">GRAPH</tspan><tspan font-weight="200">.ai</tspan></text>
  ${_sgYAxis()}
  <line x1="${plotX}" y1="${_sgInfoY - 10}" x2="${plotX + plotW}" y2="${_sgInfoY - 10}" stroke="${bSub}" stroke-width="1.5"/>
  ${_sgStatStrip(stats, cw)}
</svg>`;
  };

  const downloadShareCard = (mode) => {
    const isCompare = mode === "compare";
    const svg = isCompare
      ? generateCompareCardSVG(compareItems[0], compareItems[1])
      : generateShareCardSVG(p1);
    const slugA = ((isCompare ? compareItems[0]?.title : p1?.title) || "script").replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const slugB = isCompare ? `-vs-${(compareItems[1]?.title || "script").replace(/[^a-z0-9]/gi, "-").toLowerCase()}` : "";
    const filename = `${slugA}${slugB}-scriptgraph`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const img = new Image();
    const svgUrl = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1800; canvas.height = 2250;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 1800, 2250);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob(pngBlob => {
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `${filename}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
          showToast("Share image downloaded");
        }, "image/png");
      } catch {
        URL.revokeObjectURL(svgUrl);
        const svgBlob = new Blob([svg], { type: "image/svg+xml" });
        const svgFallback = URL.createObjectURL(svgBlob);
        const a = document.createElement("a");
        a.href = svgFallback;
        a.download = `${filename}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(svgFallback), 1000);
        showToast("Downloaded as SVG — open in browser to save as PNG");
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      const a = document.createElement("a");
      a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      a.download = `${filename}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = svgUrl;
  };

  // ── Insight Card Share Image Generator ─────────────────────────────────────
  // Full-bleed 1800×2250 poster. Uses shared _sg* chart infrastructure so curves
  // render identically to single/compare cards. Fixed graph height = _sgPlotH.
  // Stats: single film → pages · avg scene · avg tension · peak tension
  //        comparison  → film A avg scene · film A avg tension · film B avg scene · film B avg tension
  const generateInsightCardSVG = (insight) => {
    const W = _sgW, H = _sgH;
    const bgP = T.bgPage;
    const textP = T.textPrimary, textS = T.textSecondary;
    const ac = T.accent;
    const fontD = T.fontDisplay, fontS = T.fontSans;
    const plotX = _sgPlotX, plotW = _sgPlotW;
    const esc = s => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // ── Header layout ──
    const fTitle     = 90;
    const fSubheader = 44;
    const fBody      = 52;
    const bodyLineH  = 74;
    const titleY     = 60 + fTitle;       // baseline ~150
    const subheaderY = titleY + 36 + fSubheader; // baseline ~230

    // Colored film subheader using tspan — no manual width calculation needed.
    // Single <text> with colored <tspan> children flows naturally left to right.
    const subColor1 = insight.resolvedFilms.length === 1 ? ac : T.fwColors.three_act;
    const subColor2 = T.fwColors.story_circle;
    const buildSubheader = () => {
      if (insight.resolvedFilms.length === 1) {
        const title = esc((insight.resolvedFilms[0].entry?.title || insight.resolvedFilms[0].label).toUpperCase());
        return `<text x="${plotX}" y="${subheaderY}" font-family="${fontS}" font-weight="400" font-size="${fSubheader}"><tspan fill="${subColor1}">${title}</tspan></text>`;
      }
      const t1 = esc((insight.resolvedFilms[0].entry?.title || insight.resolvedFilms[0].label).toUpperCase());
      const t2 = esc((insight.resolvedFilms[1].entry?.title || insight.resolvedFilms[1].label).toUpperCase());
      return `<text x="${plotX}" y="${subheaderY}" font-family="${fontS}" font-weight="400" font-size="${fSubheader}"><tspan fill="${subColor1}">${t1}</tspan><tspan fill="${textS}"> / </tspan><tspan fill="${subColor2}">${t2}</tspan></text>`;
    };
    const subheaderSVG = buildSubheader();

    // Body text wrap — full plot width at 52px Inter 300, ~25px/char → ~61 chars/line
    const wrapText = (text, charW = 25) => {
      const maxChars = Math.floor(plotW / charW);
      const words = text.split(" ");
      const lines = [];
      let cur = "";
      words.forEach(w => {
        const candidate = cur ? cur + " " + w : w;
        if (candidate.length <= maxChars) cur = candidate;
        else { if (cur) lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      return lines;
    };
    const bodyLines = wrapText(insight.body);
    const bodyStartY = subheaderY + 40 + fBody; // body starts below subheader

    // Divider sits where header ends — _sgHeaderH (700px, giving ~82px gap above chart)

    // ── Stats ──
    const sm = arr => arr.map((_, i) => {
      const lo = Math.max(0, i - 1), hi = Math.min(arr.length - 1, i + 1);
      const sl = arr.slice(lo, hi + 1);
      return sl.reduce((a, b) => a + b, 0) / sl.length;
    });

    const isSolo = insight.resolvedFilms.length === 1;
    const sw = Math.round(plotW / 4);

    let stats;
    if (isSolo) {
      const entry = insight.resolvedFilms[0].entry;
      const ten = sm(entry?.overallTension || []);
      const avgT  = ten.length ? (ten.reduce((a, b) => a + b, 0) / ten.length).toFixed(1) : "—";
      const peakT = ten.length ? Math.max(...ten).toFixed(1) : "—";
      const avgSc = entry?.scenes?.length
        ? (entry.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / entry.scenes.length).toFixed(1)
        : entry?.avgSceneLength || "—";
      stats = [
        { v: `${entry?.totalPages || "—"}p`, l: "pages",       c: textP,  tc: textS },
        { v: `${avgSc}pp`,                   l: "avg scene",   c: textP,  tc: textS },
        { v: avgT,                           l: "avg tension", c: textP,  tc: textS },
        { v: peakT,                          l: "peak tension",c: textP,  tc: textS },
      ];
    } else {
      const [f1, f2] = insight.resolvedFilms;
      const color1 = T.fwColors.three_act, color2 = T.fwColors.story_circle;
      const t1 = sm(f1.entry?.overallTension || []);
      const t2 = sm(f2.entry?.overallTension || []);
      const avg1  = t1.length ? (t1.reduce((a, b) => a + b, 0) / t1.length).toFixed(1) : "—";
      const avg2  = t2.length ? (t2.reduce((a, b) => a + b, 0) / t2.length).toFixed(1) : "—";
      const avgSc1 = f1.entry?.scenes?.length
        ? (f1.entry.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / f1.entry.scenes.length).toFixed(1)
        : f1.entry?.avgSceneLength || "—";
      const avgSc2 = f2.entry?.scenes?.length
        ? (f2.entry.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / f2.entry.scenes.length).toFixed(1)
        : f2.entry?.avgSceneLength || "—";
      stats = [
        { v: `${avgSc1}pp`, l: "avg scene",   c: color1, tc: color1, op: "0.9" },
        { v: avg1,          l: "avg tension", c: color1, tc: color1, op: "0.9" },
        { v: `${avgSc2}pp`, l: "avg scene",   c: color2, tc: color2, op: "0.9" },
        { v: avg2,          l: "avg tension", c: color2, tc: color2, op: "0.9" },
      ];
    }

    // ── Film legend tags — positioned inside _sgBotPad, below stat strip ──
    const tagsY    = _sgH - _sgBotPad + 30;  // 30px below start of bottom pad
    const tagH     = 60;
    const tagFSize = 36;
    const tagPadH  = 30;
    const tagGap   = 24;
    const tagBR    = 12;
    let tagX = plotX;
    const tags = insight.resolvedFilms.map(f => {
      const labelW = f.label.length * 22 + tagPadH * 2;
      const tag = `
  <rect x="${tagX.toFixed(0)}" y="${tagsY}" width="${labelW.toFixed(0)}" height="${tagH}" rx="${tagBR}" fill="${f.color}15" stroke="${f.color}" stroke-width="2" stroke-opacity="0.4"/>
  <text x="${(tagX + labelW / 2).toFixed(0)}" y="${(tagsY + tagH * 0.63).toFixed(0)}" text-anchor="middle" font-family="${fontD}" font-weight="600" font-size="${tagFSize}" fill="${f.color}" letter-spacing="4">${esc(f.label.toUpperCase())}</text>`;
      tagX += labelW + tagGap;
      return tag;
    }).join("");

    // ── Build curves for each film ──
    const color1 = T.fwColors.three_act, color2 = T.fwColors.story_circle;
    const filmColors = insight.resolvedFilms.length === 1
      ? [ac]
      : [color1, color2];

    const curveDefs = insight.resolvedFilms.map((f, i) =>
      `<linearGradient id="icg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${filmColors[i]}" stop-opacity="0.25"/><stop offset="100%" stop-color="${filmColors[i]}" stop-opacity="0.03"/></linearGradient>`
    ).join("");

    const curves = insight.resolvedFilms.map((f, i) => {
      if (!f.entry?.overallTension) return "";
      const s = sm(f.entry.overallTension);
      const pts = s.map((t, idx) => ({
        x: plotX + (idx / (s.length - 1)) * plotW,
        y: _sgPlotY + _sgPlotH - (t / 10) * _sgPlotH,
      }));
      const line = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      const area = line + ` L${(plotX + plotW).toFixed(1)},${(_sgPlotY + _sgPlotH).toFixed(1)} L${plotX.toFixed(1)},${(_sgPlotY + _sgPlotH).toFixed(1)} Z`;
      return `<path d="${area}" fill="url(#icg${i})"/><path d="${line}" fill="none" stroke="${filmColors[i]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" opacity="${i > 0 ? 0.75 : 1}"/>`;
    }).join("");

    // Grid lines
    const grid = [2, 4, 6, 8, 10].map(v => {
      const gy = (_sgPlotY + _sgPlotH - (v / 10) * _sgPlotH).toFixed(1);
      return `<line x1="${plotX}" y1="${gy}" x2="${(plotX + plotW).toFixed(1)}" y2="${gy}" stroke="#ffffff09" stroke-width="2"/>`;
    }).join("");

    const wmX = (plotX + plotW - 12).toFixed(1);
    const wmY = (_sgPlotY + _sgPlotH - 26).toFixed(1);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>${curveDefs}</defs>
  <rect width="${W}" height="${H}" fill="${bgP}"/>
  <text x="${plotX}" y="${titleY}" font-family="${fontD}" font-weight="800" font-size="${fTitle}" fill="${textP}" letter-spacing="2">${esc(insight.title.toUpperCase())}</text>
  ${subheaderSVG}
  ${bodyLines.map((l, i) => `<text x="${plotX}" y="${(bodyStartY + i * bodyLineH).toFixed(0)}" font-family="${fontS}" font-weight="300" font-size="${fBody}" fill="${textS}">${esc(l)}</text>`).join("\n  ")}
  <line x1="${plotX}" y1="${_sgHeaderH}" x2="${plotX + plotW}" y2="${_sgHeaderH}" stroke="${T.borderSubtle}" stroke-width="1.5"/>
  <rect x="${plotX}" y="${_sgPlotY}" width="${plotW}" height="${_sgPlotH}" fill="#ffffff03" rx="6"/>
  ${grid}
  ${curves}
  <text x="${wmX}" y="${wmY}" text-anchor="end" font-family="${T.fontDisplay}" font-size="${_sgFWmark}" fill="${ac}" opacity="0.35"><tspan font-weight="200">SCRIPT</tspan><tspan font-weight="700">GRAPH</tspan><tspan font-weight="200">.ai</tspan></text>
  ${_sgYAxis()}
  <line x1="${plotX}" y1="${_sgInfoY - 10}" x2="${plotX + plotW}" y2="${_sgInfoY - 10}" stroke="${T.borderSubtle}" stroke-width="1.5"/>
  ${_sgStatStrip(stats, sw)}
</svg>`;
  };

  const downloadInsightCard = (insight) => {
    const svg = generateInsightCardSVG(insight);
    const filename = `${insight.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-scriptgraph`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const img = new Image();
    const svgUrl = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1800; canvas.height = 2250;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 1800, 2250);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob(pngBlob => {
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `${filename}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
          showToast("Share image downloaded");
        }, "image/png");
      } catch {
        URL.revokeObjectURL(svgUrl);
        const a = document.createElement("a");
        a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        a.download = `${filename}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      const a = document.createElement("a");
      a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      a.download = `${filename}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = svgUrl;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bgPage, color: T.textPrimary, fontFamily: T.fontSans, paddingBottom: 100 }}>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${T.borderSubtle}`, padding: "0 48px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, background: T.bgPage, position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }} onClick={() => { pushPath("/"); setScreen("library"); }}>
          {/* Mark + wordmark grouped tightly as one lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="30" height="27" viewBox="0 0 58 52" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M22 5 L14 5 L14 47 L22 47" stroke="#c8a060" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M36 5 L44 5 L44 47 L36 47" stroke="#c8a060" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <line x1="19" y1="16" x2="34" y2="16" stroke="#3a3a42" strokeWidth="1.0" strokeLinecap="round"/>
              <line x1="19" y1="22" x2="38" y2="22" stroke="#3a3a42" strokeWidth="1.0" strokeLinecap="round"/>
              <line x1="19" y1="28" x2="31" y2="28" stroke="#3a3a42" strokeWidth="1.0" strokeLinecap="round"/>
              <line x1="19" y1="34" x2="36" y2="34" stroke="#3a3a42" strokeWidth="1.0" strokeLinecap="round"/>
              <path d="M19 38 Q24 30 28 24 Q32 17 39 11" stroke="#c8a060" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
              <circle cx="19" cy="38" r="2.4" fill="#c8a060"/>
              <circle cx="39" cy="11" r="2.4" fill="#c8a060"/>
            </svg>
            <span style={{ fontFamily: T.fontDisplay, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 20, lineHeight: 1, color: T.textPrimary }}>
              <span style={{ fontWeight: 200 }}>SCRIPT</span><span style={{ fontWeight: 700 }}>GRAPH</span>
            </span>
          </div>
          <span style={{ fontSize: 9, color: T.textDim, letterSpacing: "0.2em", fontFamily: T.fontMono, textTransform: "uppercase", paddingTop: 1 }}>{T.appTagline}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!PUBLIC_MODE && screen === "results" && p1 && (
            <Btn color={T.borderMid} variant="ghost" small onClick={saveScript}>↓ Re-save</Btn>
          )}
          {!PUBLIC_MODE && screen === "results" && p1 && (
            <Btn color={T.borderMid} variant="ghost" small onClick={() => {
              const entry = {
                id: String(Date.now()), savedAt: Date.now(),
                isOutline: p1.isOutline || false,
                formatTransition: p1.formatTransition || null,
                title: p1.title, logline: p1.logline, writer: p1.writer || "",
                totalPages: p1.totalPages, totalScenes: p1.totalScenes,
                protagonist: p1.protagonist, antagonistOrConflict: p1.antagonistOrConflict,
                genre: p1.genre, tone: p1.tone, themes: p1.themes,
                avgSceneLength: avgSceneLen || "—",
                naturalStructure: p1.naturalStructure,
                keyMoments: p1.keyMoments || null,
                overallTension: p1.overallTension,
                scenes: p1.scenes,
                frameworkBeats: {}, activeFramework: null,
                _truncated: p1._truncated,
              };
              const jsonStr = JSON.stringify(entry, null, 2);
              const filename = `${(p1.title || "script").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
              let downloaded = false;
              try {
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                downloaded = true;
              } catch {}
              if (!downloaded) setExportJson({ json: jsonStr, filename });
            }}>↓ Export JSON</Btn>
          )}
          {PUBLIC_MODE && (screen === "results" && p1 || screen === "compare" && compareItems.length === 2) && (
            <button onClick={() => {
              const url = window.location.href;
              const title = screen === "compare"
                ? `${compareItems[0].title} vs ${compareItems[1].title} — ScriptGraph`
                : `${p1.title} — ScriptGraph`;
              if (navigator.share) {
                navigator.share({ title, url }).catch(() => {});
              } else {
                navigator.clipboard.writeText(url).then(() => {
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                }).catch(() => {});
              }
            }} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: `1px solid ${shareCopied ? T.accent + "80" : T.borderMid}`,
              borderRadius: T.radiusMd, padding: "5px 12px", cursor: "pointer",
              color: shareCopied ? T.accent : T.textMuted,
              fontSize: 11, fontFamily: T.fontSans, fontWeight: 500,
              letterSpacing: 0.3, transition: "all 0.15s",
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              {shareCopied ? "Copied!" : "Share"}
            </button>
          )}
          {screen !== "library" && (
            <Btn color={T.borderMid} variant="ghost" small onClick={() => { pushPath("/"); setScreen("library"); }}>
              ← Library
            </Btn>
          )}
          {PUBLIC_MODE && (
            <Btn color={screen === "about" ? T.accent : T.borderMid} variant="ghost" small onClick={() => { pushPath("/about"); setScreen("about"); }}>About</Btn>
          )}
          {!PUBLIC_MODE && (
            <Btn color={screen === "docs" ? T.accent : T.borderMid} variant="ghost" small onClick={() => setScreen("docs")}>Docs</Btn>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 48px" }}>

        {/* ════ UPLOAD ════ */}
        {!PUBLIC_MODE && screen === "upload" && (
          <div style={{ marginTop: 64, maxWidth: 640 }}>
            <h1 style={{ margin: "0 0 24px", fontSize: 48, fontWeight: 700, letterSpacing: 2, fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary, lineHeight: 1.05 }}>
              Add{uploadMode === "outline" ? " an Outline" : " a Script"}
            </h1>

            {/* ── Mode toggle ── */}
            <div style={{ display: "flex", gap: 0, marginBottom: 32, background: T.bgCard, borderRadius: T.radiusMd, padding: 3, border: `1px solid ${T.borderSubtle}`, width: "fit-content" }}>
              {[["script","Screenplay PDF"],["outline","Development Outline"]].map(([mode, label]) => (
                <button key={mode} onClick={() => { setUploadMode(mode); setErr(null); }} style={{
                  padding: "7px 20px", borderRadius: "4px", border: "none", cursor: "pointer",
                  fontSize: 11, fontFamily: T.fontMono, letterSpacing: 1.2, textTransform: "uppercase",
                  background: uploadMode === mode ? T.accent + "20" : "transparent",
                  color: uploadMode === mode ? T.accent : T.textMuted,
                  borderRight: mode === "script" ? `1px solid ${T.borderSubtle}` : "none",
                  transition: "all 0.15s",
                }}>{label}</button>
              ))}
            </div>

            {/* ── Script PDF mode ── */}
            {uploadMode === "script" && (
              <>
                <p style={{ margin: "0 0 24px", fontSize: 13, color: T.textMuted, lineHeight: 1.8, fontFamily: T.fontSans, fontWeight: 300 }}>
                  Upload a text-based screenplay PDF. Analyzed cold — no framework imposed. Exact page numbers extracted for all positioning.
                </p>
                <div onClick={() => fileRef.current.click()} style={{
                  border: `1px solid ${pdfFile ? naturalColor + "60" : T.borderMid}`,
                  borderRadius: T.radiusLg, padding: "52px 40px", textAlign: "center",
                  cursor: "pointer", background: pdfFile ? `${naturalColor}06` : T.bgCard, transition: "all 0.2s",
                }}>
                  {pdfFile ? (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.6 }}>◻</div>
                      <div style={{ fontSize: 18, color: naturalColor, fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{pdfName}.pdf</div>
                      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono, letterSpacing: 0.5 }}>{(pdfFile.size / 1024).toFixed(0)} KB · Click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 14, color: T.textDim, lineHeight: 1 }}>↑</div>
                      <div style={{ fontSize: 15, color: T.textSecondary, marginBottom: 8, fontFamily: T.fontSans, fontWeight: 300 }}>Drop a screenplay PDF here</div>
                      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono, letterSpacing: 0.3 }}>Text-based PDF only · WriterDuet, Final Draft, Highland, Fade In</div>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFile} />
                <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center" }}>
                  <Btn color={naturalColor} variant="fill" disabled={!pdfFile} onClick={analyze}>Analyze Script</Btn>
                  {pdfFile && <Btn color={T.borderMid} variant="ghost" small onClick={() => { setPdfFile(null); setPdfName(""); }}>Clear</Btn>}
                </div>
              </>
            )}

            {/* ── Outline mode ── */}
            {uploadMode === "outline" && (
              <>
                <p style={{ margin: "0 0 24px", fontSize: 13, color: T.textMuted, lineHeight: 1.8, fontFamily: T.fontSans, fontWeight: 300 }}>
                  Paste your outline below, or upload a .txt or .pdf file. Works with any format — scene headings, numbered sequences, or flowing paragraphs. The richer the scene descriptions, the more detailed the tension curve.
                </p>

                {/* File upload strip */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
                  <button onClick={() => outlineRef.current.click()} style={{
                    fontSize: 11, fontFamily: T.fontMono, letterSpacing: 1, padding: "6px 14px",
                    background: "transparent", border: `1px solid ${T.borderMid}`,
                    borderRadius: T.radiusSm, color: T.textMuted, cursor: "pointer",
                  }}>↑ Upload file</button>
                  {outlineFileName && (
                    <>
                      <span style={{ fontSize: 11, color: T.accent, fontFamily: T.fontMono }}>{outlineFileName}</span>
                      <button onClick={() => { setOutlineFile(null); setOutlineFileName(""); setOutlineText(""); }} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11 }}>✕</button>
                    </>
                  )}
                  <input ref={outlineRef} type="file" accept=".txt,.pdf" style={{ display: "none" }} onChange={async e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setOutlineFile(file);
                    setOutlineFileName(file.name);
                    if (file.name.endsWith(".txt")) {
                      const text = await file.text();
                      setOutlineText(text);
                    } else if (file.name.endsWith(".pdf")) {
                      // Use pdf.js to extract text
                      try {
                        const ab = await file.arrayBuffer();
                        const extracted = await extractPdfText(ab);
                        setOutlineText(extracted.map(l => l.replace(/^\[p\d+\]\s*/, "")).join("\n"));
                      } catch { setErr("Could not extract text from PDF."); }
                    }
                    e.target.value = "";
                  }} />
                </div>

                {/* Paste area */}
                <textarea
                  value={outlineText}
                  onChange={e => setOutlineText(e.target.value)}
                  placeholder={"Paste your outline here…\n\nWorks with:\n  • Scene headings (INT. KITCHEN - DAY)\n  • Numbered sequences (1. The hero arrives…)\n  • Plain paragraphs describing each scene"}
                  style={{
                    width: "100%", height: 260, padding: "16px", resize: "vertical",
                    background: T.bgCard, border: `1px solid ${outlineText ? naturalColor + "40" : T.borderMid}`,
                    borderRadius: T.radiusLg, color: T.textPrimary, fontSize: 12,
                    fontFamily: T.fontSans, lineHeight: 1.7, outline: "none",
                    transition: "border-color 0.15s",
                  }}
                />
                <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 6 }}>
                  {outlineText.trim().split(/\n\s*\n/).filter(p => p.trim().length > 20).length} sequences detected
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
                  <Btn color={naturalColor} variant="fill" disabled={!outlineText.trim()} onClick={analyzeOutline}>Analyze Outline</Btn>
                  {outlineText && <Btn color={T.borderMid} variant="ghost" small onClick={() => { setOutlineText(""); setOutlineFile(null); setOutlineFileName(""); }}>Clear</Btn>}
                </div>
              </>
            )}

            {err && <ErrorBox message={err} />}
          </div>
        )}

        {/* ════ ANALYZING ════ */}
        {screen === "analyzing" && (
          <Loader
            color={naturalColor}
            label={loadingLabel || "ANALYZING…"}
            sublabel={loading === "parsing" ? "Cold read in progress — ~25 seconds for a feature film" : ""}
          />
        )}

        {/* ════ RESULTS ════ */}
        {screen === "results" && p1 && (
          <div style={{ marginTop: 28 }}>

            {/* Script header */}
            <div style={{ marginBottom: 32, paddingBottom: 28, borderBottom: `1px solid ${T.borderSubtle}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <h1 style={{
                  margin: "0 0 10px", fontSize: 52, fontWeight: 800,
                  letterSpacing: 2.5, lineHeight: 1.0, textTransform: "uppercase",
                  fontFamily: T.fontDisplay, color: T.textPrimary,
                }}>{p1.title}</h1>
                {p1.isOutline && (
                  <span style={{ fontSize: 9, fontFamily: T.fontMono, letterSpacing: 2, color: T.accent, background: T.accent + "15", border: `1px solid ${T.accent}40`, borderRadius: T.radiusSm, padding: "3px 8px", whiteSpace: "nowrap" }}>
                    OUTLINE
                  </span>
                )}
              </div>
              {p1.writer && (
                <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontSans, fontWeight: 400, letterSpacing: 0.3, marginBottom: 10, marginTop: -4 }}>
                  Written by {p1.writer}
                </div>
              )}
              <p style={{ margin: "0 0 24px", fontSize: 14, color: T.textMuted, lineHeight: 1.75, maxWidth: 680, fontFamily: T.fontSans, fontWeight: 300 }}>{p1.logline}</p>

              {/* Stat bar */}
              <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start" }}>
                {!p1.isOutline && <StatBadge label="Pages" value={p1.totalPages} color={naturalColor} />}
                <StatBadge label="Scenes" value={p1.scenes?.length || p1.totalScenes} color={naturalColor} />
                {!p1.isOutline && <StatBadge label="Avg Scene" value={`${avgSceneLen}pp`} color={naturalColor} />}
                <StatBadge label="Structure" value={p1.naturalStructure?.structureType ? p1.naturalStructure.structureType.charAt(0).toUpperCase() + p1.naturalStructure.structureType.slice(1) : `${p1.naturalStructure?.actCount}-Act`} color={naturalColor} />
                <StatBadge label="Genre" value={p1.genre} />
                <StatBadge label="Tone" value={p1.tone} />
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 2, textTransform: "uppercase" }}>Themes</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
                    {(p1.themes || []).map(th => (
                      <span key={th} style={{ fontSize: 11, fontFamily: T.fontSans, fontWeight: 400, color: T.textSecondary, background: T.bgHover, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusSm, padding: "3px 9px" }}>{th}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Film Performance Strip ── */}
            {!p1.isOutline && (
              <div style={{ marginBottom: 32, paddingBottom: 28, borderBottom: `1px solid ${T.borderSubtle}` }}>
                <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textDim, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 14 }}>
                  Film Performance
                </div>
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  {[
                    {
                      label: "Box Office",
                      value: filmPerf?.boxOffice || null,
                      sub1: "worldwide gross",
                      sub2: filmPerf?.budget ? `${filmPerf.budget} budget` : null,
                    },
                    {
                      label: "Rotten Tomatoes",
                      value: filmPerf?.rt || null,
                      sub1: "critics score",
                      sub2: null,
                    },
                    {
                      label: "Metacritic",
                      value: filmPerf?.mc || null,
                      sub1: "metascore",
                      sub2: null,
                    },
                    {
                      label: "Awards",
                      value: filmPerf?.awards ? `${filmPerf.awards.wins} wins · ${filmPerf.awards.noms} noms` : null,
                      sub1: filmPerf?.awardNames?.length > 0 ? filmPerf.awardNames.join(" · ") : null,
                      sub2: null,
                    },
                  ].map((block, i, arr) => (
                    <div key={block.label} style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-start",
                      flex: 1,
                      paddingRight: i < arr.length - 1 ? 28 : 0,
                      marginRight: i < arr.length - 1 ? 28 : 0,
                      borderRight: i < arr.length - 1 ? `1px solid ${T.borderSubtle}` : "none",
                      minHeight: 72,
                    }}>
                      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 7 }}>
                        {block.label}
                      </div>
                      {filmPerfLoading ? (
                        <>
                          <div style={{ width: 64, height: 18, background: T.borderSubtle, borderRadius: 3, marginBottom: 7 }} />
                          <div style={{ width: 80, height: 10, background: T.bgHover, borderRadius: 3, marginBottom: 4 }} />
                          <div style={{ width: 56, height: 10, background: T.bgHover, borderRadius: 3 }} />
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 22, fontFamily: T.fontDisplay, fontWeight: 700, color: T.textPrimary, letterSpacing: 0.5, lineHeight: 1, marginBottom: 5 }}>
                            {block.value || "—"}
                          </div>
                          {block.sub1 && (
                            <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>
                              {block.sub1}
                            </div>
                          )}
                          {block.sub2 && (
                            <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>
                              {block.sub2}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <TruncationWarning p1={p1} />

            {/* No framework switcher — Option B uses structural rhythm markers */}

            {err && <ErrorBox message={err} />}

            <div style={{ display: "flex", borderBottom: `1px solid ${T.borderSubtle}`, marginBottom: 24, overflowX: "auto", gap: 0 }}>
              {getTabs().map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: "10px 22px", border: "none", background: "transparent",
                  borderBottom: `2px solid ${tab === t.id ? fwColor : "transparent"}`,
                  color: tab === t.id ? T.textPrimary : T.textMuted,
                  fontSize: 12, fontFamily: T.fontSans, fontWeight: tab === t.id ? 500 : 400,
                  cursor: "pointer", letterSpacing: 0.1, transition: "all 0.12s",
                  marginBottom: -1, whiteSpace: "nowrap",
                }}>{t.label}</button>
              ))}
            </div>

            {tab === "structure" && <StructuralSummary naturalStructure={p1.naturalStructure} color={naturalColor} />}

            {tab === "arc" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Chart */}
                <div style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "22px 22px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <SectionLabel style={{ margin: 0 }}>Tension Arc with Structural Markers</SectionLabel>
                    {!p1.isOutline && (
                      <button onClick={() => setShowPages(p => !p)} style={{
                        fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1.2,
                        color: showPages ? naturalColor : T.textMuted,
                        background: showPages ? `${naturalColor}15` : "transparent",
                        border: `1px solid ${showPages ? naturalColor + "50" : T.borderSubtle}`,
                        borderRadius: T.radiusSm, padding: "4px 10px", cursor: "pointer",
                      }}>
                        {showPages ? "SHOWING PAGES" : "SHOW PAGES"}
                      </button>
                    )}
                  </div>
                  <TensionChart
                    datasets={[{ tension: smoothedTension, beats: [], color: naturalColor, label: p1.title }]}
                    actBreaks={p1.naturalStructure?.actBreaks}
                    showActs={false}
                    normalized={true}
                    hoveredBeatId={null}
                    onBeatHover={null}
                    hoveredTpId={hoveredTpId}
                    onTpHover={setHoveredTpId}
                    rhythmMarkers={rhythmMarkers}
                    hoveredMarkerId={hoveredMarkerId}
                    onMarkerHover={setHoveredMarkerId}
                    totalPages={p1.totalPages}
                    showPages={showPages}
                    midpointPosition={resolveKM(p1.keyMoments?.midpoint, p1.scenes, p1.totalPages)?.position ?? null}
                    formatTransition={p1.formatTransition || null}
                  />
                  {/* Legend inside chart panel */}
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.borderSubtle}` }}>
                    <RhythmLegend showFormatShift={!!p1.formatTransition} />
                  </div>
                  {/* Share Image */}
                  {PUBLIC_MODE && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderSubtle}`, display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => setShareCard("single")} style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 14px", border: `1px solid ${T.borderMid}`,
                        borderRadius: T.radiusSm, background: "transparent",
                        color: T.accent, fontSize: 11, fontFamily: T.fontSans,
                        fontWeight: 500, letterSpacing: 0.2, cursor: "pointer", transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accent + "0d"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.background = "transparent"; }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Share Image
                      </button>
                    </div>
                  )}
                </div>
                {/* Disclaimer */}
                <p style={{
                  margin: 0,
                  fontSize: 11,
                  color: T.textMuted,
                  fontFamily: T.fontSans,
                  fontStyle: "italic",
                  fontWeight: 300,
                  lineHeight: 1.7,
                  borderLeft: `2px solid ${T.borderMid}`,
                  paddingLeft: 12,
                }}>
                  Scene summaries and structural markers are generated by AI analysis of the screenplay and may contain minor inaccuracies. All scripts are resolved to a three-act framework for comparison — the structure type label shows how each story is actually organized. The graphs are the point — use them to see how a story moves, where it breathes, and where it escalates. Individual scene details are context, not the claim.
                </p>
                {/* Marker list */}
                <div>
                  <SectionLabel>Structural Markers · {(p1.naturalStructure?.actBreaks?.length || 0)} Act Breaks · {rhythmMarkers.length} Story Markers</SectionLabel>
                  <RhythmPanel
                    markers={rhythmMarkers}
                    actBreaks={p1.naturalStructure?.actBreaks}
                    hoveredMarkerId={hoveredMarkerId}
                    onMarkerHover={setHoveredMarkerId}
                  />
                </div>
              </div>
            )}

            {tab === "pacing" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "22px 22px 14px" }}>
                  <SectionLabel>Scene Length Rhythm</SectionLabel>
                  {p1.isOutline && (
                    <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.colorWarning, letterSpacing: 1, marginBottom: 10 }}>
                      ⚠ OUTLINE MODE — scene lengths are estimated (equal weight per scene)
                    </div>
                  )}
                  <SceneLengthChart scenes={p1.scenes || []} color={naturalColor} showPages={showPages} totalPages={p1.totalPages} />
                </div>
                {p1.naturalStructure?.pacingNotes && (
                  <div style={{ background: T.bgHover, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusMd, padding: "20px 22px" }}>
                    <SectionLabel>Pacing Analysis</SectionLabel>
                    <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.8 }}>{p1.naturalStructure.pacingNotes}</div>
                  </div>
                )}
              </div>
            )}



            {tab === "scenes" && <SceneList scenes={p1.scenes || []} color={fwColor} />}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Btn color={T.borderMid} variant="ghost" small onClick={() => { pushPath("/"); setScreen("library"); }}>
                {PUBLIC_MODE ? "← LIBRARY" : "← ANALYZE NEW SCRIPT"}
              </Btn>
            </div>
          </div>
        )}

        {/* ════ LIBRARY ════ */}
        {screen === "library" && (() => {
          // Derive genre list dynamically from library
          const allGenres = [...new Set(
            library.flatMap(e => (e.genre || "").split(/[/,·]/).map(g => g.trim()).filter(Boolean))
          )].sort();

          // Apply search + genre filter
          const filtered = library.filter(e => {
            const q = libSearch.toLowerCase();
            const matchSearch = !q || e.title?.toLowerCase().includes(q) || e.logline?.toLowerCase().includes(q) || e.genre?.toLowerCase().includes(q) || e.writer?.toLowerCase().includes(q);
            const matchGenre  = !libGenreFilter || (e.genre || "").toLowerCase().includes(libGenreFilter.toLowerCase());
            return matchSearch && matchGenre;
          });

          return (
          <div style={{ marginTop: 48, paddingBottom: compareItems.length > 0 ? 100 : 0 }}>

            {/* ── Intro banner — public only ── */}
            {PUBLIC_MODE && (
              <div style={{
                borderBottom: `1px solid ${T.borderSubtle}`,
                marginBottom: 40,
                paddingBottom: 32,
              }}>
                <p style={{
                  margin: "0 0 6px",
                  fontSize: 14,
                  color: T.textSecondary,
                  lineHeight: 1.85,
                  maxWidth: 600,
                  fontFamily: T.fontSans,
                  fontWeight: 300,
                }}>
                  I built this to understand how films move. Each graph maps the rise and fall of narrative pressure across a screenplay — the shape of the story.
                </p>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: T.textMuted,
                  fontFamily: T.fontSans,
                  fontStyle: "italic",
                  fontWeight: 300,
                }}><a href="https://petecapo.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none", borderBottom: `1px solid ${T.textMuted}40` }}>— Pete Capo</a></p>
              </div>
            )}

            {/* ── Insights strip — public only ── */}
            {PUBLIC_MODE && (() => {
              // ─── INSIGHTS DATA — edit here to add/update insights ───────────────
              // Each insight needs:
              //   title: string
              //   body: string (2–4 sentences, your voice)
              //   films: array of { slug, color, label }
              //     slug must match the JSON filename in /public/library/ (without .json)
              //     color: one of T.fwColors values or any hex
              //     label: display name for the legend tag
              // For solo-film cards, films has one entry → links to script detail page
              // For multi-film cards, films has two entries → links to comparison view
              // ─── INSIGHTS DATA — edit here to add/update insights ───────────────
              // ORDERING: Newest card goes FIRST (top of array = leftmost on screen)
              const INSIGHTS = [
                {
                  title: "Genre as Trojan Horse",
                  subtitle: "2025 Oscar Winner — Best Original Screenplay",
                  body: "Sinners disguises itself as horror. What Coogler is actually doing — tracing the roots of American music, the theft of Black culture — takes nearly 40% of the script to build. The prologue earns that patience. You already know something terrible is coming. So the wait feels like dread, not drag.",
                  films: [
                    { slug: "sinners", color: T.accent, label: "Sinners" },
                  ],
                },
                {
                  title: "The Safdie Climb",
                  body: "Most screenplays breathe — peaks followed by release. The Safdie films don't. Uncut Gems and Marty Supreme both start high and almost never come down. It's a structural choice that explains the physiological experience of watching them — a foot on the pedal that never lifts.",
                  films: [
                    { slug: "uncut-gems", color: T.fwColors.three_act, label: "Uncut Gems" },
                    { slug: "marty-supreme", color: T.fwColors.story_circle, label: "Marty Supreme" },
                  ],
                },
                {
                  title: "Tarantino's Heartbeat",
                  body: "Both written by Tarantino. The heartbeat is there in both — sharp peaks, deep valleys, almost metronomic. You could argue he found the signature in True Romance, his first produced script, and perfected it by Pulp Fiction.",
                  films: [
                    { slug: "pulp-fiction", color: T.fwColors.three_act, label: "Pulp Fiction" },
                    { slug: "true-romance", color: T.fwColors.story_circle, label: "True Romance" },
                  ],
                },
                {
                  title: "Tension Isn't Everything",
                  body: "It's one of my favorite films. The graph is almost flat — no towering peaks, no relentless climb. That's not a flaw. Some films work through accumulation, through feeling, through the weight of an idea. The direction matters too. Not every story needs to tighten a screw.",
                  films: [
                    { slug: "eternal-sunshine-of-the-spotless-mind", color: T.accent, label: "Eternal Sunshine" },
                  ],
                },
              ];
              // ────────────────────────────────────────────────────────────────────

              // Resolve library entries for each insight
              const resolvedInsights = INSIGHTS.map(insight => ({
                ...insight,
                resolvedFilms: insight.films.map(f => ({
                  ...f,
                  entry: library.find(e =>
                    slugFromFilename(e._filename || "") === f.slug ||
                    slugFromFilename((e.title || "").replace(/[^a-z0-9]/gi, "-").toLowerCase()) === f.slug
                  ),
                })),
              }));

              // Mini curve renderer — uses real tension data from library
              const MiniInsightCurve = ({ resolvedFilms }) => {
                const W = 320, H = 64;
                const P = { t: 4, r: 4, b: 4, l: 4 };
                const iw = W - P.l - P.r, ih = H - P.t - P.b;

                const smooth = (arr) => arr.map((_, i) => {
                  const lo = Math.max(0, i - 1), hi = Math.min(arr.length - 1, i + 1);
                  const sl = arr.slice(lo, hi + 1);
                  return sl.reduce((a, b) => a + b, 0) / sl.length;
                });

                const makePath = (tension) => {
                  const sm = smooth(tension);
                  return sm.map((t, i) => {
                    const x = (P.l + (i / (sm.length - 1)) * iw).toFixed(1);
                    const y = (P.t + ih - (t / 10) * ih).toFixed(1);
                    return `${i === 0 ? "M" : "L"}${x},${y}`;
                  }).join(" ");
                };

                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 64, display: "block" }} preserveAspectRatio="none">
                    <defs>
                      {resolvedFilms.map((f, i) => f.entry && (
                        <linearGradient key={i} id={`ig${i}-${f.slug}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={f.color} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={f.color} stopOpacity="0.02" />
                        </linearGradient>
                      ))}
                    </defs>
                    {resolvedFilms.map((f, i) => {
                      if (!f.entry?.overallTension) return null;
                      const line = makePath(f.entry.overallTension);
                      const sm = smooth(f.entry.overallTension);
                      const last = sm[sm.length - 1];
                      const areaClose = ` L${(P.l + iw).toFixed(1)},${(P.t + ih - (last / 10) * ih).toFixed(1)} L${(P.l + iw).toFixed(1)},${P.t + ih} L${P.l},${P.t + ih} Z`;
                      const firstY = (P.t + ih - (sm[0] / 10) * ih).toFixed(1);
                      const areaPath = line + ` L${(P.l + iw).toFixed(1)},${P.t + ih} L${P.l},${P.t + ih} Z`;
                      return (
                        <g key={i}>
                          <path d={areaPath} fill={`url(#ig${i}-${f.slug})`} />
                          <path d={line} fill="none" stroke={f.color} strokeWidth="1.5"
                            strokeLinejoin="round" strokeLinecap="round"
                            opacity={resolvedFilms.length > 1 && i > 0 ? 0.7 : 1} />
                        </g>
                      );
                    })}
                  </svg>
                );
              };

              const handleInsightClick = (insight) => {
                const { resolvedFilms } = insight;
                if (resolvedFilms.length === 1) {
                  // Solo film → script detail page
                  if (resolvedFilms[0].entry) openEntry(resolvedFilms[0].entry);
                } else {
                  // Multi-film → comparison view
                  const entries = resolvedFilms.map(f => f.entry).filter(Boolean);
                  if (entries.length === 2) startCompare(entries);
                }
              };

              return (
                <div style={{ borderBottom: `1px solid ${T.borderSubtle}`, marginBottom: 40, paddingBottom: 28 }}>
                  <div style={{ fontSize: 9, fontFamily: T.fontSans, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: T.textMuted, marginBottom: 16 }}>
                    Director's Notes
                  </div>
                  <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
                    {resolvedInsights.map((insight, idx) => {
                      const hasData = insight.resolvedFilms.some(f => f.entry);
                      return (
                        <div key={idx}
                          onClick={() => hasData && handleInsightClick(insight)}
                          style={{
                            background: T.bgPanel,
                            border: `1px solid ${T.borderSubtle}`,
                            borderRadius: T.radiusLg,
                            padding: "20px 20px 18px",
                            minWidth: 360,
                            maxWidth: 360,
                            flexShrink: 0,
                            cursor: hasData ? "pointer" : "default",
                            transition: "border-color 0.15s",
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                          }}
                          onMouseEnter={e => { if (hasData) e.currentTarget.style.borderColor = T.accent + "40"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderSubtle; }}
                        >
                          {/* Share icon — top right corner */}
                          {hasData && (
                            <button
                              onClick={e => { e.stopPropagation(); downloadInsightCard(insight); }}
                              title="Download share image"
                              style={{
                                position: "absolute", top: 14, right: 14,
                                background: "none", border: "none", padding: 4,
                                cursor: "pointer", color: T.textDim,
                                lineHeight: 1, borderRadius: T.radiusSm,
                                transition: "color 0.15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = T.accent; }}
                              onMouseLeave={e => { e.currentTarget.style.color = T.textDim; }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                              </svg>
                            </button>
                          )}
                          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 18, letterSpacing: 1.5, textTransform: "uppercase", color: T.textPrimary, marginBottom: insight.subtitle ? 5 : 8, lineHeight: 1.2, paddingRight: 24 }}>
                            {insight.title}
                          </div>
                          {insight.subtitle && (
                            <div style={{ fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase", color: T.accentDim, marginBottom: 8, lineHeight: 1.4 }}>
                              {insight.subtitle}
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.75, fontWeight: 300, marginBottom: 0 }}>
                            {insight.body}
                          </div>
                          {/* Mini graph — pushed to bottom via marginTop auto */}
                          <div style={{ background: T.bgPage, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusMd, padding: "12px 14px 10px", marginTop: "auto" }}>
                            <MiniInsightCurve resolvedFilms={insight.resolvedFilms} />
                            {/* Film legend tags */}
                            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                              {insight.resolvedFilms.map((f, fi) => (
                                <div key={fi} style={{
                                  fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase",
                                  padding: "3px 7px", borderRadius: T.radiusSm,
                                  color: f.color, border: `1px solid ${f.color}38`, background: `${f.color}10`,
                                }}>
                                  {f.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Header ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
              <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: 3, fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary }}>Library</h1>
              <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textMuted }}>
                {library.length} script{library.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* ── Search + Genre filter bar ── */}
            {library.length > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
                {/* Search */}
                <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
                  <span style={{
                    position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                    fontSize: 12, color: T.textMuted, pointerEvents: "none",
                  }}>⌕</span>
                  <input
                    value={libSearch}
                    onChange={e => setLibSearch(e.target.value)}
                    placeholder="Search titles, writers, genres…"
                    style={{
                      width: "100%", paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                      background: T.bgCard, border: `1px solid ${libSearch ? T.accent + "60" : T.borderMid}`,
                      borderRadius: T.radiusMd, color: T.textPrimary, fontSize: 12,
                      fontFamily: T.fontSans, outline: "none",
                    }}
                  />
                  {libSearch && (
                    <button onClick={() => setLibSearch("")} style={{
                      position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 12, padding: 2,
                    }}>✕</button>
                  )}
                </div>

                {/* Genre chips */}
                {allGenres.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {libGenreFilter && (
                      <button onClick={() => setLibGenreFilter(null)} style={{
                        fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1,
                        padding: "4px 10px", borderRadius: T.radiusSm, cursor: "pointer",
                        background: T.accent + "20", border: `1px solid ${T.accent + "60"}`,
                        color: T.accent,
                      }}>ALL ✕</button>
                    )}
                    {allGenres.map(g => (
                      <button key={g} onClick={() => setLibGenreFilter(libGenreFilter === g ? null : g)} style={{
                        fontSize: 10, fontFamily: T.fontSans, fontWeight: 500,
                        padding: "4px 10px", borderRadius: T.radiusSm, cursor: "pointer",
                        background: libGenreFilter === g ? T.accent + "22" : "transparent",
                        border: `1px solid ${libGenreFilter === g ? T.accent + "60" : T.borderMid}`,
                        color: libGenreFilter === g ? T.accent : T.textMuted,
                        transition: "all 0.12s",
                      }}>{g}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Grid ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>

              {/* Add Script card — hidden in PUBLIC_MODE, always first unless filtering */}
              {!PUBLIC_MODE && !libSearch && !libGenreFilter && (
                <div
                  onClick={() => { setPdfFile(null); setPdfName(""); setP1(null); setScreen("upload"); }}
                  style={{
                    background: "transparent", border: `1px dashed ${T.borderMid}`,
                    borderRadius: T.radiusLg, padding: "20px 22px",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 12, cursor: "pointer", minHeight: 164, transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "80"; e.currentTarget.style.background = `${T.accent}06`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 40, height: 40, border: `1px solid ${T.borderMid}`, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: T.textMuted, lineHeight: 1, fontWeight: 300, pointerEvents: "none",
                  }}>+</div>
                  <div style={{ fontSize: 10, fontFamily: T.fontSans, fontWeight: 500, color: T.textMuted, letterSpacing: 2.5, textTransform: "uppercase", pointerEvents: "none" }}>
                    Add Script
                  </div>
                </div>
              )}

              {filtered.length === 0 && (libSearch || libGenreFilter) ? (
                <div style={{ gridColumn: "1/-1", padding: "48px 0", textAlign: "center", color: T.textMuted, fontSize: 13, fontFamily: T.fontMono }}>
                  No scripts match your filter.
                </div>
              ) : (
                filtered.map(entry => (
                  <LibraryCard
                    key={entry.id} entry={entry}
                    onOpen={openEntry} onDelete={deleteEntry} onToggleCompare={toggleCompare}
                    compareSelected={!!compareItems.find(e => e.id === entry.id)}
                    compareIndex={compareItems.findIndex(e => e.id === entry.id)}
                  />
                ))
              )}
            </div>
          </div>
          );
        })()}

        {/* ════ COMPARE ════ */}
        {screen === "compare" && compareItems.length === 2 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ marginBottom: 22 }}>
              <SectionLabel>Structure Comparison</SectionLabel>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
              {compareItems.map((entry, i) => {
                const c = i === 0 ? T.fwColors.three_act : T.fwColors.story_circle;
                const avgLen = (!entry.isOutline && entry.scenes?.length)
                  ? (entry.scenes.reduce((s, sc) => s + (sc.lengthPages || 1), 0) / entry.scenes.length).toFixed(1)
                  : null;
                const devLabel = entry.isOutline
                  ? (entry.formatTransition?.transitionScene ? "IN DEVELOPMENT" : "OUTLINE")
                  : null;
                return (
                  <div key={entry.id} style={{ background: T.bgCard, border: `1px solid ${c}45`, borderRadius: T.radiusLg, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 16, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{entry.title}</div>
                      {devLabel && (
                        <span style={{ fontSize: 8, fontFamily: T.fontMono, letterSpacing: 1.8, color: T.accent,
                          background: T.accent + "18", border: `1px solid ${T.accent}35`,
                          borderRadius: "3px", padding: "2px 7px", flexShrink: 0 }}>{devLabel}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {!entry.isOutline && <StatBadge label="Pages" value={entry.totalPages} color={c} />}
                      <StatBadge label="Structure" value={entry.naturalStructure?.structureType ? entry.naturalStructure.structureType.charAt(0).toUpperCase() + entry.naturalStructure.structureType.slice(1) : `${entry.naturalStructure?.actCount}-Act`} color={c} />
                      {!entry.isOutline && <StatBadge label="Avg Scene" value={`${avgLen}pp`} />}
                      {entry.isOutline && <StatBadge label="Scenes" value={entry.totalScenes} color={c} />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Tension Arc + Structural Markers ── */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "22px 22px 14px", marginBottom: 16 }}>
              {/* Controls row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <SectionLabel>Tension Arc · Structural Overlay</SectionLabel>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* Script filter */}
                  {[["both","BOTH"],["a", compareItems[0]?.title?.slice(0,14) || "SCRIPT A"],["b", compareItems[1]?.title?.slice(0,14) || "SCRIPT B"]].map(([v,label]) => (
                    <Btn key={v} small color={compareView === v ? naturalColor : T.borderMid}
                      variant={compareView === v ? "fill" : "ghost"}
                      onClick={() => setCompareView(v)}>{label}</Btn>
                  ))}
                  <div style={{ width: 1, background: T.borderSubtle, margin: "0 2px" }} />
                  {/* Normalized / true length */}
                  <Btn small color={normalizedView ? naturalColor : T.borderMid} variant={normalizedView ? "fill" : "ghost"} onClick={() => setNormalizedView(true)}>NORMALIZED</Btn>
                  <Btn small color={!normalizedView ? naturalColor : T.borderMid} variant={!normalizedView ? "fill" : "ghost"} onClick={() => setNormalizedView(false)}>TRUE LENGTH</Btn>
                  <div style={{ width: 1, background: T.borderSubtle, margin: "0 2px" }} />
                  {/* Page label toggle */}
                  <Btn small color={showComparePages ? naturalColor : T.borderMid}
                    variant={showComparePages ? "fill" : "ghost"}
                    onClick={() => setShowComparePages(p => !p)}>
                    {showComparePages ? "PAGES" : "% ONLY"}
                  </Btn>
                </div>
              </div>

              {/* Chart */}
              {(() => {
                const colors = [T.fwColors.three_act, T.fwColors.story_circle];
                const activeEntries = compareItems.filter((_, i) =>
                  compareView === "both" || (compareView === "a" && i === 0) || (compareView === "b" && i === 1)
                );
                const maxP = Math.max(...compareItems.map(e => e.totalPages || 109));
                const pageLengths = compareItems.map(e => e.totalPages || 109);
                const datasets = activeEntries.map((entry, idx) => {
                  const ci = compareItems.indexOf(entry);
                  const tension = smoothTension(entry.overallTension || [], 3);
                  return { tension, color: colors[ci], label: entry.title };
                });

                // Build compare markers: act breaks + key moments for each visible script
                const compareMarkers = [];
                activeEntries.forEach((entry, idx) => {
                  const ci = compareItems.indexOf(entry);
                  const color = colors[ci];
                  const totalPg = entry.totalPages || 109;

                  // Act breaks
                  (entry.naturalStructure?.actBreaks || []).forEach((ab, ai) => {
                    compareMarkers.push({
                      id: `ab-${ci}-${ai}`,
                      type: "actBreak",
                      scriptIndex: ci,
                      color,
                      position: ab.position,
                      page: ab.page,
                      label: `Act ${ab.actNumber} Break`,
                      note: ab.description,
                      totalPages: totalPg,
                    });
                  });

                  // Key moments — use resolveKM for schema-agnostic resolution
                  const km = entry.keyMoments || {};
                  [["incitingIncident","◉","Inciting Incident"],["midpoint","◆","Midpoint"],["climax","▲","Climax"]].forEach(([key, icon, label]) => {
                    const resolved = resolveKM(km[key], entry.scenes, totalPg);
                    if (!resolved) return;
                    compareMarkers.push({
                      id: `km-${ci}-${key}`,
                      type: "keyMoment",
                      subtype: key,
                      scriptIndex: ci,
                      color,
                      position: resolved.position,
                      page: resolved.page,
                      label,
                      icon: ["incitingIncident","◉","midpoint","◆","climax","▲"].find((v,i,a) => a[i-1]===key) || "·",
                      note: resolved.description,
                      totalPages: totalPg,
                    });
                  });
                });

                return (
                  <CompareTensionChart
                    datasets={datasets}
                    markers={compareMarkers}
                    showPages={showComparePages}
                    normalized={normalizedView}
                    maxPages={maxP}
                    pageLengths={activeEntries.map(e => e.totalPages || 109)}
                  />
                );
              })()}
              {/* Share Image */}
              {PUBLIC_MODE && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderSubtle}`, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => setShareCard("compare")} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 14px", border: `1px solid ${T.borderMid}`,
                    borderRadius: T.radiusSm, background: "transparent",
                    color: T.accent, fontSize: 11, fontFamily: T.fontSans,
                    fontWeight: 500, letterSpacing: 0.2, cursor: "pointer", transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accent + "0d"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.background = "transparent"; }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Share Image
                  </button>
                </div>
              )}
            </div>

            {/* ── Act Breaks + Key Moments side-by-side ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
              {compareItems.map((entry, i) => {
                const c = i === 0 ? T.fwColors.three_act : T.fwColors.story_circle;
                const km = entry.keyMoments || {};
                const actBreaks = entry.naturalStructure?.actBreaks || [];
                return (
                  <div key={entry.id} style={{ background: T.bgPanel, border: `1px solid ${c}30`, borderRadius: T.radiusLg, padding: "18px 16px" }}>
                    <div style={{ fontSize: 13, fontStyle: "italic", color: c, marginBottom: 14, fontFamily: T.fontMono, letterSpacing: 0.5 }}>{entry.title}</div>

                    {actBreaks.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 1.5, marginBottom: 8 }}>ACT BREAKS</div>
                        {actBreaks.map((ab, ai) => (
                          <div key={ai} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: c, minWidth: 52, paddingTop: 1 }}>
                              ACT {ab.actNumber}<br />
                              <span style={{ color: T.textMuted }}>p{ab.page} · {ab.position?.toFixed(0)}%</span>
                            </div>
                            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.55 }}>{ab.description}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 1.5, marginBottom: 8 }}>KEY MOMENTS</div>
                    {[["incitingIncident","◉","Inciting Incident"],["midpoint","◆","Midpoint"],["climax","▲","Climax"]].map(([key, icon, label]) => {
                      const m = km[key];
                      if (!m) return null;
                      const pg = m.page ?? entry.scenes?.find(s => s.number === m.sceneNumber)?.startPage;
                      const pct = m.position ?? (pg ? (pg / (entry.totalPages||109) * 100) : null);
                      if (!pct) return null;
                      return (
                        <div key={key} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                          <div style={{ fontSize: 10, fontFamily: T.fontMono, color: c, minWidth: 52, paddingTop: 1 }}>
                            {icon} {label.split(" ")[0]}<br />
                            <span style={{ color: T.textMuted }}>{pg ? `p${pg}` : "—"} · {pct?.toFixed(0)}%</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.55 }}>{m.description}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Scene Rhythm side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
              {compareItems.map((entry, i) => {
                const c = i === 0 ? T.fwColors.three_act : T.fwColors.story_circle;
                return (
                  <div key={entry.id} style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "18px 16px 12px" }}>
                    <SectionLabel>{entry.title} — Scene Rhythm</SectionLabel>
                    <SceneLengthChart scenes={entry.scenes || []} color={c} showPages={false} totalPages={entry.totalPages} />
                  </div>
                );
              })}
            </div>

            {comparingLoading && <Loader color={naturalColor} label="GENERATING COMPARISON…" sublabel="Analyzing structural and pacing differences" />}

            {comparison && (() => {
              const hasOutline = compareItems[0].isOutline || compareItems[1].isOutline;
              const outlineEntry  = compareItems[0].isOutline ? compareItems[0] : compareItems[1];
              const refEntry      = compareItems[0].isOutline ? compareItems[1] : compareItems[0];
              const outlineColor  = compareItems[0].isOutline ? T.fwColors.three_act : T.fwColors.story_circle;
              const refColor      = compareItems[0].isOutline ? T.fwColors.story_circle : T.fwColors.three_act;

              // Structural gap table data — client-side math, no API
              const gapRows = (() => {
                if (!hasOutline) return [];
                const rows = [];
                const kmKeys = [
                  ["incitingIncident", "◉", "Inciting Incident", [10, 25]],
                  ["midpoint",         "◆", "Midpoint",          [40, 60]],
                  ["climax",           "▲", "Climax",            [82, 100]],
                ];
                kmKeys.forEach(([key, icon, label, range]) => {
                  const refKM  = refEntry.keyMoments?.[key];
                  const olKM   = outlineEntry.keyMoments?.[key];
                  const refPos = refKM?.position ?? null;
                  const olPos  = olKM?.position  ?? null;
                  if (refPos == null && olPos == null) return;
                  const delta  = (refPos != null && olPos != null) ? (olPos - refPos) : null;
                  const severity = delta == null ? "missing"
                    : Math.abs(delta) <= 5 ? "good"
                    : Math.abs(delta) <= 12 ? "warn"
                    : "alert";
                  rows.push({ icon, label, refPos, olPos, delta, severity });
                });
                // Act breaks — compare count and rough positions
                const refBreaks = refEntry.naturalStructure?.actBreaks || [];
                const olBreaks  = outlineEntry.naturalStructure?.actBreaks || [];
                refBreaks.forEach((ab, i) => {
                  const olAb   = olBreaks[i];
                  const refPos = ab.position ?? null;
                  const olPos  = olAb?.position ?? null;
                  const delta  = (refPos != null && olPos != null) ? (olPos - refPos) : null;
                  const severity = olPos == null ? "missing"
                    : delta == null ? "missing"
                    : Math.abs(delta) <= 5 ? "good"
                    : Math.abs(delta) <= 12 ? "warn"
                    : "alert";
                  rows.push({ icon: "◇", label: `Act ${ab.actNumber} Break`, refPos, olPos, delta, severity });
                });
                return rows;
              })();

              const severityColor = s => s === "good" ? T.colorSuccess : s === "warn" ? T.colorWarning : s === "alert" ? T.colorError : T.textMuted;
              const severityLabel = (s, delta) => {
                if (s === "missing") return "—";
                if (s === "good")  return `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`;
                if (s === "warn")  return `${delta > 0 ? "+" : ""}${delta.toFixed(0)}% ⚠`;
                return `${delta > 0 ? "+" : ""}${delta.toFixed(0)}% ✕`;
              };

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontSize: 18, fontStyle: "italic", color: T.textPrimary, lineHeight: 1.5, padding: "4px 0" }}>{comparison.headline}</div>

                  {/* Structural Gap Table — outline comparisons only */}
                  {hasOutline && gapRows.length > 0 && (
                    <div style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "20px 22px" }}>
                      <SectionLabel>Structural Position Map</SectionLabel>
                      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontSans, marginBottom: 16, lineHeight: 1.5 }}>
                        Where your outline places key structural moments vs. the reference script. Delta is outline minus reference — negative means yours runs earlier.
                      </div>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 72px", gap: 0,
                        borderBottom: `1px solid ${T.borderSubtle}`, paddingBottom: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 1.5 }}>MOMENT</div>
                        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: refColor, letterSpacing: 1.5, textAlign: "right" }}>
                          {refEntry.title.slice(0, 14).toUpperCase()}
                        </div>
                        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: outlineColor, letterSpacing: 1.5, textAlign: "right" }}>
                          YOUR OUTLINE
                        </div>
                        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 1.5, textAlign: "right" }}>DELTA</div>
                      </div>
                      {gapRows.map((row, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 72px",
                          borderBottom: i < gapRows.length - 1 ? `1px solid ${T.borderSubtle}` : "none",
                          padding: "10px 0", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: T.accent }}>{row.icon}</span>
                            <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: T.fontSans }}>{row.label}</span>
                          </div>
                          <div style={{ fontSize: 12, fontFamily: T.fontMono, color: row.refPos != null ? refColor : T.textDim, textAlign: "right" }}>
                            {row.refPos != null ? `${row.refPos.toFixed(0)}%` : "—"}
                          </div>
                          <div style={{ fontSize: 12, fontFamily: T.fontMono, color: row.olPos != null ? outlineColor : T.textDim, textAlign: "right" }}>
                            {row.olPos != null ? `${row.olPos.toFixed(0)}%` : "—"}
                          </div>
                          <div style={{ fontSize: 11, fontFamily: T.fontMono, color: severityColor(row.severity), textAlign: "right", fontWeight: 600 }}>
                            {severityLabel(row.severity, row.delta)}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
                        {[["good", "Within 5%"], ["warn", "6–12% off"], ["alert", "13%+ off"]].map(([s, lbl]) => (
                          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor(s) }} />
                            <span style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 1 }}>{lbl}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Written analysis */}
                  <div style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "20px 22px" }}>
                    <SectionLabel>{hasOutline ? "Reference Analysis" : "Structural Analysis"}</SectionLabel>
                    {comparison._truncated && (
                      <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.colorWarning, letterSpacing: 1, marginBottom: 10 }}>
                        ⚠ RESPONSE TRUNCATED — some analysis text may be incomplete
                      </div>
                    )}
                    <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{comparison.comparison}</div>
                  </div>

                  {/* Strengths panels */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { entry: compareItems[0], items: comparison.scriptAStrengths, color: T.fwColors.three_act },
                      { entry: compareItems[1], items: comparison.scriptBStrengths, color: T.fwColors.story_circle },
                    ].map((col, i) => (
                      <div key={i} style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "18px 20px" }}>
                        <SectionLabel>{col.entry.title} — {col.entry.isOutline ? "What's Working" : "Strengths"}</SectionLabel>
                        {(col.items || []).map((item, j) => (
                          <div key={j} style={{ display: "flex", gap: 10, marginBottom: 9 }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: col.color, flexShrink: 0, marginTop: 6 }} />
                            <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>{item}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Key differences */}
                  <div style={{ background: T.bgPanel, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusLg, padding: "18px 20px" }}>
                    <SectionLabel>Key Structural Differences</SectionLabel>
                    {(comparison.keyDifferences || []).map((diff, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontFamily: T.fontMono, color: naturalColor, minWidth: 18 }}>{i + 1}.</div>
                        <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>{diff}</div>
                      </div>
                    ))}
                  </div>

                  {/* Development notes — outline comparisons only */}
                  {hasOutline && comparison.developmentNotes?.length > 0 && (
                    <div style={{ background: T.bgPanel, border: `1px solid ${T.accent}30`, borderRadius: T.radiusLg, padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <SectionLabel style={{ margin: 0 }}>Before You Write It Out</SectionLabel>
                        <span style={{ fontSize: 8, fontFamily: T.fontMono, letterSpacing: 1.8, color: T.accent,
                          background: T.accent + "18", border: `1px solid ${T.accent}35`,
                          borderRadius: "3px", padding: "2px 7px" }}>DEVELOPMENT NOTES</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontSans, marginBottom: 14, lineHeight: 1.5 }}>
                        Based on what {refEntry.title} demonstrates structurally, here is what to address in your outline before drafting the screenplay.
                      </div>
                      {(comparison.developmentNotes || []).map((note, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                          <div style={{ fontSize: 11, fontFamily: T.fontMono, color: T.accent,
                            background: T.accent + "15", border: `1px solid ${T.accent}30`,
                            borderRadius: "3px", minWidth: 22, height: 22, display: "flex",
                            alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                          <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.65 }}>{note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}


        {/* ════ ABOUT ════ */}
        {PUBLIC_MODE && screen === "about" && (() => {
          const H1 = ({ children }) => (
            <h2 style={{ margin: "0 0 28px", fontSize: 28, fontWeight: 700, letterSpacing: 1.5,
              fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary }}>{children}</h2>
          );
          const H2 = ({ children }) => (
            <h3 style={{ margin: "40px 0 10px", fontSize: 11, fontWeight: 600, letterSpacing: 2,
              fontFamily: T.fontMono, textTransform: "uppercase", color: T.accent }}>{children}</h3>
          );
          const P = ({ children }) => (
            <p style={{ margin: "0 0 18px", fontSize: 14, color: T.textSecondary,
              lineHeight: 1.9, fontFamily: T.fontSans, fontWeight: 300 }}>{children}</p>
          );
          const Rule = () => (
            <div style={{ borderTop: `1px solid ${T.borderSubtle}`, margin: "36px 0" }} />
          );
          return (
            <div style={{ marginTop: 48, maxWidth: 620 }}>
              <H1>About the Project</H1>

              <P>I built ScriptGraph because I kept asking the same question while writing and studying scripts:</P>
              <P><em style={{ color: T.textPrimary, fontStyle: "italic" }}>Why do some movies feel the way they do?</em></P>
              <P>Not just whether they're good or bad. But the sensation of watching them. Some films feel like they're tightening a screw the entire time. Some feel calm until suddenly they aren't. Some escalate in waves. Others climb steadily and never look back.</P>
              <P>I was in the middle of writing a script and I found myself wondering whether it had the narrative propulsion I hoped it would. Not on any given page — I could feel that — but across the whole shape of it. Whether the pressure was building the way I imagined it was.</P>
              <P>I'd always been struck by Kurt Vonnegut's idea that stories have shapes — that you could draw the arc of a narrative the way you'd draw a curve on a graph. He was making a broader point about story types, but I kept wondering whether that could be applied to actual screenplays. Whether the shape of a specific film was something you could actually see.</P>
              <P>So I built something to find out. I wanted to compare what I was writing against films I admired — to see whether my story moved the way theirs did.</P>
              <P>When you're inside a script, those patterns are hard to see. Writing is microscopic work. You're thinking about scenes, lines, beats, transitions. The overall shape disappears into the details.</P>
              <P>I wanted a way to step back and see the whole thing at once. The result is a curve that shows how tension builds, releases, and turns across a story.</P>

              <Rule />
              <H2>What the graphs represent</H2>
              <P>Each graph maps the dramatic intensity of a screenplay scene by scene — based on what actually happens in it, not where it falls in the story. Physical danger and emotional devastation are scored on the same scale. A quiet drama about grief can hit the same peaks as a thriller, if the content earns it.</P>
              <P>Vonnegut's graphs tracked fortune — good and bad things happening to the protagonist. ScriptGraph tracks tension — the pressure an audience feels, regardless of outcome. A character can be winning while the audience is terrified it's about to collapse. A disaster can have already happened and the tension already gone. Fortune is visible from the outside; tension is what you feel watching. For understanding how a screenplay moves, tension is the more honest measure.</P>
              <P>This means the graphs are honest about what they find. A flat curve across a script is meaningful data — it means the story never genuinely escalates. A jagged, unpredictable curve reflects a script that keeps shifting the pressure. The shape is the information.</P>
              <P>Story structure is not math. Two smart readers can disagree about where a turning point really happens, and both can be right. These graphs aren't meant to declare definitive answers. They're meant to provide a consistent way of seeing how a story moves — and to make that visible in a form you can actually compare across films.</P>
              <P>For comparative purposes, every script is resolved to a three-act framework regardless of its actual form. A non-linear film, a triptych, a circular narrative — all are mapped through the same structural lens so curves can be read side by side. The structure type label on each script tells you how the story is actually organized. The act markers show you where the strongest structural pivots fall within that form.</P>
              <P>The value isn't in pinpointing a single page number. The value is in seeing the overall shape.</P>

              <Rule />
              <H2>How the analysis works</H2>
              <P>Each script is analyzed by reading the actual screenplay text — not a synopsis or summary. The PDF is parsed scene by scene, and each scene is scored for dramatic intensity based on what is literally happening in it: what characters do, say, and experience. Those scores are aggregated into the tension curve you see on the graph.</P>
              <P>Structural markers — act breaks, inciting incident, midpoint, climax — are identified through a multi-pass process. A first pass reads the whole script to place candidates. A second pass scores every scene individually. A third pass validates the structural placements against the actual scene content, replacing candidates that don't hold up. The result is then checked against positional logic — a midpoint that lands in the last third gets corrected automatically.</P>
              <P>Everything runs on the text of the screenplay itself. The analysis doesn't know what the film looks like, how it was shot, or how audiences responded to it. It only knows what's on the page.</P>
              <P><em>Scene summaries and structural markers are generated by AI analysis and may contain minor inaccuracies. The graphs are the point — use them to see how a story moves, where it breathes, and where it escalates. Individual scene details are context, not the claim.</em></P>

              <Rule />
              <H2>A note on the scripts</H2>
              <P>ScriptGraph analyzes structure — it doesn't reproduce screenplay text. What you're seeing are derived graphs, scene counts, and structural observations, not the works themselves.</P>
              <P>All scripts analyzed here are produced films whose screenplays have been publicly released or widely circulated. All rights to the underlying works remain with their authors and rights holders. This is a non-commercial educational project.</P>

              <Rule />
              <p style={{ margin: 0, fontSize: 13, color: T.textMuted, fontFamily: T.fontSans, fontStyle: "italic", fontWeight: 300 }}><a href="https://petecapo.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none", borderBottom: `1px solid ${T.textMuted}40` }}>— Pete Capo</a></p>
            </div>
          );
        })()}

        {/* ════ STUDIO ════ */}
        {PUBLIC_MODE && screen === "studio" && (
          <PublishStudio
            T={T}
            insights={(() => {
              const INSIGHTS = [
                {
                  title: "Genre as Trojan Horse",
                  subtitle: "2025 Oscar Winner — Best Original Screenplay",
                  body: "Sinners disguises itself as horror. What Coogler is actually doing — tracing the roots of American music, the theft of Black culture — takes nearly 40% of the script to build. The prologue earns that patience. You already know something terrible is coming. So the wait feels like dread, not drag.",
                  films: [{ slug: "sinners", color: T.accent, label: "Sinners" }],
                },
                {
                  title: "The Safdie Climb",
                  body: "Most screenplays breathe — peaks followed by release. The Safdie films don't. Uncut Gems and Marty Supreme both start high and almost never come down. It's a structural choice that explains the physiological experience of watching them — a foot on the pedal that never lifts.",
                  films: [
                    { slug: "uncut-gems", color: T.fwColors.three_act, label: "Uncut Gems" },
                    { slug: "marty-supreme", color: T.fwColors.story_circle, label: "Marty Supreme" },
                  ],
                },
                {
                  title: "Tarantino's Heartbeat",
                  body: "Both written by Tarantino. The heartbeat is there in both — sharp peaks, deep valleys, almost metronomic. You could argue he found the signature in True Romance, his first produced script, and perfected it by Pulp Fiction.",
                  films: [
                    { slug: "pulp-fiction", color: T.fwColors.three_act, label: "Pulp Fiction" },
                    { slug: "true-romance", color: T.fwColors.story_circle, label: "True Romance" },
                  ],
                },
                {
                  title: "Tension Isn't Everything",
                  body: "It's one of my favorite films. The graph is almost flat — no towering peaks, no relentless climb. That's not a flaw. Some films work through accumulation, through feeling, through the weight of an idea. The direction matters too. Not every story needs to tighten a screw.",
                  films: [{ slug: "eternal-sunshine-of-the-spotless-mind", color: T.accent, label: "Eternal Sunshine" }],
                },
              ];
              return INSIGHTS;
            })()}
            onDownloadInsight={downloadInsightCard}
            library={library}
          />
        )}

        {/* ════ DOCS ════ */}
        {!PUBLIC_MODE && screen === "docs" && (() => {
          const H1 = ({ children }) => (
            <h2 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, letterSpacing: 1.5,
              fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary }}>{children}</h2>
          );
          const H2 = ({ children }) => (
            <h3 style={{ margin: "32px 0 6px", fontSize: 13, fontWeight: 600, letterSpacing: 2,
              fontFamily: T.fontMono, textTransform: "uppercase", color: T.accent }}>{children}</h3>
          );
          const H3 = ({ children }) => (
            <h4 style={{ margin: "22px 0 4px", fontSize: 11, fontWeight: 600, letterSpacing: 1.5,
              fontFamily: T.fontMono, textTransform: "uppercase", color: T.textSecondary }}>{children}</h4>
          );
          const P = ({ children, style }) => (
            <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textSecondary,
              lineHeight: 1.85, fontFamily: T.fontSans, fontWeight: 300, ...style }}>{children}</p>
          );
          const Code = ({ children }) => (
            <code style={{ fontFamily: T.fontMono, fontSize: 11, color: T.accent,
              background: T.accent + "12", borderRadius: 3, padding: "1px 6px" }}>{children}</code>
          );
          const Rule = () => (
            <div style={{ borderTop: `1px solid ${T.borderSubtle}`, margin: "28px 0" }} />
          );
          const Note = ({ children }) => (
            <div style={{ background: T.bgCard, border: `1px solid ${T.borderMid}`,
              borderRadius: T.radiusMd, padding: "12px 16px", margin: "16px 0",
              fontSize: 12, color: T.textSecondary, lineHeight: 1.8, fontFamily: T.fontSans }}>
              {children}
            </div>
          );
          const Field = ({ name, type, children }) => (
            <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 180, flexShrink: 0 }}>
                <Code>{name}</Code>
                {type && <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginLeft: 6 }}>{type}</span>}
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7, fontFamily: T.fontSans }}>{children}</div>
            </div>
          );

          return (
            <div style={{ marginTop: 48, maxWidth: 820 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginBottom: 32 }}>
                <h1 style={{ margin: 0, fontSize: 48, fontWeight: 700, letterSpacing: 2,
                  fontFamily: T.fontDisplay, textTransform: "uppercase", color: T.textPrimary }}>
                  Documentation
                </h1>
              </div>

              {/* Tab toggle */}
              <div style={{ display: "flex", gap: 0, marginBottom: 40, background: T.bgCard,
                borderRadius: T.radiusMd, padding: 3, border: `1px solid ${T.borderSubtle}`, width: "fit-content" }}>
                {[["user","User Guide"],["technical","Technical Reference"]].map(([id, label]) => (
                  <button key={id} onClick={() => setDocsTab(id)} style={{
                    padding: "7px 24px", borderRadius: "4px", border: "none", cursor: "pointer",
                    fontSize: 11, fontFamily: T.fontMono, letterSpacing: 1.2, textTransform: "uppercase",
                    background: docsTab === id ? T.accent + "20" : "transparent",
                    color: docsTab === id ? T.accent : T.textMuted,
                    borderRight: id === "user" ? `1px solid ${T.borderSubtle}` : "none",
                    transition: "all 0.15s",
                  }}>{label}</button>
                ))}
              </div>

              {/* ── USER GUIDE ── */}
              {docsTab === "user" && (
                <div>
                  <H1>User Guide</H1>
                  <P style={{ color: T.textMuted, fontSize: 14 }}>
                    What ScriptGraph does, how to read its outputs, and how to get the most out of your analysis.
                  </P>

                  <Rule />
                  <H2>What ScriptGraph Is</H2>
                  <P>
                    ScriptGraph analyzes the structure of screenplays and development outlines. Upload a script or paste an outline, and it produces a tension arc, identifies key structural moments, and maps the story's natural shape — without imposing any framework on it.
                  </P>
                  <P>
                    The analysis is a cold read. The model reads your material the same way a skilled script editor would on a first pass: looking for where the story shifts, where energy builds or releases, and what the underlying shape of the narrative actually is — not what it's supposed to be according to a template.
                  </P>

                  <Rule />
                  <H2>Uploading Material</H2>
                  <H3>Screenplay PDFs</H3>
                  <P>
                    ScriptGraph works with text-based PDFs exported from Final Draft, WriterDuet, Highland, Fade In, or any screenwriting software that produces a real PDF (not a scan). It extracts page numbers, scene headings, action lines, and character cues. Scanned PDFs will not work — the app will tell you if it can't extract text.
                  </P>
                  <H3>Development Outlines</H3>
                  <P>
                    Paste your outline directly into the text area, or upload a .txt or .pdf file. The parser handles any format — scene headings, numbered sequences, or flowing paragraphs. The richer your scene descriptions, the more textured the tension curve. A one-line-per-scene beat sheet will produce a rougher arc than a full scene-by-scene breakdown with descriptions.
                  </P>
                  <Note>
                    <strong style={{ color: T.textPrimary }}>Outlines vs. Scripts:</strong> When analyzing an outline, scene positions are derived from their order in the document rather than page numbers. The tension arc reflects the narrative energy described in each scene, not the physical length of the writing. Page-specific stats (pages, avg scene length) are not shown for outlines.
                  </Note>
                  <H3>Hybrid Documents</H3>
                  <P>
                    Some documents contain finished screenplay writing in the early sections and outline/description in the later sections — a common state for scripts in development. ScriptGraph detects this format shift automatically. When detected, a dashed blue FORMAT SHIFT line appears on the tension arc at the transition point, and the model is instructed to treat both halves as equally valid narrative evidence when identifying structure and placing key moments.
                  </P>
                  <P>
                    Library cards for outlines and hybrid documents display an OUTLINE or IN DEVELOPMENT badge below the title so you can distinguish them from finished scripts at a glance.
                  </P>

                  <Rule />
                  <H2>Reading the Tension Arc</H2>
                  <P>
                    The tension arc is a rough proxy for the story's energy across its runtime. A value of 10 means peak dramatic intensity — the highest-stakes moments, whether that's physical danger, emotional devastation, or irreversible loss. A value near 0 means deliberate low tension: breathing room, quiet character moments, setup. Most stories move between 3 and 8 with spikes at key turns. Character-driven dramas and genre films are scored on the same scale — a quiet film about grief can earn the same peaks as a thriller if the content warrants it.
                  </P>
                  <P>
                    The Y-axis is always fixed from 0 to 10. This is intentional — it lets you compare curves across different scripts without the scale adjusting to each one.
                  </P>
                  <P>
                    The curve is smoothed slightly (rolling average of 3 samples) to reduce noise. The underlying values are still the model's raw reads — the smoothing just makes the shape easier to read visually.
                  </P>
                  <H3>Act Bands</H3>
                  <P>
                    The colored bands behind the curve show the act structure the model identified. Act 2 is split at the midpoint — the left half is 2A (the protagonist reacting, getting worse), the right half is 2B (the protagonist driving, escalating toward climax). This split is only shown when the midpoint is identified.
                  </P>
                  <H3>Markers on the Curve</H3>
                  <P>
                    Structural markers sit directly on the tension curve at the position they occur. The inciting incident (◉), midpoint (◆), and climax (▲) are key moments. Rapid sequences (≡) are clusters of short, fast scenes. Sustained scenes (━) are single long scenes that hold tension. Act break diamonds (◇) appear near the top of the chart. For hybrid documents, a dashed vertical line marks the format shift point.
                  </P>
                  <P>
                    The full marker list with descriptions appears in the panel below the chart. The Format Shift entry only appears in the legend when a transition was detected.
                  </P>

                  <Rule />
                  <H2>Key Moments</H2>
                  <P>
                    ScriptGraph identifies three structural moments in every analysis:
                  </P>
                  <H3>Inciting Incident</H3>
                  <P>
                    The moment that shatters the protagonist's ordinary world and forces the story into motion. Typically falls in the first 10–25% of the script. The story cannot return to its pre-incident state after this.
                  </P>
                  <H3>Midpoint</H3>
                  <P>
                    The moment where the protagonist shifts from reacting to driving the story. Typically falls near the 50% mark (the model validates it against a 40–60% window). Often a false victory, a revelation, or an identity shift that raises the stakes.
                  </P>
                  <H3>Climax</H3>
                  <P>
                    The highest-tension confrontation between the protagonist and the ultimate obstacle. Typically falls in the final 15% of the script. Resolves the main story question and completes the character arc.
                  </P>
                  <Note>
                    <strong style={{ color: T.textPrimary }}>Confidence levels:</strong> Each key moment carries a confidence rating (high / medium / low) and a brief ruling explaining why it was identified or adjusted. A green ✓ VALIDATED badge means the model confirmed the moment against structural criteria. An amber ⚠ CORRECTED badge means the original identification was replaced — the ruling will explain what changed and why. Outline analyses skip Phase 1C validation but the client-side midpoint sanity check still runs.
                  </Note>

                  <Rule />
                  <H2>The Library</H2>
                  <P>
                    Every analysis is automatically saved to your library when it completes. Re-analyzing the same title replaces the old entry. The library holds up to 30 scripts.
                  </P>
                  <P>
                    You can search by title, logline, or genre using the search bar. Genre filter chips let you narrow to a specific genre across all saved scripts. Outline and hybrid entries show OUTLINE or IN DEVELOPMENT badges on their cards. Outline cards show scene count rather than page count and suppress the avg scene length stat.
                  </P>
                  <P>
                    Library data is stored locally in your browser. Clearing your browser data will erase your library. There is currently no cloud sync.
                  </P>

                  <Rule />
                  <H2>Comparing Scripts</H2>
                  <P>
                    Select two scripts in the library using the Compare button on each card. A tray appears at the bottom of the screen showing your two selections. When both slots are filled, the Compare → button runs a structural comparison.
                  </P>
                  <P>
                    The comparison view overlays both tension curves and places all structural markers from both scripts on a shared timeline. You can view normalized (both scripts scaled to 100%) or true-length (scaled to actual page count). A written analysis appears below the chart.
                  </P>
                  <H3>Comparing an Outline to a Finished Script</H3>
                  <P>
                    When one of the two entries is an outline or development document, the comparison shifts into development mode. The analysis frames itself from the writer's perspective — what does the reference script demonstrate, and what should the writer consider before drafting?
                  </P>
                  <P>
                    A Structural Position Map appears at the top of the analysis. This is a client-side table (no extra API call) showing where each key moment and act break lands in both the reference script and your outline, with a delta column showing how far off each position is. Green means within 5%, amber means 6–12% off, red means 13%+ off.
                  </P>
                  <P>
                    A Before You Write It Out panel appears at the bottom with numbered development recommendations generated by the model — specific, actionable notes based on what the reference script demonstrates structurally. The outline's strengths panel is labeled What's Working rather than Strengths to reflect that the work is in progress.
                  </P>

                  <Rule />
                  <H2>Limitations to Keep in Mind</H2>
                  <P>
                    The tension arc is an interpretation, not a measurement. Two analysts reading the same script would produce slightly different curves. ScriptGraph's curve reflects one cold read — useful for pattern recognition and comparison, not as a definitive verdict on any scene.
                  </P>
                  <P>
                    Key moment placement is validated against structural criteria, but the model can still be wrong — especially in unconventional scripts that subvert traditional structure. The confidence levels and rulings are there to help you calibrate trust in each identification.
                  </P>
                  <P>
                    Outlines produce less precise curves than finished scripts. The model can only work with what's on the page — sparse descriptions produce sparse analysis. The format shift detector works best when the finished portion contains clear screenplay formatting (INT./EXT. headings, character cues, dialogue). Outlines written entirely as prose paragraphs will not trigger a detected transition even if they are hybrid documents.
                  </P>
                </div>
              )}

              {/* ── TECHNICAL REFERENCE ── */}
              {docsTab === "technical" && (
                <div>
                  <H1>Technical Reference</H1>
                  <P style={{ color: T.textMuted, fontSize: 14 }}>
                    Architecture, data flow, schema, design decisions, and build notes for developers continuing this project.
                  </P>

                  <Rule />
                  <H2>System Overview</H2>
                  <P>
                    ScriptGraph is a single-file React artifact running entirely in the browser. There is no backend. All analysis runs through direct calls to the Anthropic Claude API using the <Code>anthropic-dangerous-direct-browser-access</Code> header. All storage uses the Claude artifact persistent storage API (<Code>window.storage</Code>).
                  </P>
                  <P>
                    The app has two intake paths — screenplay PDF and development outline — that converge at a shared <Code>parsed</Code> object. Everything downstream (results screen, charts, library, comparison) consumes that object without knowing or caring which intake path produced it.
                  </P>

                  <Rule />
                  <H2>Analysis Pipeline — Script Path</H2>
                  <H3>Phase 1A — Structural Analysis</H3>
                  <P>
                    Sends a compressed representation of the script (scene headings + first 2 action lines per scene, all page-tagged) plus a full ground-truth scene index to the model. Returns: title, logline, totalPages, totalScenes, protagonist, antagonistOrConflict, genre, tone, themes, naturalStructure (actCount + actBreaks with scene numbers), keyMoments (incitingIncident, midpoint, climax — scene numbers only), and overallTension (exactly 40 values 0–10). Max tokens: 6000.
                  </P>
                  <P>
                    Act breaks and key moments return scene numbers — not page numbers. Page numbers are resolved client-side by looking up the scene number in the ground-truth skeleton index. This prevents the model from hallucinating pages that don't exist.
                  </P>
                  <H3>Phase 1B — Scene Enrichment</H3>
                  <P>
                    Processes scenes in batches of 50. Each batch receives the scene skeletons plus rich content extracted by line index (not page number) from the raw tagged lines, including dialogue. Key moment scenes are flagged with ★KEY MOMENT★ for priority treatment and must produce especially precise summaries. Returns: summary, tension (0–10), turningPoint (boolean), turningPointNote per scene. Each batch is wrapped in try/catch — a failed batch falls back to skeleton defaults and does not kill the full analysis. Max tokens: 4000 per batch. Temperature: 0.
                  </P>
                  <P>
                    <strong style={{ color: T.textPrimary }}>Tension scoring:</strong> Scores are content-based, not position or genre-based. Physical danger and emotional/psychological stakes are treated equally — a devastating confession or relationship collapse can score as high as a chase scene. The full 1–10 scale applies to all genres including quiet dramas, so character-driven films are not artificially flattened. Anti-fabrication rules instruct the model never to invent events or character deaths not present in the scene content.
                  </P>
                  <P>
                    <strong style={{ color: T.textPrimary }}>Content extraction:</strong> Scene boundaries are determined by line index (lineStart / lineEnd), not page numbers. This fixes a common failure mode where multiple short scenes on the same page shared content pools, diluting summaries for fast-cutting sequences.
                  </P>
                  <H3>Phase 1C — Key Moment Validation</H3>
                  <P>
                    After Phase 1B, the Phase 1A key moment candidates are validated against explicit structural criteria. Each candidate scene receives its full content (up to 1500 chars) plus summaries of the ±3 neighboring scenes, giving the validator context to make informed replacements. The validator returns: verdict (confirmed / replaced / none), replacement sceneNumber if needed, confidence (high / medium / low), and a ruling. Collision prevention: act break scene numbers are explicitly listed and the validator is told not to reuse them as key moments. Act break criteria include an explicit rule that the break is the last scene of the act ending — not the first scene of the next act. Max tokens: 3000. Temperature: 0.
                  </P>
                  <H3>Midpoint Ruling Mismatch Correction</H3>
                  <P>
                    Phase 1C sometimes returns the correct reasoning but the wrong scene number for the midpoint. A client-side correction function (<Code>applyMidpointRulingCorrection</Code>) scans the ruling text for Scene #N references and uses the last reference (the one the model argues for, not the one it rejects) to correct the sceneNumber. This runs at both analysis time and display time when opening a saved entry, so existing JSONs benefit without re-analysis.
                  </P>
                  <H3>Client-Side Midpoint Sanity Check</H3>
                  <P>
                    After Phase 1C resolves the midpoint, a client-side check runs: (1) is the midpoint position outside 35–72%? (2) is the midpoint scene the same as an act break? If either is true, the check searches enriched scenes for turning-point scenes in the 35–72% window and picks the one closest to 50%, substituting it with a "replaced" validation note. The window extends to 72% to accommodate slow-burn and character-driven stories where the structural pivot happens later than convention. This runs on both the script path and the outline path.
                  </P>

                  <Rule />
                  <H2>Analysis Pipeline — Outline Path</H2>
                  <H3>Format Transition Detection</H3>
                  <P>
                    Before any API call, <Code>detectFormatTransition(rawScenes)</Code> scans the raw scene array for the shift from finished screenplay to outline/description format. It scores each scene for screenplay markers (INT./EXT. headings, character cues in ALL CAPS, dialogue density), smooths the scores with a window of 3, then finds the first scene where the score drops below 40% of the first-half average. Returns <Code>{"{ transitionScene, transitionPct, confidence }"}</Code>. If no meaningful transition is found, all values are null and the prompts behave as standard outline mode.
                  </P>
                  <P>
                    When a transition is detected, the format hint is injected into both Phase OA and OB prompts, instructing the model to treat both halves as equally valid narrative evidence and commit to structural placements regardless of which half they fall in.
                  </P>
                  <H3>Phase OA — Structural Analysis</H3>
                  <P>
                    Parallel to Phase 1A. No page numbers — positions derived from scene index. When a format hint is present, the prompt explicitly names the transition scene and instructs the model not to favor the finished half. Same JSON schema as Phase 1A output. Max tokens: 6000.
                  </P>
                  <H3>Phase OB — Scene Enrichment</H3>
                  <P>
                    Parallel to Phase 1B in batches of 50. When a format hint is present, scenes are tagged as finished vs. described in the prompt, and the model is instructed to calibrate tension values to dramatic stakes rather than prose density. Max tokens: 4000 per batch.
                  </P>
                  <P>
                    There is no Phase OC — the outline path skips key moment validation because outline scenes lack the content density needed for reliable structural validation. The client-side midpoint sanity check still runs.
                  </P>
                  <P>
                    Scene positions are derived from <Code>sceneIndex / totalScenes * 100</Code> rather than page numbers. The <Code>isOutline: true</Code> flag on the parsed object is the only signal downstream code uses — all conditional display logic keys off this single flag.
                  </P>

                  <Rule />
                  <H2>The parsed Object — Full Schema</H2>
                  <Note>This is the canonical output of both analysis paths. Every downstream component reads from this shape.</Note>
                  <Field name="title" type="string">Script or outline title as identified by the model.</Field>
                  <Field name="logline" type="string">1–2 sentence story summary.</Field>
                  <Field name="totalPages" type="number">Total page count (scripts) or total scene count (outlines).</Field>
                  <Field name="totalScenes" type="number">Total number of scenes identified.</Field>
                  <Field name="protagonist" type="string">Primary protagonist name.</Field>
                  <Field name="antagonistOrConflict" type="string">Primary antagonist or central conflict.</Field>
                  <Field name="genre" type="string">Genre as identified from the material.</Field>
                  <Field name="tone" type="string">Tonal description.</Field>
                  <Field name="themes" type="string[]">Array of thematic elements.</Field>
                  <Field name="isOutline" type="boolean?">Present and true only on outline analyses. Absent on script analyses.</Field>
                  <Field name="formatTransition" type="object?">Present when a hybrid document is detected. Shape: {"{ transitionScene: number, transitionPct: number, confidence: 'high'|'medium'|'low' }"}. Null when no transition detected or document is not an outline.</Field>
                  <Field name="overallTension" type="number[40]">Exactly 40 tension values 0–10, evenly spaced across the full runtime.</Field>
                  <Field name="naturalStructure.actCount" type="number">Number of acts as identified by the model (2, 3, or 4).</Field>
                  <Field name="naturalStructure.actBreaks" type="ActBreak[]">Array of act break objects. Each has: actNumber, sceneNumber, page, position (0–100), description, validation.</Field>
                  <Field name="naturalStructure.structuralPersonality" type="string">2–3 sentence description of what makes this story's structure distinctive.</Field>
                  <Field name="naturalStructure.pacingNotes" type="string">2–3 sentence description of pacing character.</Field>
                  <Field name="keyMoments.incitingIncident" type="KeyMoment">Resolved key moment object: sceneNumber, page, position, description, sceneHeading, validation.</Field>
                  <Field name="keyMoments.midpoint" type="KeyMoment">Same shape as incitingIncident.</Field>
                  <Field name="keyMoments.climax" type="KeyMoment">Same shape as incitingIncident.</Field>
                  <Field name="scenes" type="Scene[]">Array of enriched scene objects. Each has: number, heading, startPage, endPage, lengthPages, position, summary, tension, turningPoint, turningPointNote. Outline scenes also carry rawText.</Field>
                  <Field name="_truncated" type="boolean?">True if Phase 1A response was truncated. Indicates some fields may be incomplete.</Field>

                  <Rule />
                  <H2>Comparison — Outline Mode</H2>
                  <P>
                    When either entry in a comparison is an outline, <Code>buildComparisonPrompt</Code> detects this and switches to development mode. Page count comparisons are suppressed. The model is instructed to frame analysis from the writer's perspective and required to return a <Code>developmentNotes</Code> array of 3 actionable recommendations. The "strengths" label shifts to "what's working" for the outline entry.
                  </P>
                  <P>
                    The Structural Position Map is computed entirely client-side from the two entries' key moment and act break positions — no extra API call. It shows reference position, outline position, and delta for each moment, color-coded by deviation: green (within 5%), amber (6–12%), red (13%+).
                  </P>

                  <Rule />
                  <H2>Truncation Recovery</H2>
                  <P>
                    Claude API responses truncate at max_tokens. When a JSON response is cut mid-object, the app runs a three-step recovery: (1) find the last valid "safe end" position — after a closing brace, comma, or complete value; (2) strip any trailing partial key-value using regex; (3) use a stack-based bracket counter to close all unclosed objects and arrays in the correct order. The <Code>wasTruncated</Code> flag is set from <Code>stop_reason === "max_tokens"</Code> on all three parse paths.
                  </P>
                  <P>
                    For comparison responses, truncated JSON is handled differently: the prose content is extracted via regex from the partial JSON string and surfaced with a ⚠ TRUNCATED warning.
                  </P>

                  <Rule />
                  <H2>Storage</H2>
                  <P>
                    Storage key: <Code>scriptgraph_v11</Code>. This key is permanent unless a breaking schema change requires migration. Do not bump the version number for additive changes — only for changes that would make existing saved entries unreadable.
                  </P>
                  <P>
                    The library holds a maximum of 30 entries. Entries are deduped by title on save — re-analyzing a script replaces the old entry. The <Code>savedAt</Code> timestamp is set at save time, not analysis time.
                  </P>
                  <P>
                    Storage functions: <Code>loadLibrary()</Code> reads from <Code>window.storage.get</Code>, <Code>persistLibrary(arr)</Code> writes. Both are async. All library mutations go through these functions — never write to <Code>window.storage</Code> directly.
                  </P>
                  <P>
                    When opening a library entry via <Code>openEntry()</Code>, both <Code>isOutline</Code> and <Code>formatTransition</Code> must be explicitly passed through to the p1 state object. These fields are not part of the original OA response and will be lost on reopen if not included in the entry schema and the openEntry mapper.
                  </P>

                  <Rule />
                  <H2>Design Decisions & Rationale</H2>

                  <H3>Natural structure first — no framework imposed</H3>
                  <P>
                    The model reads the script cold and describes what it finds. Frameworks (three-act, Save the Cat, etc.) are available as a secondary mapping layer, but the primary analysis never starts from a framework. This produces more honest structural reads, especially for films that don't fit conventional templates.
                  </P>

                  <H3>Scene numbers, not page numbers, from the model</H3>
                  <P>
                    Phase 1A returns scene numbers for all structural positions. Page numbers are resolved client-side by looking up the scene in the ground-truth skeleton index. This prevents hallucinated page numbers — the model can only return a scene number that exists in the index it was given.
                  </P>

                  <H3>Phase 1C exists because Phase 1A is unreliable on its own</H3>
                  <P>
                    Without validation, key moment placements were frequently wrong — especially midpoints colliding with act breaks, and inciting incidents placed too late. Phase 1C validates candidates against explicit structural criteria with access to the full scene content. The client-side sanity check handles the residual cases Phase 1C misses.
                  </P>

                  <H3>Y-axis fixed 0–10, never auto-scaled</H3>
                  <P>
                    Auto-scaling makes curves look more similar than they are. A script that never exceeds tension 6 should look different from one that hits 9. Fixed scale preserves the meaningful signal across comparisons.
                  </P>

                  <H3>Smoothing window of 3</H3>
                  <P>
                    The tension curve is smoothed with a rolling average of 3 samples. This is the minimum that removes single-sample noise while preserving the genuine shape. Larger windows (5+) flatten meaningful spikes.
                  </P>

                  <H3>Act 2 split at midpoint</H3>
                  <P>
                    Act 2 is visually split into 2A and 2B at the midpoint position. This is a display convention, not a structural claim — the model does not identify "Act 2A" and "Act 2B" as separate acts. It exists because undivided Act 2 bands are visually overwhelming and the midpoint is the meaningful dividing event.
                  </P>

                  <H3>The outline path skips Phase 1C</H3>
                  <P>
                    Outline scenes typically lack the content density needed for reliable structural validation. A 3-sentence scene description doesn't give the validator enough to work with. The client-side midpoint sanity check still runs and catches the most common failure mode.
                  </P>

                  <H3>isOutline is a single flag, not a separate mode</H3>
                  <P>
                    The outline path produces the same parsed schema as the script path. <Code>isOutline: true</Code> is the only difference. This means all downstream code — charts, library, comparison — works for outlines without modification. Any display difference is a conditional on that single flag.
                  </P>

                  <H3>Format transition detection is heuristic, not definitive</H3>
                  <P>
                    <Code>detectFormatTransition</Code> scores scenes for screenplay markers and finds a sustained drop. It will miss transitions in documents where the finished portion uses minimal formatting, and may false-positive on outlines that use INT./EXT. headings throughout. When confidence is "low", no hint is injected and prompts behave as standard outline mode. The detector's value is in the high-confidence cases — a clear drop from formatted screenplay to prose description.
                  </P>

                  <H3>Comparison structural gap table is client-side</H3>
                  <P>
                    The Structural Position Map in outline comparisons is computed entirely from stored position values — no extra API call. This keeps the comparison cost the same regardless of whether an outline is involved, and makes the table appear instantly alongside the written analysis rather than waiting for a separate request.
                  </P>

                  <H3>Comparison doesn't use keyMoments directly</H3>
                  <P>
                    The comparison view rebuilds marker data from the saved entry objects rather than reading from the live p1 state. This is intentional — comparison needs to work with two independently saved entries, not the currently loaded script.
                  </P>

                  <Rule />
                  <H2>Known Limitations & Failure Modes</H2>
                  <H3>Phase 1B batch failures</H3>
                  <P>
                    If a Phase 1B batch fails (API error, malformed JSON), the scenes in that batch fall back to skeleton defaults: summary "(no summary)", tension 5, turningPoint false. The analysis completes but those scenes are hollow. This is visible in the All Scenes tab as scenes with no summary text.
                  </P>
                  <H3>Unconventional structure</H3>
                  <P>
                    Scripts with non-linear structure, anthology format, or deliberate framework subversion confuse the structural pipeline. Act break placement is often wrong. The tension arc may be meaningful even when the structural markers aren't.
                  </P>
                  <H3>Very short scripts</H3>
                  <P>
                    Scripts under 30 pages produce unreliable results. The 40-point tension curve has too few underlying data points to be meaningful. Short films work better analyzed as outlines.
                  </P>
                  <H3>Scanned PDFs</H3>
                  <P>
                    The app rejects scanned PDFs with an error message. There is no OCR fallback. Users need to obtain a text-based PDF from the original authoring software.
                  </P>
                  <H3>Format transition false negatives</H3>
                  <P>
                    Hybrid documents where the finished portion uses non-standard formatting (no INT./EXT. headings, no character cues) will not be detected as hybrid. The outline path will still run and produce valid structural analysis — it just won't inject the format hint or show the FORMAT SHIFT line on the tension arc.
                  </P>

                  <Rule />
                  <H2>Adding Scripts to the Public Library</H2>
                  <P>
                    The public library at scriptgraph.vercel.app is populated by JSON files in the <Code>public/library/</Code> folder of the repository. Each file is one complete analysis result. The <Code>manifest.json</Code> file in that folder is an array of filenames telling the app which scripts to load.
                  </P>
                  <H3>Step 1 — Run the analysis locally</H3>
                  <P>
                    Open the ScriptGraph Claude artifact (your local version with full upload capability). Upload the script PDF and run the full analysis as normal. Wait for it to complete and land on the results screen.
                  </P>
                  <H3>Step 2 — Export the JSON</H3>
                  <P>
                    Click <Code>↓ Export JSON</Code> in the nav bar. This downloads a <Code>.json</Code> file named after the script title to your Downloads folder. This file contains the complete analysis result — tension arc, scenes, key moments, structural analysis, everything.
                  </P>
                  <H3>Step 3 — Run the add-script helper</H3>
                  <P>
                    Open Terminal and run:
                  </P>
                  <Note>
                    <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.accent }}>bash ~/Desktop/ScriptGraph/scriptgraph/add-script.sh ~/Downloads/yourscript.json</code>
                  </Note>
                  <P>
                    Replace <Code>yourscript.json</Code> with the actual filename. The script will copy the file into <Code>public/library/</Code>, rebuild <Code>manifest.json</Code>, commit both files, and push to GitHub. Vercel deploys automatically — the script is live in approximately 60 seconds.
                  </P>
                  <H3>Removing a script</H3>
                  <P>
                    Delete the <Code>.json</Code> file from <Code>public/library/</Code>, then run the add-script helper with any file (it rebuilds the manifest from whatever remains). Or manually edit <Code>manifest.json</Code> to remove the filename, then push. The script will disappear from the public library on next deploy.
                  </P>
                  <H3>Reusing analyses from previous sessions</H3>
                  <P>
                    If a script was analyzed in an earlier Claude artifact session that is still open, navigate to it, open the results screen, and click <Code>↓ Export JSON</Code> — the export button works on any loaded result regardless of when it was analyzed. If the session is no longer accessible, re-analyze the script PDF using the local app to generate a fresh result.
                  </P>
                  <Note>
                    <strong style={{ color: T.textPrimary }}>Script sources:</strong> Use text-based PDFs from legitimate sources. The WGA Script Library (wga.org), IMSDB (imsdb.com), and Simply Scripts (simplyscripts.com) host produced screenplays that are widely used for study and education. Always verify a script's authenticity before publishing its analysis — fan-written or AI-generated scripts will produce meaningless structural data.
                  </Note>

                  <Rule />
                  <H2>Before Making Changes</H2>
                  <P>Always write a timestamped backup before touching the file. The file is ~4300 lines — a broken build is difficult to diagnose without a clean reference point.</P>
                  <P>The model string is <Code>claude-sonnet-4-20250514</Code>. Do not change this without testing all four API call sites (Phase 1A, 1B, 1C, Comparison).</P>
                  <P>The storage key is <Code>scriptgraph_v11</Code>. Do not bump this unless you are intentionally migrating saved data and have written migration logic. Bumping it orphans all existing library entries.</P>
                  <P>All new state variables belong inside <Code>ScriptGraph()</Code>. Prompt builder functions live outside the component. Display-only helper components (charts, panels) live before the component.</P>
                  <P>When adding fields to the outline auto-save entry, also add them to <Code>openEntry()</Code> or they will be lost when the entry is reopened from the library. <Code>isOutline</Code> and <Code>formatTransition</Code> are both examples of fields that must be explicitly mapped in both places.</P>
                </div>
              )}

            </div>
          );
        })()}

      </div>

      {/* ── Comparison Tray — fixed bottom, appears when 1–2 scripts selected ── */}
      {compareItems.length > 0 && screen === "library" && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: T.bgCard,
          borderTop: `1px solid ${T.borderMid}`,
          padding: "14px 48px",
          display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 -8px 32px #00000060",
          animation: "sgFadeIn 0.15s ease",
        }}>
          <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textMuted, letterSpacing: 2, textTransform: "uppercase", marginRight: 4 }}>
            Compare
          </span>

          {[0, 1].map(i => {
            const entry = compareItems[i];
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px 6px 14px",
                background: entry ? T.accent + "12" : T.bgPanel,
                border: `1px solid ${entry ? T.accent + "40" : T.borderSubtle}`,
                borderRadius: T.radiusMd,
                minWidth: 180, maxWidth: 280,
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 9, fontFamily: T.fontMono, color: T.accent, letterSpacing: 1, minWidth: 14 }}>
                  {i + 1}
                </span>
                {entry ? (
                  <>
                    <span style={{
                      fontSize: 12, fontFamily: T.fontDisplay, fontWeight: 700,
                      letterSpacing: 1, textTransform: "uppercase",
                      color: T.textPrimary, flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{entry.title}</span>
                    <button onClick={() => toggleCompare(entry)} style={{
                      background: "none", border: "none", color: T.textMuted,
                      cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1,
                    }}>✕</button>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontSans, fontStyle: "italic" }}>
                    Select a script…
                  </span>
                )}
              </div>
            );
          })}

          <Btn
            color={compareItems.length === 2 ? T.accent : T.borderMid}
            variant={compareItems.length === 2 ? "fill" : "ghost"}
            disabled={compareItems.length < 2}
            onClick={() => startCompare()}
          >
            Compare →
          </Btn>

          <button onClick={() => setCompareItems([])} style={{
            background: "none", border: "none", color: T.textMuted,
            cursor: "pointer", fontSize: 11, fontFamily: T.fontSans,
            padding: "4px 8px", marginLeft: "auto",
          }}>Clear all</button>
        </div>
      )}
      {/* ── Share Card modal ── */}
      {shareCard && (shareCard === "single" ? p1 : compareItems.length === 2) && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          background: "#00000090", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }} onClick={() => setShareCard(false)}>
          <div style={{
            background: T.bgPanel, border: `1px solid ${T.borderStrong}`,
            borderRadius: T.radiusLg, padding: "24px",
            width: 480, maxWidth: "100%",
            maxHeight: "calc(100vh - 48px)",
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 64px #00000080",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontFamily: T.fontSans, fontWeight: 600, color: T.textMuted, letterSpacing: 2.5, textTransform: "uppercase" }}>
                {shareCard === "compare"
                  ? `Share Image · ${compareItems[0]?.title} vs ${compareItems[1]?.title}`
                  : `Share Image · ${p1?.title}`}
              </div>
              <button onClick={() => setShareCard(false)} style={{
                padding: "3px 8px", background: "none",
                border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusSm,
                color: T.textMuted, fontSize: 11, fontFamily: T.fontSans,
                fontWeight: 500, cursor: "pointer", lineHeight: 1.4,
              }}>✕</button>
            </div>
            <div style={{
              borderRadius: T.radiusMd, overflow: "hidden",
              border: `1px solid ${T.borderMid}`, marginBottom: 16,
              background: T.bgPage, flexShrink: 1, minHeight: 0,
            }}>
              <div
                style={{ width: "100%", lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: (() => {
                  const svg = shareCard === "compare"
                    ? generateCompareCardSVG(compareItems[0], compareItems[1])
                    : generateShareCardSVG(p1);
                  return svg.replace(/width="\d+"/, 'width="100%"');
                })() }}
              />
            </div>
            <button onClick={() => downloadShareCard(shareCard)} style={{
              width: "100%", padding: "9px 0",
              background: T.accent + "20", border: `1px solid ${T.accent}`,
              borderRadius: T.radiusSm, color: T.accent,
              fontSize: 12, fontFamily: T.fontSans, fontWeight: 500,
              letterSpacing: 0.2, cursor: "pointer", transition: "all 0.12s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.accent + "30"}
            onMouseLeave={e => e.currentTarget.style.background = T.accent + "20"}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PNG
            </button>
          </div>
        </div>
      )}

      {/* ── Export JSON overlay — reliable cross-environment fallback ── */}
      {exportJson && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          background: "#00000090", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }} onClick={() => setExportJson(null)}>
          <div style={{
            background: T.bgCard, border: `1px solid ${T.borderMid}`,
            borderRadius: T.radiusLg, padding: "28px 28px 22px", maxWidth: 640, width: "100%",
            boxShadow: "0 24px 64px #00000080",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontFamily: T.fontMono, color: T.accent, letterSpacing: 1.5, marginBottom: 3 }}>
                  ↓ EXPORT JSON
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>{exportJson.filename}</div>
              </div>
              <button onClick={() => {
                navigator.clipboard?.writeText(exportJson.json).then(() => showToast("JSON copied to clipboard"));
              }} style={{
                padding: "7px 18px", background: T.accent + "20", border: `1px solid ${T.accent + "60"}`,
                borderRadius: T.radiusSm, color: T.accent, fontSize: 11, fontFamily: T.fontMono,
                letterSpacing: 1, cursor: "pointer",
              }}>Copy All</button>
            </div>
            <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.6, marginBottom: 14, fontFamily: T.fontSans }}>
              If the download didn't start automatically, copy the JSON below and save it as <code style={{ fontFamily: T.fontMono, color: T.accent }}>{exportJson.filename}</code>
            </div>
            <textarea readOnly value={exportJson.json} style={{
              width: "100%", height: 220, padding: 12, resize: "none",
              background: T.bgPage, border: `1px solid ${T.borderSubtle}`,
              borderRadius: T.radiusMd, color: T.textMuted, fontSize: 10,
              fontFamily: T.fontMono, lineHeight: 1.5, outline: "none",
            }} onClick={e => e.target.select()} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <Btn color={T.borderMid} variant="ghost" small onClick={() => setExportJson(null)}>Close</Btn>
            </div>
          </div>
        </div>
      )}
      {/* ── Toast notifications ── */}
      <Toast toasts={toasts} />

    </div>
  );
}
