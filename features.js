"use strict";
/* Unlocked Phase 1 — features: PDF upload/extraction, knowledge-unit editor,
   spaced-repetition review, and app init/wiring. Depends on data.js + engine.js. */

/* ============================== TEXTBOOKS & LOCAL RAG ============================== */

var pdfTextCache = "";
var ragTargetMode = "active"; // "new" or "active"

function getRagTopic() {
  return getTopic(state.activeTopicId);
}

function createEmptyCustomTopic(title) {
  var id = "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
  var cleanTitle = (title || "").trim() || "Imported textbook";
  return {
    id: id,
    title: cleanTitle,
    summary: "Imported study material indexed locally for RAG retrieval and adaptive practice.",
    classification: "concept",
    concepts: [], relationships: [], process: [],
    story: { title: cleanTitle + " walkthrough", scenes: [] },
    graph: { labels: [], series: [] },
    diagram: { inputs: [], outputs: [], center: cleanTitle.slice(0, 24), centerSub: "add or auto-extract knowledge units" },
    worked: [], guide: [], quiz: [], misconceptions: [],
    hint: { question: "Add a question in the Editor or auto-extract from sources.", hints: [], keywords: [], answerHtml: "" },
    explain: { prompt: "Explain the main idea in your own words.", keywords: [], minCorrect: 1 },
    predict: { prompt: "What do you predict will happen?", revealHtml: "" },
    hook: { prompt: "What stands out in this material?" },
    evidence: { prompt: "Which explanation fits the data?", options: ["Option A", "Option B"], answer: 0, why: "" },
    challenge: { prompt: "Apply the main idea to a new problem.", keywords: [], minCorrect: 1, why: "" },
    game: { title: "Interactive simulation", goal: "Adjust the variables.", kind: "limiting", target: 0, unit: "score", sliders: [{ id: "a", label: "Factor A" }, { id: "b", label: "Factor B" }] },
    source_text: "",
    ragDocs: [],
    ragChunks: [],
    extractedStats: [],
    hierarchy: [],
    nlpKeywords: []
  };
}

function saveTopicRagUpdate(topicId, patch) {
  var existing = state.edits[topicId] || {};
  Object.keys(patch).forEach(function (k) { existing[k] = patch[k]; });
  state.edits[topicId] = existing;
  if (topicId.indexOf("custom_") === 0) {
    var ct = (state.customTopics || []).find(function (t) { return t.id === topicId; });
    if (ct) Object.keys(patch).forEach(function (k) { ct[k] = patch[k]; });
  }
  store();
  if (state.activeTopicId === topicId) T = getTopic(topicId);
}

function appendExtractionToTopic(topicId, extracted) {
  var tp = getTopic(topicId);
  if (!tp) return;
  var docs = (tp.ragDocs || []).slice();
  var chunks = (tp.ragChunks || []).slice();
  var stats = (tp.extractedStats || []).slice();
  docs.push(extracted.doc);
  chunks = chunks.concat(extracted.chunks || []);
  stats = stats.concat(extracted.stats || []);

  var combinedSource = tp.source_text ? (tp.source_text + "\n\n" + extracted.text) : extracted.text;
  var patch = {
    ragDocs: docs,
    ragChunks: chunks,
    extractedStats: stats,
    source_text: combinedSource
  };
  if (extracted.graph && (!tp.graph || !tp.graph.series || !tp.graph.series.length)) {
    patch.graph = extracted.graph;
  }
  if (tp.id.indexOf("custom_") === 0 && (!tp.summary || tp.summary.indexOf("Imported study material") === 0) && extracted.text) {
    patch.summary = extracted.text.replace(/^---.*?---\s*/m, "").slice(0, 140).trim() + "...";
  }
  saveTopicRagUpdate(topicId, patch);
}

function syncExtractionWithPythonNlp(topicId, extracted) {
  var tp = getTopic(topicId);
  if (!tp || !extracted) return Promise.resolve(null);
  return ragBackendIngest(topicId, tp.title, extracted).then(function (res) {
    if (!res || !res.engine) return null;
    var cur = getTopic(topicId);
    if (!cur) return null;

    var otherChunks = (cur.ragChunks || []).filter(function (c) { return c.docId !== extracted.doc.id; });
    var updatedChunks = otherChunks.concat(res.chunks || []);
    var patch = {
      ragChunks: updatedChunks,
      hierarchy: res.hierarchy || cur.hierarchy || [],
      nlpKeywords: res.keywords || cur.nlpKeywords || []
    };

    var isCustom = topicId.indexOf("custom_") === 0;
    var existingConcepts = (cur.concepts || []).slice();
    var seenNames = {};
    existingConcepts.forEach(function (c) { seenNames[c.name.toLowerCase()] = 1; });
    (res.concepts || []).forEach(function (c) {
      if (!seenNames[c.name.toLowerCase()] && existingConcepts.length < 18) {
        seenNames[c.name.toLowerCase()] = 1;
        existingConcepts.push(c);
      }
    });
    patch.concepts = existingConcepts;

    var existingRels = (cur.relationships || []).slice();
    var relKeys = {};
    existingRels.forEach(function (r) { relKeys[r.from + "->" + r.to] = 1; });
    (res.relationships || []).forEach(function (r) {
      var k = r.from + "->" + r.to;
      if (!relKeys[k] && existingRels.length < 16) {
        relKeys[k] = 1;
        existingRels.push(r);
      }
    });
    patch.relationships = existingRels;

    var existingQuiz = (cur.quiz || []).slice();
    var qSeen = {};
    existingQuiz.forEach(function (q) { qSeen[q.q] = 1; });
    (res.quiz || []).forEach(function (q) {
      if (!qSeen[q.q] && existingQuiz.length < 14) {
        qSeen[q.q] = 1;
        existingQuiz.push(q);
      }
    });
    patch.quiz = existingQuiz;

    saveTopicRagUpdate(topicId, patch);
    var merged = getTopic(topicId);
    if (merged) {
      var extra = ragAutoExtractUnits(merged);
      var postPatch = {
        concepts: extra.concepts,
        relationships: extra.relationships,
        quiz: extra.quiz
      };
      if (isCustom || !(merged.diagram && merged.diagram.inputs && merged.diagram.inputs.length)) postPatch.diagram = extra.diagram;
      if (isCustom || !(merged.story && merged.story.scenes && merged.story.scenes.length)) postPatch.story = extra.story;
      if (isCustom || !(merged.explain && merged.explain.keywords && merged.explain.keywords.length)) postPatch.explain = extra.explain;
      if (isCustom || !merged.classification) postPatch.classification = extra.classification;
      if (!merged.process || !merged.process.length) postPatch.process = extra.process;
      saveTopicRagUpdate(topicId, postPatch);
    }
    if (edTopicId === topicId) edDraft = null;
    return res;
  });
}

function renderUpload() {
  var sel = $("ragTargetSelect");
  var titleRow = $("newTopicTitleRow");
  var titleInp = $("newTopicTitleInput");

  function syncTargetDropdown() {
    if (!sel) return;
    sel.innerHTML = '<option value="__new__">+ Create a new topic from upload</option>';
    allTopics().forEach(function (t) {
      var o = el("option");
      o.value = t.id;
      o.textContent = "Attach to: " + t.title;
      sel.appendChild(o);
    });
    sel.value = ragTargetMode === "new" ? "__new__" : state.activeTopicId;
    if (titleRow) titleRow.classList.toggle("hidden", sel.value !== "__new__");
  }
  syncTargetDropdown();

  if (sel && !sel._wired) {
    sel._wired = true;
    sel.addEventListener("change", function () {
      if (sel.value === "__new__") {
        ragTargetMode = "new";
        if (titleRow) titleRow.classList.remove("hidden");
      } else {
        ragTargetMode = "active";
        setTopic(sel.value);
        if (titleRow) titleRow.classList.add("hidden");
        renderRagWorkspace();
      }
    });
  }

  var zone = $("uploadZone"), input = $("fileInput");
  if (zone && !zone._wired) {
    zone._wired = true;
    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.style.borderColor = "var(--accent)"; });
    zone.addEventListener("dragleave", function () { zone.style.borderColor = ""; });
    zone.addEventListener("drop", function (e) {
      e.preventDefault(); zone.style.borderColor = "";
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleMultiFiles(e.dataTransfer.files);
    });
    input.addEventListener("change", function () {
      if (input.files && input.files.length) {
        handleMultiFiles(input.files);
        input.value = "";
      }
    });
  }

  var pasteBtn = $("ingestPasteBtn");
  if (pasteBtn && !pasteBtn._wired) {
    pasteBtn._wired = true;
    pasteBtn.addEventListener("click", function () {
      var raw = ($("pasteSourceText") && $("pasteSourceText").value || "").trim();
      var lbl = ($("pasteSourceName") && $("pasteSourceName").value || "").trim();
      if (!raw) { toast("Paste some textbook notes or CSV rows first."); return; }
      var extracted = ragExtractPasted(lbl, raw);
      var targetId = ensureTargetTopic(lbl || "Pasted study notes");
      appendExtractionToTopic(targetId, extracted);
      if ($("pasteSourceText")) $("pasteSourceText").value = "";
      if ($("pasteSourceName")) $("pasteSourceName").value = "";
      syncTargetDropdown();
      renderRagWorkspace();
      toast("Indexed pasted source (" + extracted.chunks.length + " passages). Running Python NLP analysis...");
      syncExtractionWithPythonNlp(targetId, extracted).then(function (res) {
        if (res) {
          renderRagWorkspace();
          toast("NLP & SQLite Hybrid RAG synced (" + (res.keywords || []).length + " keyphrases).");
        }
      });
    });
  }

  var autoBtn = $("autoBuildBtn");
  if (autoBtn && !autoBtn._wired) {
    autoBtn._wired = true;
    autoBtn.addEventListener("click", function () {
      var tp = getRagTopic();
      if (!tp) return;
      var synth = ragAutoExtractUnits(tp);
      saveTopicRagUpdate(tp.id, synth);
      if (edTopicId === tp.id) edDraft = null;
      renderRagWorkspace();
      var rawTextForNlp = tp.source_text || (tp.ragChunks || []).map(function (c) { return c.text; }).join("\n\n");
      if (rawTextForNlp) {
        syncExtractionWithPythonNlp(tp.id, {
          doc: { id: "src_" + tp.id, name: tp.title || "Source", type: "text" },
          pages: [{ page: 1, location: "Source Notes", text: rawTextForNlp }],
          stats: tp.extractedStats || [],
          text: rawTextForNlp
        }).then(function (res) {
          renderRagWorkspace();
          var updated = getTopic(tp.id);
          var qCount = updated && updated.quiz ? updated.quiz.length : synth.quiz.length;
          toast("Built " + qCount + " quiz questions, " + (updated ? updated.concepts.length : synth.concepts.length) + " concepts!");
        });
      } else {
        toast("Built " + synth.quiz.length + " quiz questions, " + synth.concepts.length + " concepts, and " + synth.relationships.length + " links.");
      }
    });
  }

  var edBtn = $("openRagInEditorBtn");
  if (edBtn && !edBtn._wired) {
    edBtn._wired = true;
    edBtn.addEventListener("click", function () { edDraft = null; showScreen("editor"); });
  }

  var launchBtn = $("launchRagTopicBtn");
  if (launchBtn && !launchBtn._wired) {
    launchBtn._wired = true;
    launchBtn.addEventListener("click", function () {
      if (!state.archetype) { showScreen("home"); toast("Choose an archetype to begin studying."); return; }
      showScreen("quest");
    });
  }

  var searchBtn = $("ragSearchBtn"), qInp = $("ragQueryInput");
  if (searchBtn && !searchBtn._wired) {
    searchBtn._wired = true;
    searchBtn.addEventListener("click", runRagQuery);
  }
  if (qInp && !qInp._wired) {
    qInp._wired = true;
    qInp.addEventListener("keydown", function (e) { if (e.key === "Enter") runRagQuery(); });
  }

  var cb = $("createTopicBtn");
  if (cb && !cb._wired) {
    cb._wired = true;
    cb.addEventListener("click", function () {
      if (!pdfTextCache) { toast("Import a file first."); return; }
      var topic = createEmptyCustomTopic(titleInp && titleInp.value);
      var chunks = ragChunkText(pdfTextCache, { docId: "src_" + Date.now(), sourceName: topic.title, sourceType: "text", location: "Document" });
      topic.source_text = pdfTextCache;
      topic.ragChunks = chunks;
      state.customTopics.push(topic);
      state.edits[topic.id] = { source_text: pdfTextCache, ragChunks: chunks };
      setTopic(topic.id);
      ragTargetMode = "active";
      syncTargetDropdown();
      renderRagWorkspace();
      toast("Topic created.");
    });
  }

  renderRagWorkspace();
}

function ensureTargetTopic(defaultTitle) {
  var sel = $("ragTargetSelect");
  var titleInp = $("newTopicTitleInput");
  if (sel && sel.value === "__new__") {
    var chosenTitle = (titleInp && titleInp.value.trim()) || defaultTitle.replace(/\.[^.]+$/, "");
    var topic = createEmptyCustomTopic(chosenTitle);
    state.customTopics.push(topic);
    setTopic(topic.id);
    ragTargetMode = "active";
    if (titleInp) titleInp.value = "";
    return topic.id;
  }
  return state.activeTopicId;
}

function handleMultiFiles(fileList) {
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return;
  var status = $("pdfStatus");
  var targetId = ensureTargetTopic(files[0].name);
  var sel = $("ragTargetSelect");
  if (sel) {
    sel.innerHTML = '<option value="__new__">+ Create a new topic from upload</option>';
    allTopics().forEach(function (t) {
      var o = el("option"); o.value = t.id; o.textContent = "Attach to: " + t.title; sel.appendChild(o);
    });
    sel.value = targetId;
    if ($("newTopicTitleRow")) $("newTopicTitleRow").classList.add("hidden");
  }

  var idx = 0;
  var totalChunksAdded = 0;
  function nextFile() {
    if (idx >= files.length) {
      var tp = getTopic(targetId);
      if (tp) {
        pdfTextCache = tp.source_text || "";
        var text = $("pdfText");
        if (text && pdfTextCache) {
          text.textContent = pdfTextCache.slice(0, 6000) + (pdfTextCache.length > 6000 ? "\n\n... [truncated preview; full text indexed in RAG]" : "");
          if ($("pdfResult")) $("pdfResult").classList.remove("hidden");
        }
      }
      if (status) status.textContent = "Done. Indexed " + files.length + " file(s) (" + totalChunksAdded + " passages extracted).";
      renderRagWorkspace();
      toast("Extracted & indexed " + files.length + " file(s).");
      return;
    }
    var file = files[idx++];
    if (status) status.textContent = "Processing " + idx + "/" + files.length + ": " + file.name + " ...";
    ragExtractAnyFile(file, function (msg) {
      if (status) status.textContent = msg;
    }).then(function (extracted) {
      totalChunksAdded += (extracted.chunks || []).length;
      appendExtractionToTopic(targetId, extracted);
      if (status) status.textContent = "Running Python NLP & SQLite Hybrid RAG indexing for " + file.name + " ...";
      return syncExtractionWithPythonNlp(targetId, extracted).then(function () {
        nextFile();
      });
    }).catch(function (err) {
      if (status) status.textContent = "Error reading " + file.name + ": " + (err && err.message ? err.message : err);
      nextFile();
    });
  }
  nextFile();
}

function renderRagWorkspace() {
  var tp = getRagTopic();
  var srcWrap = $("ragSourcesWrap"), qWrap = $("ragQueryWrap");
  if (!tp || !srcWrap || !qWrap) return;

  var docs = tp.ragDocs || [];
  var chunks = ragEnsureTopicChunks(tp);
  var stats = tp.extractedStats || [];
  var hasContent = docs.length > 0 || chunks.length > 0 || stats.length > 0;

  srcWrap.classList.toggle("hidden", !hasContent);
  qWrap.classList.toggle("hidden", !hasContent);
  if (!hasContent) return;

  var statsLine = $("ragIndexStats");
  if (statsLine) {
    statsLine.innerHTML =
      '<span>Topic: <strong>' + esc(tp.title) + "</strong></span>" +
      '<span class="sep" aria-hidden="true">·</span>' +
      '<span>' + docs.length + ' uploaded file(s)</span>' +
      '<span class="sep" aria-hidden="true">·</span>' +
      '<span>' + chunks.length + ' indexed passage(s)</span>' +
      '<span class="sep" aria-hidden="true">·</span>' +
      '<span>' + stats.length + ' extracted metric(s)</span>';
  }

  var grid = $("ragDocsGrid");
  if (grid) {
    grid.innerHTML = "";
    if (!docs.length) {
      grid.innerHTML = '<div class="small muted">Using built-in concepts/notes for <strong>' + esc(tp.title) + '</strong>. Upload PDFs, Excel sheets, or images above to expand its textbook RAG index.</div>';
    } else {
      docs.forEach(function (d, dIdx) {
        var card = el("div", "rag-doc");
        var typeTag = d.type === "pdf" ? "PDF" : (d.type === "excel" ? "EXCEL / CSV" : (d.type === "image" ? "IMAGE + OCR" : "STATS / TEXT"));
        var meta = d.type === "pdf" ? (d.pages + " pages · " + d.chunkCount + " chunks") :
          (d.type === "excel" ? (d.sheets + " sheet(s) · " + d.rows + " rows · " + d.chunkCount + " chunks") :
          (d.type === "image" ? (d.width + "×" + d.height + "px · brightness " + d.brightnessPct + "%") : (d.chunkCount + " chunks")));
        var html = '<div class="row"><span class="status-text now">' + typeTag + '</span><button class="btn ghost sm" style="padding:3px 9px;font-size:.76rem" data-deldoc="' + dIdx + '">Remove</button></div>';
        if (d.thumb) {
          html += '<img class="rag-thumb" src="' + esc(d.thumb) + '" alt="' + esc(d.name) + '" referrerpolicy="no-referrer" />';
        }
        html += '<div><strong>' + esc(d.name) + '</strong><div class="small muted">' + esc(meta) + '</div></div>';
        if (d.type === "image") {
          var swatches = (d.dominantColors || []).map(function (c) {
            return '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;border:1.5px solid var(--border);background:' + esc(c) + ';vertical-align:middle;margin-right:4px" title="' + esc(c) + '"></span>';
          }).join("");
          html += '<div class="small muted">Palette: ' + swatches + ' · ' + esc(d.ocrNote || "") + '</div>';
          html += '<label style="margin:4px 0 2px;font-size:.78rem">Extracted OCR / Image caption (editable)</label>';
          html += '<textarea data-imgnote="' + dIdx + '" style="min-height:68px;font-size:.82rem">' + esc(d.ocrText || "") + '</textarea>';
          html += '<button class="btn secondary sm" data-saveimg="' + dIdx + '">Update image text in RAG</button>';
        } else {
          html += '<div class="small muted" style="max-height:76px;overflow:hidden">' + esc((d.previewText || "").slice(0, 180)) + '...</div>';
        }
        card.innerHTML = html;
        grid.appendChild(card);
      });

      grid.querySelectorAll("[data-deldoc]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = +btn.getAttribute("data-deldoc");
          var removed = docs[i];
          if (!removed) return;
          var newDocs = docs.filter(function (_, idx) { return idx !== i; });
          var newChunks = (tp.ragChunks || []).filter(function (c) { return c.docId !== removed.id; });
          var newStats = (tp.extractedStats || []).filter(function (s) { return (s.sourceName || "").indexOf(removed.name) !== 0; });
          saveTopicRagUpdate(tp.id, { ragDocs: newDocs, ragChunks: newChunks, extractedStats: newStats });
          renderRagWorkspace();
          toast("Removed " + removed.name + " from index.");
        });
      });

      grid.querySelectorAll("[data-saveimg]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = +btn.getAttribute("data-saveimg");
          var ta = grid.querySelector('[data-imgnote="' + i + '"]');
          var docObj = docs[i];
          if (!docObj || !ta) return;
          docObj.ocrText = ta.value;
          docObj.ocrNote = "Updated manually";
          var otherChunks = (tp.ragChunks || []).filter(function (c) { return c.docId !== docObj.id; });
          var freshChunks = ragChunkText(
            "Image " + docObj.name + " (" + docObj.width + "x" + docObj.height + " px):\n" + ta.value,
            { docId: docObj.id, sourceName: docObj.name, sourceType: "image", location: "Image OCR & Notes" }
          );
          docObj.chunkCount = freshChunks.length;
          var freshStats = (tp.extractedStats || []).filter(function (s) { return s.sourceName !== docObj.name || /Resolution|Brightness/i.test(s.label); })
            .concat(extractNumericStatsFromText(ta.value, docObj.name));
          saveTopicRagUpdate(tp.id, { ragDocs: docs, ragChunks: otherChunks.concat(freshChunks), extractedStats: freshStats });
          renderRagWorkspace();
          toast("Updated image notes & re-indexed RAG passages.");
          syncExtractionWithPythonNlp(tp.id, {
            doc: docObj,
            pages: [{ page: 1, location: "Image OCR & Notes", text: ta.value }],
            stats: freshStats,
            text: ta.value
          }).then(function (res) { if (res) renderRagWorkspace(); });
        });
      });
    }
  }

  var nlpBox = $("ragNlpInsights");
  if (nlpBox) {
    var kws = tp.nlpKeywords || [];
    var hier = tp.hierarchy || [];
    if (!kws.length && !hier.length) {
      nlpBox.innerHTML = "";
    } else {
      var kwButtons = kws.map(function (k) {
        return '<button type="button" class="tab" data-nlpkw="' + esc(k.term) + '">' + esc(k.term) +
          ' <span class="muted" style="font-family:var(--font-mono);font-size:.74rem">' + Number(k.score || 0).toFixed(2) + "</span></button>";
      }).join("");
      var hierCards = hier.map(function (h) {
        var pgs = (h.pages && h.pages.length) ? ("p. " + h.pages.join(", ")) : "Section";
        var cons = (h.concepts && h.concepts.length) ? h.concepts.join(" · ") : "Indexed text";
        return '<div class="ed-item" style="padding:10px 13px">' +
          '<div class="hd"><span class="nm">' + esc(h.section || "Overview") + '</span>' +
          '<span class="small muted" style="font-family:var(--font-mono)">' + esc(pgs) + "</span></div>" +
          '<div class="small muted" style="margin-top:4px">' + esc(cons) + "</div></div>";
      }).join("");

      nlpBox.innerHTML =
        (kws.length ? ('<h3 style="margin:0 0 6px">NLP Keyphrases (TF-IDF + YAKE + TextRank)</h3><div class="tabs" style="margin-top:6px">' + kwButtons + "</div>") : "") +
        (hier.length ? ('<h3 style="margin:14px 0 6px">Detected Topic Hierarchy (Sections &amp; Page Citations)</h3><div class="ed-list">' + hierCards + "</div>") : "");

      nlpBox.querySelectorAll("[data-nlpkw]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if ($("ragQueryInput")) $("ragQueryInput").value = btn.getAttribute("data-nlpkw") || "";
          runRagQuery();
        });
      });
    }
  }

  var statsBox = $("ragExtractedStatsBox");
  if (statsBox) {
    if (!stats.length) {
      statsBox.innerHTML = "";
    } else {
      var rowsHtml = stats.slice(0, 16).map(function (st) {
        var valStr = st.mean != null
          ? ("mean " + st.mean + " · min " + st.min + " · max " + st.max + " (n=" + st.count + ")")
          : (st.value + (st.unit ? " " + st.unit : ""));
        return "<tr><td><strong>" + esc(st.label) + "</strong></td><td>" + esc(valStr) + "</td><td class='muted'>" + esc(st.sheet || st.sourceName || "") + "</td></tr>";
      }).join("");
      statsBox.innerHTML = '<h3 style="margin:0 0 4px">Extracted numbers &amp; dataset statistics</h3>' +
        '<div class="stat-table-wrap"><table class="stat-table"><thead><tr><th>Metric / Column</th><th>Extracted Values</th><th>Source</th></tr></thead><tbody>' +
        rowsHtml + "</tbody></table></div>";
    }
  }

  var quizPreviewWrap = $("ragQuizPreviewWrap");
  if (quizPreviewWrap) {
    var topicQuiz = tp.quiz || [];
    if (!topicQuiz.length && chunks.length) {
      var quickSynth = ragAutoExtractUnits(tp);
      if (quickSynth.quiz && quickSynth.quiz.length) {
        saveTopicRagUpdate(tp.id, {
          quiz: quickSynth.quiz,
          concepts: quickSynth.concepts,
          relationships: quickSynth.relationships
        });
        topicQuiz = quickSynth.quiz;
      }
    }
    if (!topicQuiz.length) {
      quizPreviewWrap.innerHTML = "";
    } else {
      quizPreviewWrap.innerHTML =
        '<div class="row" style="margin-bottom:10px">' +
        '<div><h3 style="margin:0">Generated Quiz (' + topicQuiz.length + ' questions ready)</h3>' +
        '<div class="small muted">Evidence-validated questions with page references built from your indexed sources.</div></div>' +
        '<button class="btn secondary sm" id="ragEditQuizBtn">Edit questions</button>' +
        '</div><div id="ragQuizHost" style="background:var(--surface-2);border:2px solid var(--border);border-radius:var(--radius-sm);padding:16px"></div>';
      var qHost = $("ragQuizHost");
      if (qHost) qHost.appendChild(makeQuiz(topicQuiz, { complete: function (pct, passed) { bumpMastery(passed ? 14 : 6); } }));
      if ($("ragEditQuizBtn")) {
        $("ragEditQuizBtn").addEventListener("click", function () {
          edDraft = null;
          showScreen("editor");
          var qTab = document.querySelector('#editorTabs .tab[data-tab="quiz"]');
          if (qTab) qTab.click();
        });
      }
    }
  }

  var quickWrap = $("ragQuickTerms");
  if (quickWrap) {
    quickWrap.innerHTML = "";
    var quickTerms = (tp.nlpKeywords && tp.nlpKeywords.length)
      ? tp.nlpKeywords.slice(0, 8).map(function (k) { return k.term; })
      : ragTopKeywords(chunks, 7);
    quickTerms.forEach(function (kw) {
      var b = el("button", "tab", kw);
      b.addEventListener("click", function () {
        if ($("ragQueryInput")) $("ragQueryInput").value = kw;
        runRagQuery();
      });
      quickWrap.appendChild(b);
    });
  }
}

function highlightMatches(text, tokens) {
  var safe = esc(text);
  (tokens || []).forEach(function (tk) {
    if (tk.length < 2) return;
    var escaped = tk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safe = safe.replace(new RegExp("(" + escaped + "[a-z0-9]*)", "gi"), "<mark>$1</mark>");
  });
  return safe;
}

function runRagQuery() {
  var tp = getRagTopic();
  var qInp = $("ragQueryInput"), box = $("ragResultsBox");
  if (!tp || !qInp || !box) return;
  var query = qInp.value.trim();
  if (!query) {
    box.innerHTML = '<div class="note">Type a topic keyword, question, or metric name above to retrieve matching textbook passages and stats.</div>';
    return;
  }
  box.innerHTML = '<div class="small muted">Searching hybrid BM25 + semantic vector index...</div>';
  ragBackendSearch(tp, query, 5).then(function (res) {
    box.innerHTML = "";
    if (!res.results.length && !res.matchingStats.length) {
      box.innerHTML = '<div class="fb bad">No passages matched "' + esc(query) + '". Try one of the indexed keywords above.</div>';
      return;
    }

    if (res.answerSummary) {
      var syn = el("div", "note");
      syn.style.margin = "0";
      var modeLabel = res.engine === "python-hybrid-sqlite"
        ? "Retrieved Hybrid RAG Context (Python BM25 + Semantic · SQLite)"
        : "Retrieved RAG Context (Local BM25)";
      syn.innerHTML = '<div class="status-text done" style="margin-bottom:6px">' + modeLabel + " — Top " + res.results.length + " grounded passages</div>" +
        '<div class="small" style="white-space:pre-line">' + highlightMatches(res.answerSummary, res.queryTokens) + "</div>";
      box.appendChild(syn);
    }

    res.results.forEach(function (hit) {
      var ch = hit.chunk;
      var card = el("div", "rag-hit");
      var badge = ch.sourceType === "pdf" ? "PDF" : (ch.sourceType === "excel" ? "EXCEL" : (ch.sourceType === "image" ? "IMAGE OCR" : "SOURCE"));
      var locLine = (ch.section && ch.section !== "Overview" ? (ch.section + " · ") : "") + (ch.location || (ch.pageNum ? ("Page " + ch.pageNum) : "Document"));
      var scoreLabel = hit.bm25Score != null
        ? ("hybrid " + Number(hit.score).toFixed(2) + " · bm25 " + Number(hit.bm25Score).toFixed(2) + " · sem " + Number(hit.semanticScore).toFixed(2))
        : ("score " + Number(hit.score).toFixed(2));
      card.innerHTML =
        '<div class="row">' +
        '<div class="meta-line" style="margin:0"><span class="status-text now">' + badge + '</span><span class="sep">·</span><span>' + esc(ch.sourceName) + '</span><span class="sep">·</span><span>' + esc(locLine) + '</span></div>' +
        '<span class="small muted" style="font-family:var(--font-mono)">' + scoreLabel + "</span>" +
        "</div>" +
        '<div class="small" style="line-height:1.55">' + highlightMatches(ch.text, res.queryTokens) + "</div>" +
        '<div class="row" style="justify-content:flex-start;gap:8px">' +
        '<button class="btn secondary sm" data-addconcept="1">+ Add as concept</button>' +
        '<button class="btn secondary sm" data-addquiz="1">+ Create quiz item</button>' +
        "</div>";
      box.appendChild(card);

      card.querySelector("[data-addconcept]").addEventListener("click", function () {
        var cur = getTopic(tp.id);
        var concepts = (cur.concepts || []).slice();
        var titleGuess = query.charAt(0).toUpperCase() + query.slice(1);
        concepts.push({ id: "rag_c_" + Date.now(), name: titleGuess.slice(0, 36), def: ch.text.slice(0, 220), kind: "concept" });
        saveTopicRagUpdate(tp.id, { concepts: concepts });
        if (edTopicId === tp.id) edDraft = null;
        toast("Added retrieved passage as a Concept.");
      });

      card.querySelector("[data-addquiz]").addEventListener("click", function () {
        var cur = getTopic(tp.id);
        var quiz = (cur.quiz || []).slice();
        var snippet = ch.text.slice(0, 110) + (ch.text.length > 110 ? "..." : "");
        var conceptAns = query.charAt(0).toUpperCase() + query.slice(1);
        var pageRef = ch.sourceName + " · " + (ch.pageNum ? ("Page " + ch.pageNum) : ch.location);
        quiz.push({
          q: "According to " + ch.sourceName + " (" + locLine + "), which topic fits: \"" + snippet + "\"?",
          opts: [conceptAns, "Unrelated mechanism", "Constant baseline", "Inverse baseline"],
          a: 0,
          why: ch.text.slice(0, 180),
          pageRef: pageRef,
          evidence: ch.text.slice(0, 220)
        });
        saveTopicRagUpdate(tp.id, { quiz: quiz });
        if (edTopicId === tp.id) edDraft = null;
        toast("Added evidence-cited quiz question to Editor.");
      });
    });
  });
}

/* ============================== EDITOR ============================== */

var edDraft = null;
var edTopicId = null;

function renderEditor() {
  var sel = $("editorTopicSelect");
  if (sel) {
    sel.innerHTML = "";
    allTopics().forEach(function (t) {
      var o = el("option"); o.value = t.id; o.textContent = t.title; sel.appendChild(o);
    });
    sel.value = state.activeTopicId;
    if (!sel._wired) {
      sel._wired = true;
      sel.addEventListener("change", function () { loadEditorDraft(sel.value); });
    }
  }
  var nameEl = $("editorTopicName");
  if (edTopicId !== state.activeTopicId || !edDraft) loadEditorDraft(state.activeTopicId);
  if (nameEl && T) nameEl.textContent = "(" + T.title + ")";

  // tabs
  var tabs = $("editorTabs");
  if (tabs && !tabs._wired) {
    tabs._wired = true;
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest(".tab");
      if (!b) return;
      tabs.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      var tab = b.getAttribute("data-tab");
      $("edConcepts").classList.toggle("hidden", tab !== "concepts");
      $("edRelationships").classList.toggle("hidden", tab !== "relationships");
      $("edQuiz").classList.toggle("hidden", tab !== "quiz");
      if ($("edGraph")) $("edGraph").classList.toggle("hidden", tab !== "graph");
      $("edDetails").classList.toggle("hidden", tab !== "details");
      $("edSource").classList.toggle("hidden", tab !== "source");
      if (tab === "concepts") drawConceptEditor();
      if (tab === "relationships") drawRelationshipsEditor();
      if (tab === "quiz") drawQuizEditor();
      if (tab === "graph") drawGraphEditor();
      if (tab === "details") drawDetailsEditor();
      if (tab === "source") drawSourceEditor();
    });
  }

  var saveBtn = $("edSaveBtn"), resetBtn = $("edResetBtn");
  if (saveBtn && !saveBtn._wired) {
    saveBtn._wired = true;
    saveBtn.addEventListener("click", saveEditor);
  }
  if (resetBtn && !resetBtn._wired) {
    resetBtn._wired = true;
    resetBtn.addEventListener("click", function () {
      if (!edTopicId) return;
      delete state.edits[edTopicId];
      store();
      loadEditorDraft(edTopicId);
      toast("Reset to sample content.");
    });
  }

  drawConceptEditor();
  drawRelationshipsEditor();
  drawQuizEditor();
  drawGraphEditor();
  drawDetailsEditor();
  drawSourceEditor();
}

function loadEditorDraft(id) {
  edTopicId = id;
  edDraft = clone(getTopic(id));
  setTopic(id);
  var nameEl = $("editorTopicName");
  if (nameEl && edDraft) nameEl.textContent = "(" + edDraft.title + ")";
  if ($("editorTopicSelect")) $("editorTopicSelect").value = id;
  drawConceptEditor();
  drawRelationshipsEditor();
  drawQuizEditor();
  drawGraphEditor();
  drawDetailsEditor();
  drawSourceEditor();
}

function drawConceptEditor() {
  var host = $("edConcepts"); if (!host || !edDraft) return;
  host.innerHTML = "";
  var list = el("div", "ed-list");
  edDraft.concepts.forEach(function (c, i) {
    var item = el("div", "ed-item");
    item.innerHTML = '<div class="hd"><span class="nm">' + esc(c.name || "Concept " + (i + 1)) + '</span><button class="btn ghost sm" data-del="' + i + '">Delete</button></div>' +
      '<div class="ed-grid" style="margin-top:8px">' +
      '<div><label>Name</label><input type="text" data-f="name" data-i="' + i + '" value="' + esc(c.name) + '"></div>' +
      '<div><label>Kind</label><input type="text" data-f="kind" data-i="' + i + '" value="' + esc(c.kind || "") + '"></div>' +
      '<div style="grid-column:1/-1"><label>Definition</label><textarea data-f="def" data-i="' + i + '">' + esc(c.def) + "</textarea></div>" +
      "</div>";
    list.appendChild(item);
  });
  var add = el("button", "btn secondary sm", "+ Add concept");
  add.style.marginTop = "12px";
  add.addEventListener("click", function () {
    edDraft.concepts.push({ id: "c" + Date.now(), name: "New concept", def: "", kind: "concept" });
    drawConceptEditor();
  });
  host.appendChild(list);
  host.appendChild(add);

  list.querySelectorAll("[data-f]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var i = +inp.getAttribute("data-i"), f = inp.getAttribute("data-f");
      if (edDraft.concepts[i]) edDraft.concepts[i][f] = inp.value;
    });
  });
  list.querySelectorAll("[data-del]").forEach(function (b) {
    b.addEventListener("click", function () { edDraft.concepts.splice(+b.getAttribute("data-del"), 1); drawConceptEditor(); });
  });
}

function drawQuizEditor() {
  var host = $("edQuiz"); if (!host || !edDraft) return;
  host.innerHTML = "";
  var list = el("div", "ed-list");
  edDraft.quiz.forEach(function (q, i) {
    var item = el("div", "ed-item");
    var optsHtml = q.opts.map(function (o, oi) {
      return '<div class="opt-edit"><span class="lbl">' + String.fromCharCode(65 + oi) + '</span><input type="text" data-q="' + i + '" data-o="' + oi + '" value="' + esc(o) + '"></div>';
    }).join("");
    var selOpts = q.opts.map(function (_, oi) { return '<option value="' + oi + '"' + (q.a === oi ? " selected" : "") + ">Option " + String.fromCharCode(65 + oi) + "</option>"; }).join("");
    item.innerHTML = '<div class="hd"><span class="nm">Q' + (i + 1) + "</span><button class=\"btn ghost sm\" data-qdel=\"" + i + "\">Delete</button></div>" +
      '<div style="margin-top:8px"><label>Question</label><input type="text" data-qf="q" data-i="' + i + '" value="' + esc(q.q) + '"></div>' +
      "<div style=\"margin-top:8px\">" + optsHtml + "</div>" +
      '<div class="ed-grid" style="margin-top:8px">' +
      '<div><label>Correct option</label><select data-qf="a" data-i="' + i + '">' + selOpts + "</select></div>" +
      '<div><label>Explanation</label><input type="text" data-qf="why" data-i="' + i + '" value="' + esc(q.why || "") + '"></div>' +
      "</div>";
    list.appendChild(item);
  });
  var add = el("button", "btn secondary sm", "+ Add question");
  add.style.marginTop = "12px";
  add.addEventListener("click", function () {
    edDraft.quiz.push({ q: "New question?", opts: ["A", "B", "C", "D"], a: 0, why: "" });
    drawQuizEditor();
  });
  host.appendChild(list);
  host.appendChild(add);

  list.querySelectorAll("[data-qf]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var i = +inp.getAttribute("data-i"), f = inp.getAttribute("data-qf");
      if (edDraft.quiz[i]) edDraft.quiz[i][f] = (f === "a") ? +inp.value : inp.value;
    });
  });
  list.querySelectorAll("[data-o]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var qi = +inp.getAttribute("data-q"), oi = +inp.getAttribute("data-o");
      if (edDraft.quiz[qi]) edDraft.quiz[qi].opts[oi] = inp.value;
    });
  });
  list.querySelectorAll("[data-qdel]").forEach(function (b) {
    b.addEventListener("click", function () { edDraft.quiz.splice(+b.getAttribute("data-qdel"), 1); drawQuizEditor(); });
  });
}

function drawRelationshipsEditor() {
  var host = $("edRelationships"); if (!host || !edDraft) return;
  host.innerHTML = "";
  edDraft.relationships = edDraft.relationships || [];
  var concepts = edDraft.concepts || [];
  if (concepts.length < 2) {
    host.innerHTML = '<div class="note">Add at least 2 concepts in the Concepts tab first, then connect them here to drive the Concept Map and Reconstruct views.</div>';
    return;
  }
  var list = el("div", "ed-list");
  function optionsHtml(selectedId) {
    return concepts.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === selectedId ? " selected" : "") + ">" + esc(c.name || c.id) + "</option>";
    }).join("");
  }
  edDraft.relationships.forEach(function (r, i) {
    var item = el("div", "ed-item");
    item.innerHTML = '<div class="hd"><span class="nm">Link ' + (i + 1) + '</span><button class="btn ghost sm" data-rdel="' + i + '">Delete</button></div>' +
      '<div class="ed-grid" style="margin-top:8px;grid-template-columns:1fr 1fr 1fr">' +
      '<div><label>From concept</label><select data-rf="from" data-i="' + i + '">' + optionsHtml(r.from) + "</select></div>" +
      '<div><label>Relationship</label><input type="text" data-rf="label" data-i="' + i + '" value="' + esc(r.label || "") + '"></div>' +
      '<div><label>To concept</label><select data-rf="to" data-i="' + i + '">' + optionsHtml(r.to) + "</select></div>" +
      "</div>";
    list.appendChild(item);
  });
  var add = el("button", "btn secondary sm", "+ Add relationship");
  add.style.marginTop = "12px";
  add.addEventListener("click", function () {
    edDraft.relationships.push({ from: concepts[0].id, to: concepts[1].id, label: "relates to" });
    drawRelationshipsEditor();
  });
  host.appendChild(list);
  host.appendChild(add);

  list.querySelectorAll("[data-rf]").forEach(function (inp) {
    var sync = function () {
      var i = +inp.getAttribute("data-i"), f = inp.getAttribute("data-rf");
      if (edDraft.relationships[i]) edDraft.relationships[i][f] = inp.value;
    };
    inp.addEventListener("input", sync);
    inp.addEventListener("change", sync);
  });
  list.querySelectorAll("[data-rdel]").forEach(function (b) {
    b.addEventListener("click", function () { edDraft.relationships.splice(+b.getAttribute("data-rdel"), 1); drawRelationshipsEditor(); });
  });
}

function drawGraphEditor() {
  var host = $("edGraph"); if (!host || !edDraft) return;
  host.innerHTML = "";
  edDraft.graph = edDraft.graph || { labels: [], series: [], xlabel: "", ylabel: "" };
  var g = edDraft.graph;
  var box = el("div", "ed-item");
  var seriesText = (g.series || []).map(function (s) { return s.name + ": " + (s.data || []).join(", "); }).join("\n");
  box.innerHTML =
    '<div class="ed-grid">' +
    '<div><label>X-axis label</label><input type="text" id="edXLabel" value="' + esc(g.xlabel || "") + '"></div>' +
    '<div><label>Y-axis label</label><input type="text" id="edYLabel" value="' + esc(g.ylabel || "") + '"></div>' +
    '</div>' +
    '<label>X-axis ticks (comma-separated)</label>' +
    '<input type="text" id="edGraphLabels" value="' + esc((g.labels || []).join(", ")) + '">' +
    '<label>Series (one per line: Series Name: 10, 20, 30)</label>' +
    '<textarea id="edGraphSeries" style="min-height:110px">' + esc(seriesText) + "</textarea>";
  host.appendChild(box);

  var syncGraph = function () {
    var xLab = $("edXLabel") ? $("edXLabel").value : "";
    var yLab = $("edYLabel") ? $("edYLabel").value : "";
    var lbls = ($("edGraphLabels") ? $("edGraphLabels").value : "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var palette = ["#558E9B", "#7EA85B", "#F2B44B"];
    var lines = ($("edGraphSeries") ? $("edGraphSeries").value : "").split(/\r?\n/).filter(function (l) { return l.indexOf(":") > -1; });
    var series = lines.map(function (ln, idx) {
      var parts = ln.split(":");
      var nm = parts[0].trim() || ("Series " + (idx + 1));
      var nums = parts.slice(1).join(":").split(",").map(function (n) { var v = parseFloat(n.trim()); return isNaN(v) ? 0 : v; });
      return { name: nm, color: palette[idx % palette.length], data: nums };
    });
    edDraft.graph = { labels: lbls, series: series, xlabel: xLab, ylabel: yLab };
  };
  ["edXLabel", "edYLabel", "edGraphLabels", "edGraphSeries"].forEach(function (id) {
    if ($(id)) $(id).addEventListener("input", syncGraph);
  });

  var stats = edDraft.extractedStats || [];
  if (stats.length) {
    var stBox = el("div", "ed-item");
    stBox.style.marginTop = "12px";
    stBox.innerHTML = "<strong>Extracted metrics from uploaded spreadsheets &amp; images (" + stats.length + ")</strong>" +
      '<div class="small muted" style="margin-top:6px">' +
      stats.slice(0, 12).map(function (s) { return "• " + esc(s.summary); }).join("<br>") +
      "</div>";
    host.appendChild(stBox);
  }
}

function drawDetailsEditor() {
  var host = $("edDetails"); if (!host || !edDraft) return;
  host.innerHTML = "";
  var box = el("div", "ed-item");
  box.innerHTML =
    '<label>Topic title</label><input type="text" id="edTitleInp" value="' + esc(edDraft.title || "") + '">' +
    '<label>Summary</label><textarea id="edSummaryInp">' + esc(edDraft.summary || "") + "</textarea>" +
    '<label>Classification tags (process, structure, concept, quant, procedure)</label>' +
    '<input type="text" id="edClassInp" value="' + esc(edDraft.classification || "") + '">';
  host.appendChild(box);
  $("edTitleInp").addEventListener("input", function (e) { edDraft.title = e.target.value; });
  $("edSummaryInp").addEventListener("input", function (e) { edDraft.summary = e.target.value; });
  $("edClassInp").addEventListener("input", function (e) { edDraft.classification = e.target.value; });
}

function drawSourceEditor() {
  var host = $("edSource"); if (!host || !edDraft) return;
  host.innerHTML = "";
  var ta = el("textarea");
  ta.style.minHeight = "240px";
  ta.placeholder = "Paste the source text (e.g. extracted from a textbook PDF, spreadsheet, or image OCR) here...";
  ta.value = edDraft.source_text || "";
  ta.addEventListener("input", function () { edDraft.source_text = ta.value; });
  host.appendChild(ta);
  host.appendChild(el("p", "small muted", "This text is stored with the topic and indexed for local RAG retrieval."));
}

function saveEditor() {
  if (!edDraft || !edTopicId) return;
  var prev = state.edits[edTopicId] || {};
  prev.title = edDraft.title;
  prev.summary = edDraft.summary;
  prev.classification = edDraft.classification || "concept";
  prev.concepts = edDraft.concepts;
  prev.quiz = edDraft.quiz;
  prev.relationships = edDraft.relationships || [];
  prev.graph = edDraft.graph || { labels: [], series: [] };
  prev.source_text = edDraft.source_text || "";
  state.edits[edTopicId] = prev;
  // refresh derived progress mastery keys
  var p = state.progress[edTopicId];
  if (p) { p.mastery = p.mastery || {}; edDraft.concepts.forEach(function (c) { if (p.mastery[c.id] == null) p.mastery[c.id] = 0; }); }
  store();
  T = getTopic(edTopicId);
  if ($("editorTopicName") && T) $("editorTopicName").textContent = "(" + T.title + ")";
  toast("Saved. Journeys now use your edited knowledge.");
}

/* ============================== REVIEW (SRS) ============================== */

var reviewQueue = [];

function renderReview() {
  var sel = $("reviewTopicSelect");
  if (sel) {
    sel.innerHTML = "";
    allTopics().forEach(function (t) {
      var o = el("option"); o.value = t.id; o.textContent = t.title; sel.appendChild(o);
    });
    sel.value = state.activeTopicId;
    if (!sel._wired) {
      sel._wired = true;
      sel.addEventListener("change", function () { setTopic(sel.value); setupReviewQueue(); });
    }
  }
  setupReviewQueue();
}

function setupReviewQueue() {
  if (!T) return;
  var today = todayStr();
  reviewQueue = T.concepts.filter(function (c) {
    var s = state.srs[srsKey(T.id, c.id)];
    return !s || s.due <= today;
  }).map(function (c) { return c.id; });
  drawSrsProgress();
  drawSrsCard();
  drawSrsSchedule();
}

function drawSrsProgress() {
  var host = $("srsProgress"); if (!host || !T) return;
  var today = todayStr();
  var total = T.concepts.length;
  var due = reviewQueue.length;
  var learned = T.concepts.filter(function (c) { var s = state.srs[srsKey(T.id, c.id)]; return s && s.reps > 0; }).length;
  host.innerHTML =
    '<span>Total concepts: <strong>' + total + "</strong></span>" +
    '<span aria-hidden="true">·</span>' +
    '<span>Due now: <strong>' + due + "</strong></span>" +
    '<span aria-hidden="true">·</span>' +
    '<span>Learned: <strong>' + learned + "</strong></span>";
}

function drawSrsCard() {
  var front = $("srsFront"), back = $("srsBack"), actions = $("srsActions");
  if (!front) return;
  actions.innerHTML = "";
  if (!T || reviewQueue.length === 0) {
    front.textContent = "All caught up!";
    front.className = "front";
    back.className = "back hidden";
    var done = el("p", "small muted", "No cards are due right now. Come back later, or keep learning in My Quest.");
    actions.appendChild(done);
    return;
  }
  var cid = reviewQueue[0];
  var c = T.concepts.find(function (x) { return x.id === cid; });
  front.textContent = c ? c.name : "Card";
  front.className = "front";
  back.textContent = c ? c.def : "";
  back.className = "back hidden";

  var reveal = el("button", "btn", "Show answer");
  reveal.addEventListener("click", function () {
    back.classList.remove("hidden");
    reveal.remove();
    gradeButtons();
  });
  actions.appendChild(reveal);

  function gradeButtons() {
    var grades = [
      { g: 0, label: "Again (now)", cls: "btn bad" },
      { g: 1, label: "Hard", cls: "btn warn" },
      { g: 2, label: "Good", cls: "btn good" },
      { g: 3, label: "Easy", cls: "btn" }
    ];
    grades.forEach(function (gr) {
      var b = el("button", gr.cls + " sm", gr.label);
      b.addEventListener("click", function () {
        srsReview(srsKey(T.id, cid), gr.g);
        reviewQueue.shift();
        if (gr.g === 0) {
          reviewQueue.push(cid);
        } else {
          addXP(2);
        }
        drawSrsProgress();
        drawSrsCard();
        drawSrsSchedule();
      });
      actions.appendChild(b);
    });
  }
}

function drawSrsSchedule() {
  var host = $("srsSchedule"); if (!host || !T) return;
  host.innerHTML = "";
  if (!T.concepts.length) { host.innerHTML = '<p class="small muted">No concepts yet - add them in the Editor.</p>'; return; }
  var list = el("div", "ed-list");
  T.concepts.forEach(function (c) {
    var s = state.srs[srsKey(T.id, c.id)] || { reps: 0, interval: 0, due: todayStr() };
    var item = el("div", "ed-item");
    item.style.padding = "10px 14px";
    item.innerHTML = '<div class="hd"><span class="nm">' + esc(c.name) + '</span><span class="small muted">reps ' + s.reps + " - interval " + s.interval + "d - due " + esc(s.due) + "</span></div>";
    list.appendChild(item);
  });
  host.appendChild(list);
}

/* ============================== INIT ============================== */

function init() {
  restore();
  setTopic(state.activeTopicId);
  var xp = $("xpVal"); if (xp) xp.textContent = state.xp;
  if (window.mermaid) {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: "#0A2322",
          primaryColor: "#144A47",
          primaryTextColor: "#E2FAF6",
          primaryBorderColor: "#2DDAC2",
          lineColor: "#2DDAC2",
          secondaryColor: "#0E3634",
          tertiaryColor: "#103F38"
        }
      });
    } catch (e) {}
  }

  var navBtns = document.querySelectorAll("#nav button");
  for (var i = 0; i < navBtns.length; i++) {
    navBtns[i].addEventListener("click", function () {
      var s = this.getAttribute("data-screen");
      if ((s === "quest") && !state.archetype) { showScreen("home"); return; }
      showScreen(s);
    });
  }

  var cont = $("continueBtn");
  if (cont) cont.addEventListener("click", function () {
    if (!state.archetype) { showScreen("home"); return; }
    var p = topicProgress();
    if (p.completed.length >= ARCHETYPES[state.archetype].journeys.length) { showScreen("dashboard"); return; }
    p.index = nextIncompleteIndex(p);
    store();
    showScreen("cycle");
  });

  var restart = $("restartJourneyBtn");
  if (restart) restart.addEventListener("click", function () { if (state.archetype) startJourney(state.archetype); });

  var next = $("nextStage");
  if (next) next.addEventListener("click", function () {
    if (!state.archetype) return;
    var a = ARCHETYPES[state.archetype];
    var p = topicProgress();
    if (p.completed.indexOf(p.index) === -1) { p.completed.push(p.index); state.xp += 10; store(); if ($("xpVal")) $("xpVal").textContent = state.xp; }
    if (p.index >= a.journeys.length - 1) { showScreen("quest"); toast("Journey complete!"); return; }
    p.index++; store(); renderCycle(); window.scrollTo({ top: 0, behavior: "smooth" });
  });

  var prev = $("prevStage");
  if (prev) prev.addEventListener("click", function () { var p = topicProgress(); if (p.index > 0) { p.index--; store(); renderCycle(); } });

  var back = $("backToQuest");
  if (back) back.addEventListener("click", function () { showScreen("quest"); });

  var toLib = $("toLibraryBtn");
  if (toLib) toLib.addEventListener("click", function () { showScreen("library"); });

  var libUp = $("libraryUploadBtn");
  if (libUp) libUp.addEventListener("click", function () { showScreen("upload"); });

  renderHome();
  var fromAssessment = typeof window !== "undefined" && window.location.search.indexOf("from=assessment") > -1;
  showScreen(fromAssessment || !state.archetype ? "home" : "quest");
}

document.addEventListener("DOMContentLoaded", init);