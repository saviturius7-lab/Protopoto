const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";
const NLP_SCRIPT = path.join(__dirname, "backend", "nlp_engine.py");
const ALLOWED_NLP_CMDS = new Set(["ingest", "search", "topic"]);

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
  res.json({ status: "ok", engine: "python-lightweight-nlp", storage: "sqlite" });
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

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
