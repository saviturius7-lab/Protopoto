const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";
const NLP_SCRIPT = path.join(__dirname, "backend", "nlp_engine.py");
const GENERATED_DIR = path.join(__dirname, "public", "generated");
const ALLOWED_NLP_CMDS = new Set(["ingest", "search", "topic", "delete_doc"]);

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_AI_BASE_URL = "https://ai.api.nvidia.com/v1";
const NVIDIA_CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-8b-instruct";
const NVIDIA_EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL || "nvidia/nv-embedqa-e5-v5";
const NVIDIA_VISION_MODEL = process.env.NVIDIA_VISION_MODEL || "nvidia/nv-yolox-page-elements-v1";
const NVIDIA_IMAGE_MODEL = process.env.NVIDIA_IMAGE_MODEL || "black-forest-labs/flux.1-schnell";

function getNvidiaApiKey() {
  return String(process.env.NVIDIA_API_KEY || "").trim();
}

function getNvidiaVisionKey() {
  return String(process.env.NVIDIA_VISION_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
}

function getNvidiaImageKey() {
  return String(process.env.NVIDIA_IMAGE_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
}

function hasNvidiaKey() {
  return getNvidiaApiKey().length > 0;
}

function hasNvidiaVisionKey() {
  return getNvidiaVisionKey().length > 0;
}

function hasNvidiaImageKey() {
  return getNvidiaImageKey().length > 0;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = Number(a[i]) || 0;
    const vb = Number(b[i]) || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function callNvidiaEmbed(texts, inputType) {
  const apiKey = getNvidiaApiKey();
  if (!apiKey || !Array.isArray(texts) || !texts.length) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: NVIDIA_EMBED_MODEL,
        input: texts.map((t) => String(t || "").slice(0, 1500)),
        input_type: inputType === "query" ? "query" : "passage",
        encoding_format: "float",
        truncate: "END"
      }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data && data.data) ? data.data : [];
    return items.map((d) => d.embedding).filter(Array.isArray);
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callNvidiaChat(messages, opts) {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: NVIDIA_CHAT_MODEL,
        messages: messages,
        temperature: opts && typeof opts.temperature === "number" ? opts.temperature : 0.2,
        max_tokens: opts && typeof opts.maxTokens === "number" ? opts.maxTokens : 700
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`NVIDIA API HTTP ${res.status}${errBody ? ": " + errBody.slice(0, 140) : ""}`);
    }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return String(content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

function formatChunkRef(ch) {
  const src = ch.sourceName || "Source";
  const loc = ch.pageNum ? `Page ${ch.pageNum}` : (ch.location || ch.section || "Passage");
  return `${src} · ${loc}`;
}

function rankFallbackChunks(chunks, query, topK) {
  const qTokens = String(query || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
  if (!qTokens.length || !Array.isArray(chunks)) return [];
  const scored = [];
  for (const raw of chunks.slice(0, 120)) {
    const text = String(raw && raw.text || "").trim();
    if (!text) continue;
    const low = text.toLowerCase();
    let hits = 0;
    for (const qt of qTokens) {
      if (low.includes(qt)) hits += 1;
    }
    if (hits > 0) {
      scored.push({
        chunk: {
          id: String(raw.id || ""),
          docId: String(raw.docId || ""),
          sourceName: String(raw.sourceName || "Topic Notes"),
          sourceType: String(raw.sourceType || "text"),
          pageNum: Number(raw.pageNum || 0),
          section: String(raw.section || ""),
          location: String(raw.location || "Section"),
          text: text.slice(0, 1200)
        },
        score: Number((hits / qTokens.length).toFixed(3)),
        bm25Score: Number((hits / qTokens.length).toFixed(3)),
        semanticScore: 0
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

app.use(express.json({ limit: "15mb" }));
app.use("/vendor/xlsx", express.static(path.join(__dirname, "node_modules/xlsx/dist")));
app.use(express.static(__dirname, { index: "index.html", dotfiles: "deny" }));

function runPythonNlp(cmd, payload) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_NLP_CMDS.has(cmd)) {
      return reject(new Error("Invalid NLP command"));
    }
    const child = spawn("python3", [NLP_SCRIPT, cmd], {
      cwd: __dirname,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("Python NLP engine timed out"));
      }
    }, 30000);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `NLP process exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(new Error(`Invalid JSON from NLP engine: ${err.message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();
  });
}

app.get("/api/nlp/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: hasNvidiaKey() ? "nvidia-nim+python-sqlite" : "python-lightweight-nlp",
    nvidiaConfigured: hasNvidiaKey(),
    visionConfigured: hasNvidiaVisionKey(),
    imageGenConfigured: hasNvidiaImageKey(),
    storage: "sqlite"
  });
});

app.get("/api/rag/status", (_req, res) => {
  res.json({
    nvidiaConfigured: hasNvidiaKey(),
    visionConfigured: hasNvidiaVisionKey(),
    imageGenConfigured: hasNvidiaImageKey(),
    chatModel: NVIDIA_CHAT_MODEL,
    embedModel: NVIDIA_EMBED_MODEL,
    visionModel: NVIDIA_VISION_MODEL,
    imageGenModel: NVIDIA_IMAGE_MODEL
  });
});

app.post("/api/nlp/ingest", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!Array.isArray(body.pages) && !Array.isArray(body.stats)) {
      return res.status(400).json({ error: "Request body must include pages or stats array." });
    }
    const result = await runPythonNlp("ingest", body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "NLP ingest failed" });
  }
});

app.post("/api/nlp/search", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.topicId || !body.query) {
      return res.status(400).json({ error: "topicId and query are required." });
    }
    const result = await runPythonNlp("search", {
      topicId: String(body.topicId),
      query: String(body.query),
      topK: Math.min(20, Math.max(1, parseInt(body.topK || "5", 10) || 5))
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "NLP hybrid search failed" });
  }
});

app.get("/api/nlp/topic/:id", async (req, res) => {
  try {
    const result = await runPythonNlp("topic", { topicId: String(req.params.id || "") });
    if (!result.found) {
      return res.status(404).json({ error: "Topic not indexed in SQLite" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load topic NLP index" });
  }
});

app.delete("/api/nlp/doc/:docId", async (req, res) => {
  try {
    const docId = String(req.params.docId || "").slice(0, 120).trim();
    const topicId = String((req.query && req.query.topicId) || "").slice(0, 120).trim();
    if (!docId) {
      return res.status(400).json({ error: "docId is required." });
    }
    const result = await runPythonNlp("delete_doc", { docId, topicId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete document from SQLite" });
  }
});

app.post("/api/rag/ask", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const topicId = String(body.topicId || "").slice(0, 120).trim();
    const topicTitle = String(body.topicTitle || "Study Material").slice(0, 160).trim();
    const query = String(body.query || "").slice(0, 1000).trim();
    const topK = Math.min(10, Math.max(1, parseInt(body.topK || "5", 10) || 5));
    if (!topicId || !query) {
      return res.status(400).json({ error: "topicId and query are required." });
    }

    let searchRes = await runPythonNlp("search", { topicId, query, topK });
    let hits = Array.isArray(searchRes.results) ? searchRes.results : [];
    const queryTokens = Array.isArray(searchRes.query_tokens) ? searchRes.query_tokens : [];

    if (!hits.length && Array.isArray(body.fallbackChunks) && body.fallbackChunks.length) {
      hits = rankFallbackChunks(body.fallbackChunks, query, topK);
    }

    if (!hits.length || !hasNvidiaKey()) {
      return res.json({
        engine: hits.length ? "python-hybrid-sqlite" : "none",
        nvidiaConfigured: hasNvidiaKey(),
        results: hits,
        query_tokens: queryTokens,
        answerSummary: ""
      });
    }

    // Optional NVIDIA dense embedding reranking over retrieved candidates
    try {
      const candidateTexts = hits.map((h) => h.chunk.text);
      const [qVecs, pVecs] = await Promise.all([
        callNvidiaEmbed([query], "query"),
        callNvidiaEmbed(candidateTexts, "passage")
      ]);
      if (qVecs && qVecs[0] && pVecs && pVecs.length === hits.length) {
        hits = hits.map((h, i) => {
          const dense = Math.max(0, cosineSimilarity(qVecs[0], pVecs[i]));
          const bm = Number(h.bm25Score != null ? h.bm25Score : h.score) || 0;
          return {
            chunk: h.chunk,
            score: Number((0.45 * bm + 0.55 * dense).toFixed(3)),
            bm25Score: Number(bm.toFixed(3)),
            semanticScore: Number(dense.toFixed(3))
          };
        });
        hits.sort((a, b) => b.score - a.score);
      }
    } catch (_e) {
      // Keep BM25/SQLite ranking if embedding endpoint is unavailable
    }

    const contextBlock = hits.slice(0, 5).map((h, idx) => {
      return `[${idx + 1}] (${formatChunkRef(h.chunk)})\n${h.chunk.text.slice(0, 900)}`;
    }).join("\n\n");

    const statsList = Array.isArray(body.stats) ? body.stats.slice(0, 6).map((s) => String(s && s.summary || "")).filter(Boolean) : [];
    const statsBlock = statsList.length ? `\n\nExtracted numeric metrics:\n- ${statsList.join("\n- ")}` : "";

    let answerSummary = "";
    let engine = "python-hybrid-sqlite";
    let notice = "";
    try {
      const llmText = await callNvidiaChat([
        {
          role: "system",
          content: "You are a strict source-grounded study assistant. Answer the student's question using ONLY the provided textbook/source excerpts and metrics. Cite sources inline using [Source · Page/Location] from the brackets. If the excerpts do not contain enough information, state what is missing rather than guessing. Keep the answer concise, structured, and clear."
        },
        {
          role: "user",
          content: `Topic: ${topicTitle}\nQuestion: ${query}\n\nRetrieved excerpts:\n${contextBlock}${statsBlock}`
        }
      ], { temperature: 0.2, maxTokens: 550 });
      if (llmText) {
        answerSummary = llmText;
        engine = "nvidia-rag";
      }
    } catch (err) {
      notice = err.message || "NVIDIA RAG fallback to local hybrid retrieval";
    }

    res.json({
      engine,
      model: engine === "nvidia-rag" ? NVIDIA_CHAT_MODEL : undefined,
      nvidiaConfigured: true,
      notice: notice || undefined,
      results: hits,
      query_tokens: queryTokens,
      answerSummary
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "RAG ask failed" });
  }
});

app.post("/api/rag/generate-quiz", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const topicId = String(body.topicId || "").slice(0, 120).trim();
    const topicTitle = String(body.topicTitle || "Study Material").slice(0, 160).trim();
    const count = Math.min(8, Math.max(3, parseInt(body.count || "5", 10) || 5));
    if (!topicId) {
      return res.status(400).json({ error: "topicId is required." });
    }

    let topicData = await runPythonNlp("topic", { topicId });
    let chunks = (topicData && topicData.found && Array.isArray(topicData.chunks)) ? topicData.chunks : [];
    if (!chunks.length && Array.isArray(body.chunks)) {
      chunks = body.chunks.slice(0, 12).map((c, idx) => ({
        sourceName: String((c && c.sourceName) || topicTitle),
        pageNum: Number((c && c.pageNum) || 0),
        location: String((c && c.location) || `Section ${idx + 1}`),
        text: String((c && c.text) || "").slice(0, 900)
      })).filter((c) => c.text.length > 20);
    }

    if (!chunks.length) {
      return res.json({ engine: "none", nvidiaConfigured: hasNvidiaKey(), quiz: [] });
    }

    if (!hasNvidiaKey()) {
      return res.json({
        engine: "local-nlp",
        nvidiaConfigured: false,
        quiz: (topicData && Array.isArray(topicData.quiz)) ? topicData.quiz : []
      });
    }

    const passages = chunks.slice(0, 8).map((c, idx) => {
      return `Passage ${idx + 1} (${formatChunkRef(c)}):\n${String(c.text || "").slice(0, 750)}`;
    }).join("\n\n");

    let validQuiz = [];
    let notice = "";
    try {
      const raw = await callNvidiaChat([
        {
          role: "system",
          content: "You generate factual multiple-choice quiz questions strictly grounded in provided textbook passages. Output ONLY valid JSON matching {\"quiz\":[{\"q\":\"...\",\"opts\":[\"...\",\"...\",\"...\",\"...\"],\"a\":0,\"why\":\"...\",\"pageRef\":\"Source · Page X\",\"evidence\":\"short verbatim quote\"}]}. No markdown fences, no commentary."
        },
        {
          role: "user",
          content: `Create ${count} distinct multiple-choice questions for "${topicTitle}" grounded strictly in these passages. Each question must have 4 plausible options, integer answer index a (0-3), a concise explanation "why", "pageRef", and verbatim "evidence" quote.\n\n${passages}`
        }
      ], { temperature: 0.25, maxTokens: 1200 });

      let parsed = null;
      const cleaned = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace > -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }

      const list = parsed && Array.isArray(parsed.quiz) ? parsed.quiz : [];
      for (const item of list) {
        if (!item || typeof item.q !== "string" || !Array.isArray(item.opts) || item.opts.length < 3) continue;
        const opts = item.opts.slice(0, 4).map((o) => String(o || "").trim()).filter(Boolean);
        const a = Number.isInteger(item.a) ? item.a : parseInt(item.a, 10);
        if (opts.length < 3 || isNaN(a) || a < 0 || a >= opts.length) continue;
        validQuiz.push({
          q: item.q.trim().slice(0, 300),
          opts,
          a,
          why: String(item.why || "Grounded in indexed source passage.").trim().slice(0, 280),
          pageRef: String(item.pageRef || topicTitle).trim().slice(0, 120),
          evidence: String(item.evidence || "").trim().slice(0, 240)
        });
      }
    } catch (err) {
      notice = err.message || "NVIDIA RAG quiz fallback to local NLP";
    }

    if (!validQuiz.length) {
      return res.json({
        engine: "local-nlp",
        nvidiaConfigured: true,
        notice: notice || undefined,
        quiz: (topicData && Array.isArray(topicData.quiz)) ? topicData.quiz : []
      });
    }

    res.json({
      engine: "nvidia-rag",
      model: NVIDIA_CHAT_MODEL,
      nvidiaConfigured: true,
      quiz: validQuiz
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "RAG quiz generation failed" });
  }
});

function normalizeDetections(raw) {
  const detections = [];
  const items = Array.isArray(raw && raw.data) ? raw.data : (Array.isArray(raw && raw.detections) ? raw.detections : []);
  for (const entry of items) {
    const boxesMap = entry && entry.bounding_boxes && typeof entry.bounding_boxes === "object"
      ? entry.bounding_boxes
      : (entry && entry.boxes && typeof entry.boxes === "object" ? entry.boxes : null);
    if (boxesMap) {
      for (const [label, arr] of Object.entries(boxesMap)) {
        if (!Array.isArray(arr)) continue;
        for (const b of arr) {
          if (!b || typeof b !== "object") continue;
          const xmin = Number(b.xmin ?? b.x_min ?? b.x1 ?? 0);
          const ymin = Number(b.ymin ?? b.y_min ?? b.y1 ?? 0);
          const xmax = Number(b.xmax ?? b.x_max ?? b.x2 ?? 0);
          const ymax = Number(b.ymax ?? b.y_max ?? b.y2 ?? 0);
          const conf = Number(b.confidence ?? b.score ?? 0.5);
          detections.push({
            label: String(label).replace(/_/g, " ").slice(0, 60),
            confidence: Number(conf.toFixed(3)),
            xmin, ymin, xmax, ymax
          });
        }
      }
    } else if (entry && (entry.label || entry.class)) {
      detections.push({
        label: String(entry.label || entry.class).slice(0, 60),
        confidence: Number(Number(entry.confidence ?? entry.score ?? 0.5).toFixed(3)),
        xmin: Number(entry.xmin ?? 0),
        ymin: Number(entry.ymin ?? 0),
        xmax: Number(entry.xmax ?? 0),
        ymax: Number(entry.ymax ?? 0)
      });
    }
  }
  detections.sort((a, b) => b.confidence - a.confidence);
  return detections.slice(0, 40);
}

app.post("/api/vision/detect", async (req, res) => {
  try {
    const apiKey = getNvidiaVisionKey();
    if (!apiKey) {
      return res.status(503).json({
        error: "Object detection API key is not configured on the server (set NVIDIA_VISION_API_KEY).",
        visionConfigured: false
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dataUrl = String(body.imageDataUrl || "").trim();
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match || dataUrl.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "Provide a valid PNG/JPEG/WEBP data URL under 10MB." });
    }
    const threshold = Math.min(0.95, Math.max(0.1, Number(body.threshold) || 0.45));
    const modelSlug = NVIDIA_VISION_MODEL.replace(/^\/+/, "");
    const endpoint = `${NVIDIA_AI_BASE_URL}/cv/${modelSlug}`;

    async function postDetect(payload) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        return await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
    }

    let apiRes = await postDetect({
      input: [{ type: "image_url", url: dataUrl }],
      confidence_threshold: threshold
    });
    if (apiRes.status === 422 || apiRes.status === 400) {
      apiRes = await postDetect({
        input: [{ type: "image_url", image_url: { url: dataUrl } }],
        confidence_threshold: threshold
      });
    }
    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => "");
      return res.status(apiRes.status >= 500 ? 502 : apiRes.status).json({
        error: `NVIDIA Vision API HTTP ${apiRes.status}${errText ? ": " + errText.slice(0, 180) : ""}`,
        visionConfigured: true
      });
    }
    const raw = await apiRes.json();
    const detections = normalizeDetections(raw);
    const counts = {};
    for (const d of detections) {
      counts[d.label] = (counts[d.label] || 0) + 1;
    }
    res.json({
      engine: "nvidia-nim-vision",
      model: NVIDIA_VISION_MODEL,
      visionConfigured: true,
      detections,
      counts,
      summary: detections.length
        ? Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")
        : "No distinct diagram or page elements crossed confidence threshold."
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Object detection failed" });
  }
});

app.post("/api/image/generate", async (req, res) => {
  try {
    const apiKey = getNvidiaImageKey();
    if (!apiKey) {
      return res.status(503).json({
        error: "Text-to-image API key is not configured on the server (set NVIDIA_IMAGE_API_KEY).",
        imageGenConfigured: false
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const userPrompt = String(body.prompt || "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (userPrompt.length < 3) {
      return res.status(400).json({ error: "Provide a descriptive prompt (at least 3 characters)." });
    }
    const style = String(body.style || "scenic").trim();
    const styleSuffix = style === "diagram"
      ? ", crisp educational textbook diagram illustration, sage green, deep pine teal, and warm amber highlights on matte dark slate, high clarity"
      : (style === "pixel"
        ? ", atmospheric 16-bit pixel art landscape, lavender pine forest and warm terracotta peaks, clean pixel crispness"
        : ", hand-crafted editorial storybook landscape illustration, deep forest pine green, misty sage teal, twilight slate, and warm sunlit amber clouds, clean outlines");

    const width = [768, 1024].includes(Number(body.width)) ? Number(body.width) : 1024;
    const height = [768, 1024].includes(Number(body.height)) ? Number(body.height) : 768;
    const modelSlug = NVIDIA_IMAGE_MODEL.replace(/^\/+/, "");
    const endpoint = `${NVIDIA_AI_BASE_URL}/genai/${modelSlug}`;
    const isSchnell = /schnell/i.test(modelSlug);
    const payload = isSchnell
      ? { prompt: `${userPrompt}${styleSuffix}`, width, height, steps: 4, seed: 0, samples: 1 }
      : { prompt: `${userPrompt}${styleSuffix}`, width, height, cfg_scale: 3.5, steps: 25, seed: 0 };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let apiRes;
    try {
      apiRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => "");
      return res.status(apiRes.status >= 500 ? 502 : apiRes.status).json({
        error: `NVIDIA Image API HTTP ${apiRes.status}${errText ? ": " + errText.slice(0, 180) : ""}`,
        imageGenConfigured: true
      });
    }
    const data = await apiRes.json();
    const b64 = (data && Array.isArray(data.artifacts) && data.artifacts[0] && data.artifacts[0].base64)
      || (data && Array.isArray(data.data) && data.data[0] && data.data[0].b64_json)
      || (data && data.image)
      || "";
    if (!b64 || typeof b64 !== "string") {
      return res.status(502).json({ error: "Image API returned no image artifact." });
    }
    const cleanB64 = b64.replace(/^data:image\/\w+;base64,/, "");
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    const fileName = `study_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
    const outPath = path.resolve(GENERATED_DIR, fileName);
    if (!outPath.startsWith(GENERATED_DIR + path.sep)) {
      return res.status(500).json({ error: "Invalid output path." });
    }
    fs.writeFileSync(outPath, Buffer.from(cleanB64, "base64"));

    res.json({
      engine: "nvidia-nim-image",
      model: NVIDIA_IMAGE_MODEL,
      imageGenConfigured: true,
      url: `/public/generated/${fileName}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Image generation failed" });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
