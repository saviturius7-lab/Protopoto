"use strict";
/* Unlocked Phase 1 — Local Multi-Modal RAG & Extraction Engine (zero AI API).
   Supports PDFs (PDF.js), Excel/CSV/TSV (SheetJS), Images (Canvas visual stats +
   Tesseract.js local OCR), JSON/TXT/MD, BM25 retrieval, and rule-based synthesis. */

var RAG_STOPWORDS = {
  the: 1, and: 1, for: 1, that: 1, with: 1, this: 1, from: 1, are: 1, was: 1, were: 1,
  have: 1, has: 1, had: 1, into: 1, your: 1, which: 1, what: 1, when: 1, where: 1, who: 1,
  how: 1, why: 1, can: 1, will: 1, not: 1, but: 1, they: 1, their: 1, about: 1, more: 1,
  than: 1, then: 1, also: 1, only: 1, each: 1, some: 1, such: 1, been: 1, being: 1,
  there: 1, here: 1, does: 1, did: 1, its: 1, all: 1, any: 1, one: 1, two: 1, may: 1,
  between: 1, through: 1, during: 1, under: 1, over: 1, while: 1, using: 1, used: 1
};

function ragTokenize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9.%/-]+/g, " ")
    .split(/\s+/)
    .map(function (w) { return w.replace(/^[./-]+|[./-]+$/g, ""); })
    .filter(function (w) { return w.length >= 2 && !RAG_STOPWORDS[w]; });
}

function ragChunkText(text, meta, chunkSize, overlap) {
  chunkSize = chunkSize || 460;
  overlap = overlap || 70;
  var clean = String(text || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  var paragraphs = clean.split(/\n{2,}/);
  var out = [];
  var seq = 0;

  function pushChunk(str, suffix) {
    var s = str.trim();
    if (!s) return;
    seq++;
    out.push({
      id: (meta.docId || "doc") + "_c" + seq + "_" + Math.random().toString(36).slice(2, 6),
      docId: meta.docId || "doc",
      sourceName: meta.sourceName || "Source",
      sourceType: meta.sourceType || "text",
      location: suffix ? (meta.location ? meta.location + " · " + suffix : suffix) : (meta.location || "Section " + seq),
      text: s,
      tokens: ragTokenize(s)
    });
  }

  var buf = "";
  paragraphs.forEach(function (para) {
    para = para.trim();
    if (!para) return;
    if ((buf + "\n" + para).length <= chunkSize) {
      buf = buf ? (buf + "\n" + para) : para;
      return;
    }
    if (buf) { pushChunk(buf); buf = ""; }
    if (para.length <= chunkSize) {
      buf = para;
    } else {
      var i = 0;
      while (i < para.length && out.length < 240) {
        var end = Math.min(para.length, i + chunkSize);
        if (end < para.length) {
          var dot = para.lastIndexOf(". ", end);
          if (dot > i + Math.floor(chunkSize * 0.5)) end = dot + 1;
          else {
            var sp = para.lastIndexOf(" ", end);
            if (sp > i + Math.floor(chunkSize * 0.5)) end = sp;
          }
        }
        pushChunk(para.slice(i, end));
        if (end >= para.length) break;
        i = Math.max(i + 40, end - overlap);
      }
    }
  });
  if (buf && out.length < 240) pushChunk(buf);
  return out;
}

function extractNumericStatsFromText(text, sourceName) {
  var lines = String(text || "").split(/\n+/);
  var stats = [];
  var seen = {};
  var re = /([A-Za-z][A-Za-z0-9 _/-]{2,32})[:=\s]+(-?\d+(?:\.\d+)?)\s*(%|kg|g|mg|m\/s2|m\/s|s|ms|min|hr|hrs|days?|km|m|cm|mm|N|J|W|V|A|Hz|C|F|K|\$|USD|EUR|GBP|units?)?/g;
  lines.forEach(function (line) {
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null && stats.length < 24) {
      var label = m[1].trim().replace(/^[-*•\d.)\s]+/, "");
      var val = parseFloat(m[2]);
      if (!label || isNaN(val) || label.length < 3) continue;
      var key = label.toLowerCase() + "::" + val;
      if (seen[key]) continue;
      seen[key] = 1;
      stats.push({
        sourceName: sourceName,
        label: label,
        value: val,
        unit: m[3] || "",
        summary: label + ": " + val + (m[3] ? " " + m[3] : "")
      });
    }
  });
  return stats;
}

function ragEnsureTopicChunks(topic) {
  if (!topic) return [];
  if (topic.ragChunks && topic.ragChunks.length) return topic.ragChunks;
  var chunks = [];
  (topic.concepts || []).forEach(function (c, i) {
    chunks = chunks.concat(ragChunkText(c.name + ": " + c.def, {
      docId: "topic_" + topic.id,
      sourceName: topic.title || "Topic",
      sourceType: "concept",
      location: "Concept " + (i + 1)
    }));
  });
  if (topic.source_text) {
    chunks = chunks.concat(ragChunkText(topic.source_text, {
      docId: "source_" + topic.id,
      sourceName: topic.title || "Source text",
      sourceType: "text",
      location: "Source Notes"
    }));
  }
  return chunks;
}

function ragTopKeywords(chunks, limit) {
  limit = limit || 8;
  var freq = {};
  (chunks || []).forEach(function (c) {
    var toks = c.tokens && c.tokens.length ? c.tokens : ragTokenize(c.text);
    var seen = {};
    toks.forEach(function (t) {
      if (t.length < 3 || /^\d+$/.test(t) || seen[t]) return;
      seen[t] = 1;
      freq[t] = (freq[t] || 0) + 1;
    });
  });
  return Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, limit);
}

function ragSearch(topic, query, topK) {
  topK = topK || 5;
  var chunks = ragEnsureTopicChunks(topic);
  var qStr = String(query || "").trim();
  var qTokens = ragTokenize(qStr);
  if (!qTokens.length && qStr) qTokens = qStr.toLowerCase().split(/\s+/).filter(Boolean);
  if (!chunks.length || !qTokens.length) {
    return { results: [], matchingStats: [], answerSummary: "", queryTokens: qTokens };
  }

  var N = chunks.length;
  var totalLen = 0;
  var df = {};
  chunks.forEach(function (ch) {
    var toks = ch.tokens && ch.tokens.length ? ch.tokens : (ch.tokens = ragTokenize(ch.text));
    totalLen += Math.max(1, toks.length);
    var uniq = {};
    toks.forEach(function (t) { if (!uniq[t]) { uniq[t] = 1; df[t] = (df[t] || 0) + 1; } });
  });
  var avgLen = totalLen / Math.max(1, N);
  var k1 = 1.5, b = 0.75;
  var qLower = qStr.toLowerCase();

  var scored = [];
  chunks.forEach(function (ch) {
    var toks = ch.tokens || [];
    var tf = {};
    toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
    var dl = Math.max(1, toks.length);
    var score = 0;
    var matched = [];

    qTokens.forEach(function (qt) {
      var freq = tf[qt] || 0;
      if (!freq) {
        // partial prefix match boost
        Object.keys(tf).forEach(function (tk) {
          if (tk.indexOf(qt) === 0 || (qt.length >= 4 && tk.indexOf(qt) > -1)) {
            freq += tf[tk] * 0.65;
          }
        });
      }
      if (freq > 0) {
        matched.push(qt);
        var docFreq = df[qt] || 1;
        var idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (dl / avgLen))));
      }
    });

    if (qLower.length >= 4 && ch.text.toLowerCase().indexOf(qLower) > -1) {
      score += 2.5;
    }
    if (score > 0) {
      scored.push({ chunk: ch, score: score, matchedTerms: matched });
    }
  });

  scored.sort(function (a, b) { return b.score - a.score; });
  var results = scored.slice(0, topK);

  var stats = topic.extractedStats || [];
  var matchingStats = stats.filter(function (st) {
    var hay = (st.label + " " + (st.sheet || "") + " " + (st.sourceName || "") + " " + (st.summary || "")).toLowerCase();
    return qTokens.some(function (qt) { return hay.indexOf(qt) > -1; });
  }).slice(0, 6);

  var parts = [];
  results.slice(0, 3).forEach(function (r) {
    var sentences = r.chunk.text.split(/(?<=[.!?])\s+|\n+/);
    var bestSent = sentences[0] || r.chunk.text;
    var bestHits = -1;
    sentences.forEach(function (s) {
      var sl = s.toLowerCase();
      var hits = qTokens.filter(function (qt) { return sl.indexOf(qt) > -1; }).length;
      if (hits > bestHits && s.trim().length > 10) { bestHits = hits; bestSent = s.trim(); }
    });
    parts.push("[" + r.chunk.sourceName + " · " + r.chunk.location + "] " + bestSent.slice(0, 220));
  });
  if (matchingStats.length) {
    parts.push("Matching metrics: " + matchingStats.map(function (s) { return s.summary; }).slice(0, 3).join("; "));
  }

  return {
    results: results,
    matchingStats: matchingStats,
    answerSummary: parts.join("\n\n"),
    queryTokens: qTokens,
    engine: "client-bm25"
  };
}

function ragBackendIngest(topicId, topicTitle, extracted) {
  if (!extracted || !extracted.doc) return Promise.resolve(null);
  var pages = (extracted.pages && extracted.pages.length)
    ? extracted.pages
    : [{ page: 1, location: extracted.doc.name || "Document", text: extracted.text || "" }];
  return fetch("/api/nlp/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topicId: topicId,
      topicTitle: topicTitle || "Imported Topic",
      docId: extracted.doc.id,
      sourceName: extracted.doc.name,
      sourceType: extracted.doc.type,
      pages: pages,
      stats: extracted.stats || []
    })
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).catch(function () {
    return null;
  });
}

function ragBackendSearch(topic, query, topK) {
  topK = topK || 5;
  if (!topic || !query) return Promise.resolve(ragSearch(topic, query, topK));
  var fallbackChunks = ragEnsureTopicChunks(topic).slice(0, 40).map(function (c) {
    return {
      id: c.id,
      docId: c.docId,
      sourceName: c.sourceName,
      sourceType: c.sourceType,
      pageNum: c.pageNum || 0,
      section: c.section || "",
      location: c.location || "Section",
      text: String(c.text || "").slice(0, 800)
    };
  });
  var stats = (topic.extractedStats || []).slice(0, 8);
  return fetch("/api/rag/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topicId: topic.id,
      topicTitle: topic.title || "Topic",
      query: query,
      topK: topK,
      fallbackChunks: fallbackChunks,
      stats: stats
    })
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (data) {
    var results = (data && data.results) || [];
    if (!results.length) {
      return ragSearch(topic, query, topK);
    }
    var qTokens = (data.query_tokens && data.query_tokens.length) ? data.query_tokens : ragTokenize(query);
    var matchingStats = stats.filter(function (st) {
      var hay = (st.label + " " + (st.sheet || "") + " " + (st.sourceName || "") + " " + (st.summary || "")).toLowerCase();
      return qTokens.some(function (qt) { return hay.indexOf(qt) > -1; });
    }).slice(0, 6);

    var summary = (data.answerSummary && String(data.answerSummary).trim()) || "";
    if (!summary) {
      var parts = [];
      results.slice(0, 3).forEach(function (r) {
        var ch = r.chunk;
        var sentences = ch.text.split(/(?<=[.!?])\s+|\n+/);
        var bestSent = sentences[0] || ch.text;
        var bestHits = -1;
        sentences.forEach(function (s) {
          var sl = s.toLowerCase();
          var hits = qTokens.filter(function (qt) { return sl.indexOf(qt) > -1; }).length;
          if (hits > bestHits && s.trim().length > 10) { bestHits = hits; bestSent = s.trim(); }
        });
        var locTag = ch.section && ch.section !== "Overview" ? (ch.section + " · " + ch.location) : ch.location;
        parts.push("[" + ch.sourceName + " · " + locTag + "] " + bestSent.slice(0, 220));
      });
      if (matchingStats.length) {
        parts.push("Matching metrics: " + matchingStats.map(function (s) { return s.summary; }).slice(0, 3).join("; "));
      }
      summary = parts.join("\n\n");
    }

    return {
      results: results,
      matchingStats: matchingStats,
      answerSummary: summary,
      queryTokens: qTokens,
      engine: data.engine || "python-hybrid-sqlite",
      model: data.model || ""
    };
  }).catch(function () {
    return ragSearch(topic, query, topK);
  });
}

function ragBackendGenerateQuiz(topic, count) {
  if (!topic) return Promise.resolve(null);
  var chunks = ragEnsureTopicChunks(topic).slice(0, 12).map(function (c) {
    return {
      sourceName: c.sourceName,
      pageNum: c.pageNum || 0,
      location: c.location || "Section",
      text: String(c.text || "").slice(0, 800)
    };
  });
  return fetch("/api/rag/generate-quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topicId: topic.id,
      topicTitle: topic.title || "Topic",
      count: count || 5,
      chunks: chunks
    })
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).catch(function () {
    return null;
  });
}

/* -------------------- MULTI-MODAL FILE EXTRACTORS -------------------- */

function ragExtractPdfFile(file, onProgress) {
  return new Promise(function (resolve, reject) {
    if (!window.pdfjsLib) {
      reject(new Error("PDF.js failed to load. Check your connection and refresh."));
      return;
    }
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    } catch (e) {}

    var reader = new FileReader();
    reader.onerror = function () { reject(new Error("Failed to read PDF file.")); };
    reader.onload = function () {
      var data = new Uint8Array(reader.result);
      pdfjsLib.getDocument({ data: data }).promise.then(function (doc) {
        var docId = "pdf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        var chunks = [];
        var pagesText = [];
        var pagesList = [];
        var stats = [];
        var chain = Promise.resolve();
        for (var i = 1; i <= doc.numPages; i++) {
          (function (n) {
            chain = chain.then(function () {
              return doc.getPage(n).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  var lineParts = [];
                  var curLine = [];
                  var lastY = null;
                  (tc.items || []).forEach(function (it) {
                    var str = String(it.str || "");
                    if (!str) return;
                    var y = (it.transform && it.transform.length >= 6) ? Math.round(it.transform[5]) : null;
                    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4 && curLine.length) {
                      lineParts.push(curLine.join(" ").replace(/[ \t]+/g, " ").trim());
                      curLine = [];
                    }
                    curLine.push(str);
                    if (it.hasEOL) {
                      lineParts.push(curLine.join(" ").replace(/[ \t]+/g, " ").trim());
                      curLine = [];
                      lastY = null;
                    } else if (y !== null) {
                      lastY = y;
                    }
                  });
                  if (curLine.length) lineParts.push(curLine.join(" ").replace(/[ \t]+/g, " ").trim());
                  var pageStr = lineParts.filter(Boolean).join("\n").trim();
                  if (pageStr) {
                    pagesText.push("--- Page " + n + " ---\n" + pageStr);
                    pagesList.push({ page: n, location: "Page " + n, text: pageStr });
                    chunks = chunks.concat(ragChunkText(pageStr, {
                      docId: docId,
                      sourceName: file.name,
                      sourceType: "pdf",
                      location: "Page " + n
                    }));
                    stats = stats.concat(extractNumericStatsFromText(pageStr, file.name + " p." + n));
                  }
                  if (onProgress) onProgress("Extracted PDF page " + n + " / " + doc.numPages + " (" + file.name + ")");
                });
              });
            });
          })(i);
        }
        chain.then(function () {
          var fullText = pagesText.join("\n\n");
          resolve({
            doc: {
              id: docId,
              name: file.name,
              type: "pdf",
              pages: doc.numPages,
              chars: fullText.length,
              chunkCount: chunks.length,
              previewText: fullText.slice(0, 600),
              addedAt: new Date().toISOString()
            },
            chunks: chunks,
            pages: pagesList,
            stats: stats.slice(0, 24),
            text: fullText,
            graph: null
          });
        }).catch(reject);
      }).catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseSpreadsheetWorkbook(wb, sourceName) {
  var docId = "xls_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  var chunks = [];
  var stats = [];
  var textParts = [];
  var graph = null;
  var totalRows = 0;

  wb.SheetNames.forEach(function (sheetName) {
    var sheet = wb.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    // Trim trailing completely empty rows
    rows = rows.filter(function (r) {
      return r.some(function (cell) { return String(cell).trim() !== ""; });
    });
    if (!rows.length) return;
    totalRows += rows.length;

    var headerRow = rows[0].map(function (h, idx) {
      var s = String(h == null ? "" : h).trim();
      return s || ("Column " + (idx + 1));
    });
    var dataRows = rows.slice(1);
    if (!dataRows.length) {
      var lone = headerRow.join(" | ");
      chunks = chunks.concat(ragChunkText(lone, {
        docId: docId, sourceName: sourceName, sourceType: "excel", location: sheetName
      }));
      textParts.push("--- Sheet: " + sheetName + " ---\n" + lone);
      return;
    }

    // Analyze numeric columns
    var colStats = [];
    var labelColIdx = 0;
    headerRow.forEach(function (colName, cIdx) {
      var nums = [];
      var nonNumCount = 0;
      dataRows.forEach(function (r) {
        var raw = r[cIdx];
        if (raw === "" || raw == null) return;
        var cleaned = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[$,%\s]/g, ""));
        if (!isNaN(cleaned) && isFinite(cleaned)) nums.push(cleaned);
        else nonNumCount++;
      });
      if (nonNumCount >= dataRows.length * 0.5 && cIdx === 0) labelColIdx = 0;
      if (nums.length >= 2) {
        var sum = nums.reduce(function (a, b) { return a + b; }, 0);
        var min = Math.min.apply(null, nums);
        var max = Math.max.apply(null, nums);
        var mean = sum / nums.length;
        var st = {
          sourceName: sourceName,
          sheet: sheetName,
          colIdx: cIdx,
          label: colName,
          count: nums.length,
          min: +min.toFixed(2),
          max: +max.toFixed(2),
          mean: +mean.toFixed(2),
          sum: +sum.toFixed(2),
          summary: colName + " (" + sheetName + "): mean " + mean.toFixed(2) + ", min " + min.toFixed(2) + ", max " + max.toFixed(2) + " (n=" + nums.length + ")"
        };
        colStats.push(st);
        stats.push(st);
      }
    });

    if (colStats.length) {
      var statSummaryText = "Sheet " + sheetName + " statistics (" + dataRows.length + " rows):\n" +
        colStats.map(function (s) { return "- " + s.summary; }).join("\n");
      chunks = chunks.concat(ragChunkText(statSummaryText, {
        docId: docId,
        sourceName: sourceName,
        sourceType: "excel",
        location: sheetName + " · Summary Stats"
      }));
      textParts.push(statSummaryText);
    }

    // Chunk rows in groups of 12
    var BATCH = 12;
    for (var start = 0; start < Math.min(dataRows.length, 300); start += BATCH) {
      var slice = dataRows.slice(start, start + BATCH);
      var lines = slice.map(function (r, rOffset) {
        var pairs = headerRow.map(function (h, ci) {
          var v = r[ci];
          return (v !== "" && v != null) ? (h + ": " + v) : "";
        }).filter(Boolean);
        return "Row " + (start + rOffset + 1) + ": " + pairs.join(", ");
      });
      var block = lines.join("\n");
      chunks = chunks.concat(ragChunkText(block, {
        docId: docId,
        sourceName: sourceName,
        sourceType: "excel",
        location: sheetName + " · Rows " + (start + 1) + "-" + (start + slice.length)
      }));
      textParts.push("--- " + sheetName + " (Rows " + (start + 1) + "-" + (start + slice.length) + ") ---\n" + block);
    }

    // Build Chart.js graph from the first sheet that has numeric columns
    if (!graph && colStats.length) {
      var sampled = dataRows.slice(0, 24);
      var labels = sampled.map(function (r, idx) {
        var lbl = r[labelColIdx];
        return (lbl !== "" && lbl != null) ? String(lbl).slice(0, 18) : ("Row " + (idx + 1));
      });
      var numericCols = colStats.filter(function (cs) { return cs.colIdx !== labelColIdx || colStats.length === 1; }).slice(0, 3);
      var palette = ["#D9E6A5", "#829A75", "#A9C8D5", "#5B9F97", "#536F9D", "#E8C547", "#E88F9B", "#D8876D", "#B88AAE", "#E6D4BC"];
      var series = numericCols.map(function (cs, sIdx) {
        return {
          name: cs.label,
          color: palette[sIdx % palette.length],
          data: sampled.map(function (r) {
            var raw = r[cs.colIdx];
            var v = typeof raw === "number" ? raw : parseFloat(String(raw || "").replace(/[$,%\s]/g, ""));
            return isNaN(v) ? 0 : v;
          })
        };
      });
      if (series.length) {
        graph = {
          labels: labels,
          series: series,
          xlabel: headerRow[labelColIdx] || "Entry",
          ylabel: numericCols.length === 1 ? numericCols[0].label : "Value"
        };
      }
    }
  });

  var fullText = textParts.join("\n\n");
  var pages = textParts.map(function (tp, idx) {
    return { page: idx + 1, location: "Sheet Section " + (idx + 1), text: tp };
  });
  return {
    doc: {
      id: docId,
      name: sourceName,
      type: "excel",
      sheets: wb.SheetNames.length,
      rows: totalRows,
      chars: fullText.length,
      chunkCount: chunks.length,
      previewText: fullText.slice(0, 500),
      addedAt: new Date().toISOString()
    },
    chunks: chunks,
    pages: pages,
    stats: stats,
    text: fullText,
    graph: graph
  };
}

function ragExtractSpreadsheetFile(file) {
  return new Promise(function (resolve, reject) {
    if (!window.XLSX) {
      reject(new Error("SheetJS (xlsx) library is not loaded."));
      return;
    }
    var lower = file.name.toLowerCase();
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error("Failed to read spreadsheet file.")); };
    if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
      reader.onload = function () {
        try {
          var wb = XLSX.read(String(reader.result || ""), { type: "string" });
          resolve(parseSpreadsheetWorkbook(wb, file.name));
        } catch (err) { reject(err); }
      };
      reader.readAsText(file);
    } else {
      reader.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
          resolve(parseSpreadsheetWorkbook(wb, file.name));
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}

function ragPrepareImageDataUrl(img, maxSide) {
  maxSide = maxSide || 1280;
  var nw = img.naturalWidth || img.width || 100;
  var nh = img.naturalHeight || img.height || 100;
  var scale = Math.min(1, maxSide / Math.max(1, nw, nh));
  var w = Math.max(1, Math.round(nw * scale));
  var h = Math.max(1, Math.round(nh * scale));
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch (e) {
    return "";
  }
}

function ragBackendDetectObjects(imageDataUrl, threshold) {
  if (!imageDataUrl) return Promise.resolve({ ok: false, detections: [], summary: "" });
  return fetch("/api/vision/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: imageDataUrl, threshold: threshold || 0.45 })
  }).then(function (r) {
    return r.json().then(function (d) {
      if (!r.ok) return { ok: false, error: (d && d.error) || ("HTTP " + r.status), visionConfigured: d && d.visionConfigured, detections: [] };
      return { ok: true, engine: d.engine, model: d.model, detections: d.detections || [], counts: d.counts || {}, summary: d.summary || "" };
    });
  }).catch(function (err) {
    return { ok: false, error: err && err.message ? err.message : "Network error", detections: [] };
  });
}

function ragBackendGenerateImage(prompt, style) {
  return fetch("/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt, style: style || "scenic", width: 1024, height: 768 })
  }).then(function (r) {
    return r.json().then(function (d) {
      if (!r.ok) return { ok: false, error: (d && d.error) || ("HTTP " + r.status) };
      return { ok: true, url: d.url, model: d.model };
    });
  }).catch(function (err) {
    return { ok: false, error: err && err.message ? err.message : "Network error" };
  });
}

function analyzeImagePixels(img) {
  var maxW = 320;
  var scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || 1));
  var w = Math.max(1, Math.round((img.naturalWidth || 100) * scale));
  var h = Math.max(1, Math.round((img.naturalHeight || 100) * scale));
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  var data = ctx.getImageData(0, 0, w, h).data;
  var sumLum = 0, minLum = 255, maxLum = 0, count = 0;
  var buckets = {};
  for (var i = 0; i < data.length; i += 16) {
    var r = data[i], g = data[i + 1], b = data[i + 2];
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sumLum += lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
    count++;
    var qr = Math.round(r / 32) * 32;
    var qg = Math.round(g / 32) * 32;
    var qb = Math.round(b / 32) * 32;
    var key = qr + "," + qg + "," + qb;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  var meanBright = Math.round(((sumLum / Math.max(1, count)) / 255) * 100);
  var contrast = Math.round(((maxLum - minLum) / 255) * 100);
  var topColors = Object.keys(buckets)
    .sort(function (a, b) { return buckets[b] - buckets[a]; })
    .slice(0, 3)
    .map(function (rgb) {
      var p = rgb.split(",").map(Number);
      return "#" + p.map(function (n) { return ("0" + Math.min(255, n).toString(16)).slice(-2); }).join("");
    });
  var thumb = "";
  try { thumb = canvas.toDataURL("image/jpeg", 0.78); } catch (e) {}
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    brightnessPct: meanBright,
    contrastPct: contrast,
    dominantColors: topColors,
    thumb: thumb
  };
}

function ragExtractImageFile(file, onProgress) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error("Could not read image file.")); };
    reader.onload = function () {
      var dataUrl = String(reader.result || "");
      var img = new Image();
      img.onerror = function () { reject(new Error("Invalid or corrupted image file.")); };
      img.onload = function () {
        var visual = analyzeImagePixels(img);
        var detectUrl = ragPrepareImageDataUrl(img, 1280) || visual.thumb;
        var docId = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

        var ocrPromise = new Promise(function (resOcr) {
          if (window.Tesseract && typeof Tesseract.recognize === "function") {
            if (onProgress) onProgress("Running OCR & object detection on " + file.name + " ...");
            var done = false;
            var timer = setTimeout(function () {
              if (!done) { done = true; resOcr({ text: "", note: "OCR timed out; visual metadata indexed." }); }
            }, 22000);
            Tesseract.recognize(dataUrl, "eng", {
              logger: function (m) {
                if (!done && onProgress && m && m.status) {
                  var pct = m.progress ? (" " + Math.round(m.progress * 100) + "%") : "";
                  onProgress("OCR (" + file.name + "): " + m.status + pct);
                }
              }
            }).then(function (res) {
              if (done) return;
              done = true; clearTimeout(timer);
              var txt = res && res.data && res.data.text ? res.data.text : "";
              resOcr({ text: txt, note: txt.trim() ? "OCR extracted locally" : "No text found in image" });
            }).catch(function () {
              if (done) return;
              done = true; clearTimeout(timer);
              resOcr({ text: "", note: "OCR unavailable offline; visual metadata indexed" });
            });
          } else {
            resOcr({ text: "", note: "OCR library unavailable; visual metadata indexed" });
          }
        });

        var visionPromise = ragBackendDetectObjects(detectUrl, 0.45);

        Promise.all([ocrPromise, visionPromise]).then(function (results) {
          var ocrRes = results[0] || { text: "", note: "" };
          var visRes = results[1] || { ok: false, detections: [], summary: "" };
          var cleanOcr = String(ocrRes.text || "").replace(/\r\n/g, "\n").trim();
          var detections = Array.isArray(visRes.detections) ? visRes.detections : [];
          var detSummary = visRes.ok && visRes.summary ? visRes.summary : "";

          var visualSummary = "Image " + file.name + " (" + visual.width + "x" + visual.height + " px, brightness " +
            visual.brightnessPct + "%, contrast " + visual.contrastPct + "%, palette " + visual.dominantColors.join(" ") + ").";
          var detectBlock = detections.length
            ? ("\n\nDetected Diagram & Page Regions (" + detections.length + "): " + detSummary + ".")
            : "";
          var ocrBlock = cleanOcr
            ? ("\n\nOCR Extracted Text:\n" + cleanOcr)
            : (detections.length ? "" : "\n\n(No readable text detected automatically — add caption or notes below to index visual details.)");
          var combinedText = visualSummary + detectBlock + ocrBlock;

          var chunks = ragChunkText(combinedText, {
            docId: docId,
            sourceName: file.name,
            sourceType: "image",
            location: detections.length ? "Image Vision + OCR" : (cleanOcr ? "Image OCR" : "Image Visual Stats")
          });

          var stats = [
            { sourceName: file.name, label: "Resolution", value: visual.width + "x" + visual.height, unit: "px", summary: file.name + " resolution: " + visual.width + "x" + visual.height + " px" },
            { sourceName: file.name, label: "Brightness / Contrast", value: visual.brightnessPct + "% / " + visual.contrastPct + "%", unit: "", summary: file.name + " brightness " + visual.brightnessPct + "%, contrast " + visual.contrastPct + "%" }
          ];
          if (detections.length) {
            stats.push({ sourceName: file.name, label: "Detected Elements", value: detections.length, unit: "regions", summary: file.name + " detected: " + detSummary });
          }
          stats = stats.concat(extractNumericStatsFromText(cleanOcr, file.name));

          resolve({
            doc: {
              id: docId,
              name: file.name,
              type: "image",
              width: visual.width,
              height: visual.height,
              brightnessPct: visual.brightnessPct,
              contrastPct: visual.contrastPct,
              dominantColors: visual.dominantColors,
              thumb: visual.thumb,
              detections: detections,
              detectionSummary: detSummary || (visRes.error ? visRes.error : ""),
              ocrText: cleanOcr,
              ocrNote: ocrRes.note,
              chars: combinedText.length,
              chunkCount: chunks.length,
              previewText: combinedText.slice(0, 450),
              addedAt: new Date().toISOString()
            },
            chunks: chunks,
            pages: [{ page: 1, location: detections.length ? "Image Vision + OCR" : (cleanOcr ? "Image OCR" : "Image Visual Stats"), text: combinedText }],
            stats: stats,
            text: "--- Image: " + file.name + " ---\n" + combinedText,
            graph: null
          });
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function parseJsonStatsObject(obj, sourceName) {
  var docId = "json_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  var stats = [];
  var lines = [];
  var graph = null;

  if (Array.isArray(obj) && obj.length && typeof obj[0] === "object") {
    var keys = Object.keys(obj[0]);
    var labelKey = keys.find(function (k) { return typeof obj[0][k] === "string"; }) || keys[0];
    var numKeys = keys.filter(function (k) { return typeof obj[0][k] === "number"; }).slice(0, 3);
    obj.slice(0, 200).forEach(function (row, idx) {
      lines.push("Record " + (idx + 1) + ": " + keys.map(function (k) { return k + "=" + row[k]; }).join(", "));
    });
    numKeys.forEach(function (nk) {
      var vals = obj.map(function (r) { return r[nk]; }).filter(function (v) { return typeof v === "number" && isFinite(v); });
      if (vals.length) {
        var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
        stats.push({
          sourceName: sourceName, label: nk, count: vals.length, min: +min.toFixed(2), max: +max.toFixed(2), mean: +mean.toFixed(2),
          summary: nk + ": mean " + mean.toFixed(2) + ", min " + min.toFixed(2) + ", max " + max.toFixed(2)
        });
      }
    });
    if (numKeys.length) {
      var palette = ["#D9E6A5", "#829A75", "#A9C8D5", "#5B9F97", "#536F9D", "#E8C547", "#E88F9B", "#D8876D", "#B88AAE", "#E6D4BC"];
      var sampled = obj.slice(0, 24);
      graph = {
        labels: sampled.map(function (r, idx) { return String(r[labelKey] || ("Item " + (idx + 1))).slice(0, 18); }),
        series: numKeys.map(function (nk, i) {
          return { name: nk, color: palette[i % palette.length], data: sampled.map(function (r) { return Number(r[nk]) || 0; }) };
        }),
        xlabel: labelKey, ylabel: numKeys[0]
      };
    }
  } else if (obj && typeof obj === "object") {
    if (Array.isArray(obj.labels) && Array.isArray(obj.series)) {
      graph = obj;
    }
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (typeof v === "number") {
        stats.push({ sourceName: sourceName, label: k, value: v, summary: k + ": " + v });
        lines.push(k + ": " + v);
      } else {
        lines.push(k + ": " + JSON.stringify(v).slice(0, 260));
      }
    });
  }
  var fullText = lines.join("\n");
  var chunks = ragChunkText(fullText, {
    docId: docId, sourceName: sourceName, sourceType: "stats", location: "JSON Stats"
  });
  return {
    doc: {
      id: docId, name: sourceName, type: "stats", chars: fullText.length,
      chunkCount: chunks.length, previewText: fullText.slice(0, 450), addedAt: new Date().toISOString()
    },
    chunks: chunks,
    pages: [{ page: 1, location: "JSON Stats", text: fullText }],
    stats: stats,
    text: "--- Stats: " + sourceName + " ---\n" + fullText,
    graph: graph
  };
}

function ragExtractTextOrJsonFile(file) {
  return new Promise(function (resolve, reject) {
    var lower = file.name.toLowerCase();
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error("Could not read file.")); };
    reader.onload = function () {
      var raw = String(reader.result || "");
      if (lower.endsWith(".json")) {
        try {
          resolve(parseJsonStatsObject(JSON.parse(raw), file.name));
          return;
        } catch (e) {}
      }
      var docId = "txt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      var chunks = ragChunkText(raw, {
        docId: docId, sourceName: file.name, sourceType: "text", location: "Text Document"
      });
      var stats = extractNumericStatsFromText(raw, file.name);
      resolve({
        doc: {
          id: docId, name: file.name, type: "text", chars: raw.length,
          chunkCount: chunks.length, previewText: raw.slice(0, 450), addedAt: new Date().toISOString()
        },
        chunks: chunks,
        pages: [{ page: 1, location: "Text Document", text: raw }],
        stats: stats,
        text: "--- " + file.name + " ---\n" + raw,
        graph: null
      });
    };
    reader.readAsText(file);
  });
}

function ragExtractAnyFile(file, onProgress) {
  var lower = file.name.toLowerCase();
  var type = (file.type || "").toLowerCase();
  if (lower.endsWith(".pdf") || type === "application/pdf") {
    return ragExtractPdfFile(file, onProgress);
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    if (onProgress) onProgress("Parsing spreadsheet " + file.name + " ...");
    return ragExtractSpreadsheetFile(file);
  }
  if (type.indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif)$/.test(lower)) {
    return ragExtractImageFile(file, onProgress);
  }
  if (onProgress) onProgress("Indexing document " + file.name + " ...");
  return ragExtractTextOrJsonFile(file);
}

function ragExtractPasted(label, rawText) {
  var name = (label || "").trim() || "Pasted Notes";
  var raw = String(rawText || "").trim();
  var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
  var looksCsv = lines.length >= 2 && lines[0].indexOf(",") > -1 && lines[1].indexOf(",") > -1 && window.XLSX;
  if (looksCsv) {
    try {
      var wb = XLSX.read(raw, { type: "string" });
      return parseSpreadsheetWorkbook(wb, name);
    } catch (e) {}
  }
  if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
    try {
      return parseJsonStatsObject(JSON.parse(raw), name);
    } catch (e) {}
  }
  var docId = "paste_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  var chunks = ragChunkText(raw, {
    docId: docId, sourceName: name, sourceType: "text", location: "Pasted Passage"
  });
  var stats = extractNumericStatsFromText(raw, name);
  return {
    doc: {
      id: docId, name: name, type: "text", chars: raw.length,
      chunkCount: chunks.length, previewText: raw.slice(0, 450), addedAt: new Date().toISOString()
    },
    chunks: chunks,
    pages: [{ page: 1, location: "Pasted Passage", text: raw }],
    stats: stats,
    text: "--- " + name + " ---\n" + raw,
    graph: null
  };
}

/* -------------------- RULE-BASED KNOWLEDGE-UNIT SYNTHESIS -------------------- */

function ragAutoExtractUnits(topic) {
  var chunks = ragEnsureTopicChunks(topic);
  var fullText = chunks.map(function (c) { return c.text; }).join("\n");
  var stats = topic.extractedStats || [];

  var concepts = (topic.concepts || []).slice();
  var seenNames = {};
  concepts.forEach(function (c) { seenNames[c.name.toLowerCase()] = 1; });

  function addConcept(name, def, kind) {
    var cleanName = String(name || "").trim().replace(/^[-*•\d.)\s]+|[:.;]+$/g, "");
    var cleanDef = String(def || "").trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 48 || !cleanDef || cleanDef.length < 6) return;
    if (seenNames[cleanName.toLowerCase()] || concepts.length >= 16) return;
    seenNames[cleanName.toLowerCase()] = 1;
    concepts.push({
      id: "c_" + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 22) + "_" + concepts.length,
      name: cleanName,
      def: cleanDef.slice(0, 220),
      kind: kind || "concept"
    });
  }

  // 1. Definition & mechanism patterns ("Term: explanation", "Term is/means/converts ...")
  var defLines = fullText.split(/\n+|(?<=[.!?])\s+/);
  defLines.forEach(function (line) {
    var l = line.trim();
    if (l.length < 12 || l.length > 280) return;
    var m1 = l.match(/^(?:[-*•]\s*)?([A-Z][A-Za-z0-9 ()/'-]{2,38})\s*[:—-]\s+(.{10,210})$/);
    if (m1 && !/^(Row|Page|Sheet|Record|Image|Figure|Table|---)/i.test(m1[1])) {
      addConcept(m1[1], m1[2], "concept");
      return;
    }
    var m2 = l.match(/^(?:The\s+|An?\s+)?([A-Za-z][A-Za-z0-9 ()/'-]{2,36})\s+(?:is defined as|refers to|means|represents|describes|is the|are the|is a|are)\s+(.{10,210})$/i);
    if (m2 && m2[1].split(/\s+/).length <= 5) {
      addConcept(m2[1], m2[2], "concept");
      return;
    }
    var m3 = l.match(/^(?:The\s+|An?\s+)?([A-Z][A-Za-z0-9 ()/'-]{2,36})\s+(?:converts|produces|causes|triggers|drives|requires|regulates|controls)\s+(.{10,210})$/);
    if (m3 && m3[1].split(/\s+/).length <= 5) {
      addConcept(m3[1], l, "process");
    }
  });

  // 2. Extracted spreadsheet / numeric stats as quantitative concepts
  stats.forEach(function (st) {
    if (st.mean != null) {
      addConcept(st.label, "Measured dataset metric (" + (st.sheet || st.sourceName) + "): mean " + st.mean + ", range " + st.min + " to " + st.max + " across " + st.count + " entries.", "variable");
    } else if (st.summary && !/resolution|brightness/i.test(st.label)) {
      addConcept(st.label, "Extracted value from " + st.sourceName + ": " + st.value + (st.unit ? " " + st.unit : "") + ".", "variable");
    }
  });

  // 3. Fallback top keywords with contextual sentences if < 6 concepts
  var kws = ragTopKeywords(chunks, 12);
  if (concepts.length < 6) {
    kws.forEach(function (kw) {
      if (concepts.length >= 8) return;
      var match = chunks.find(function (c) { return c.text.toLowerCase().indexOf(kw) > -1; });
      if (match) {
        var sents = match.text.split(/(?<=[.!?])\s+|\n+/);
        var sent = sents.find(function (s) { return s.toLowerCase().indexOf(kw) > -1 && s.length > 15; }) || match.text;
        addConcept(kw.charAt(0).toUpperCase() + kw.slice(1), sent.slice(0, 190), "concept");
      }
    });
  }

  // 4. Relationships between concepts appearing together in chunks
  var rels = (topic.relationships || []).slice();
  var relSeen = {};
  rels.forEach(function (r) { relSeen[r.from + "->" + r.to] = 1; });
  var verbRes = [
    { re: /\b(causes?|drives?|triggers?)\b/i, lbl: "causes" },
    { re: /\b(produces?|creates?|builds?|generates?|yields?)\b/i, lbl: "produces" },
    { re: /\b(requires?|needs?|depends on)\b/i, lbl: "requires" },
    { re: /\b(increases?|raises?|boosts?)\b/i, lbl: "increases" },
    { re: /\b(decreases?|reduces?|limits?|opposes?)\b/i, lbl: "limits" },
    { re: /\b(contains?|includes?|holds?)\b/i, lbl: "contains" }
  ];
  for (var i = 0; i < concepts.length && rels.length < 12; i++) {
    for (var j = i + 1; j < concepts.length && rels.length < 12; j++) {
      var a = concepts[i], b = concepts[j];
      var shared = chunks.find(function (ch) {
        var low = ch.text.toLowerCase();
        return low.indexOf(a.name.toLowerCase()) > -1 && low.indexOf(b.name.toLowerCase()) > -1;
      });
      if (shared && !relSeen[a.id + "->" + b.id]) {
        var lbl = "relates to";
        for (var v = 0; v < verbRes.length; v++) {
          if (verbRes[v].re.test(shared.text)) { lbl = verbRes[v].lbl; break; }
        }
        relSeen[a.id + "->" + b.id] = 1;
        rels.push({ from: a.id, to: b.id, label: lbl });
      }
    }
  }

  // 5. Process steps from numbered lines
  var process = (topic.process || []).slice();
  if (!process.length) {
    fullText.split(/\n+/).forEach(function (ln) {
      var pm = ln.trim().match(/^(?:\d+[.)]|Step\s+\d+[:.]?)\s+(.{8,140})$/i);
      if (pm && process.length < 6) {
        var words = pm[1].split(/\s+/);
        process.push({ t: words.slice(0, 3).join(" ").replace(/[:.,]+$/, ""), d: pm[1] });
      }
    });
  }

  // 6. Multi-type evidence-cited quiz questions (concepts, cloze prose, stats)
  var quiz = (topic.quiz || []).slice();
  var quizSeen = {};
  quiz.forEach(function (q) { quizSeen[q.q] = 1; });
  var kwTitles = kws.map(function (k) { return k.charAt(0).toUpperCase() + k.slice(1); });

  function getDistractors(ansLabel) {
    var out = [];
    var seenD = {};
    seenD[ansLabel.toLowerCase()] = 1;
    var docVocab = [];
    var vSeen = {};
    chunks.forEach(function (ch) {
      ragTokenize(ch.text).forEach(function (tok) {
        if (tok.length >= 5 && !/^\d+$/.test(tok) && !vSeen[tok]) {
          vSeen[tok] = 1;
          docVocab.push(tok.charAt(0).toUpperCase() + tok.slice(1));
        }
      });
    });
    concepts.map(function (x) { return x.name; }).concat(kwTitles).concat(docVocab).forEach(function (cand) {
      var low = cand.toLowerCase();
      if (!seenD[low] && low.indexOf(ansLabel.toLowerCase()) === -1 && ansLabel.toLowerCase().indexOf(low) === -1 && out.length < 3) {
        seenD[low] = 1;
        out.push(cand);
      }
    });
    ["Equilibrium rate", "Reaction pathway", "Structural threshold"].forEach(function (fb) {
      if (out.length < 3 && !seenD[fb.toLowerCase()]) out.push(fb);
    });
    return out;
  }

  concepts.forEach(function (c, idx) {
    if (quiz.length >= 6) return;
    var refStr = (c.source || topic.title || "Source") + " · " + (c.page ? ("Page " + c.page) : (c.section || "Notes"));
    var qText = "Which concept matches this description (" + refStr + "): \"" + c.def.slice(0, 125) + (c.def.length > 125 ? "..." : "") + "\"?";
    if (quizSeen[qText]) return;
    var opts = [c.name].concat(getDistractors(c.name));
    var ansIdx = idx % opts.length;
    var tmp = opts[0]; opts[0] = opts[ansIdx]; opts[ansIdx] = tmp;
    quizSeen[qText] = 1;
    quiz.push({ q: qText, opts: opts, a: ansIdx, why: c.name + ": " + c.def, pageRef: refStr, evidence: c.evidence || c.def });
  });

  // Prose cloze fill-in questions if fewer than 6 questions exist
  chunks.forEach(function (ch, cIdx) {
    if (quiz.length >= 8) return;
    var refStr = (ch.sourceName || topic.title || "Source") + " · " + (ch.location || "Section");
    var sents = ch.text.split(/(?<=[.!?])\s+|\n+/);
    sents.forEach(function (s, sIdx) {
      if (quiz.length >= 8) return;
      s = s.trim();
      if (s.length < 32 || s.length > 230) return;
      var target = kwTitles.find(function (k) { return new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(s); });
      if (!target) {
        var toks = ragTokenize(s).filter(function (t) { return t.length >= 5 && !/^\d+$/.test(t); });
        if (toks.length) target = toks[0].charAt(0).toUpperCase() + toks[0].slice(1);
      }
      if (!target) return;
      var re = new RegExp("\\b" + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      var masked = s.replace(re, "______");
      if (masked.indexOf("______") === -1) return;
      var qText = "Complete this passage (" + refStr + "): \"" + masked + "\"";
      if (quizSeen[qText]) return;
      var opts = [target].concat(getDistractors(target));
      var ansIdx = (cIdx + sIdx) % opts.length;
      var tmp = opts[0]; opts[0] = opts[ansIdx]; opts[ansIdx] = tmp;
      quizSeen[qText] = 1;
      quiz.push({ q: qText, opts: opts, a: ansIdx, why: "Source evidence: " + s, pageRef: refStr, evidence: s });
    });
  });

  stats.filter(function (s) { return s.mean != null; }).slice(0, 2).forEach(function (s) {
    var refStr = (s.sourceName || "Spreadsheet") + " · " + (s.sheet || "Sheet1");
    var qText = "In " + refStr + ", what is the mean value recorded for " + s.label + "?";
    if (quizSeen[qText]) return;
    var opts = [
      String(s.mean),
      String(s.min),
      String(s.max),
      String(+(s.mean * 1.35 + 1).toFixed(2))
    ];
    quizSeen[qText] = 1;
    quiz.push({ q: qText, opts: opts, a: 0, why: "Extracted dataset stats show mean " + s.mean + " (range " + s.min + " to " + s.max + ").", pageRef: refStr, evidence: s.summary || "" });
  });

  // 7. Classification & Diagram / Story defaults
  var tags = [];
  if ((topic.graph && topic.graph.series && topic.graph.series.length) || stats.length) tags.push("quant");
  if (process.length) tags.push("process");
  if (rels.length) tags.push("relation");
  tags.push("concept");

  var diagram = topic.diagram || { inputs: [], outputs: [], center: topic.title || "Topic", centerSub: "extracted knowledge" };
  if ((!diagram.inputs || !diagram.inputs.length) && concepts.length >= 2) {
    diagram = {
      inputs: concepts.slice(0, 2).map(function (c) { return { label: c.name.slice(0, 18), color: "#D9E6A5" }; }),
      outputs: concepts.slice(2, 4).map(function (c) { return { label: c.name.slice(0, 18), color: "#E88F9B" }; }),
      center: (topic.title || "System").slice(0, 24),
      centerSub: (concepts.length + " concepts · " + chunks.length + " passages")
    };
  }

  var story = topic.story && topic.story.scenes && topic.story.scenes.length ? topic.story : {
    title: topic.title + " walkthrough",
    scenes: chunks.slice(0, 4).map(function (ch, idx) {
      return { t: ch.location || ("Part " + (idx + 1)), d: ch.text.slice(0, 140) };
    })
  };

  var keywords = concepts.slice(0, 5).map(function (c) {
    var safePat = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { pattern: safePat, msg: c.name };
  });

  // 8. Full-cycle learning units (worked, guide, hint, hook, evidence, challenge, game, misconceptions)
  var worked = (topic.worked && topic.worked.length) ? topic.worked : (
    process.length
      ? process.map(function (p) { return { t: p.t, d: p.d }; })
      : concepts.slice(0, 4).map(function (c, idx) { return { t: "Step " + (idx + 1) + ": " + c.name, d: c.def }; })
  );

  var guide = (topic.guide && topic.guide.length) ? topic.guide : concepts.slice(0, 3).map(function (c) {
    return {
      q: "The term matching \"" + c.def.slice(0, 110) + (c.def.length > 110 ? "..." : "") + "\" is ______.",
      a: c.name,
      hint: "Starts with \"" + c.name.charAt(0) + "\" (" + c.name.length + " chars)."
    };
  });

  var topConcept = concepts[0] || { name: topic.title || "Main idea", def: "Core principle from your source." };
  var secondConcept = concepts[1] || topConcept;
  var hint = (topic.hint && topic.hint.hints && topic.hint.hints.length) ? topic.hint : {
    question: "How does " + topConcept.name + " contribute to " + (topic.title || "this system") + "?",
    hints: [
      "Recall the role of " + topConcept.name + ".",
      topConcept.def.slice(0, 120),
      "Connect " + topConcept.name + " with " + secondConcept.name + "."
    ],
    keywords: keywords.slice(0, 2),
    answerHtml: topConcept.name + ": " + topConcept.def
  };

  var hook = (topic.hook && topic.hook.prompt && topic.hook.prompt.indexOf("What stands out") === -1) ? topic.hook : {
    prompt: "Looking at " + (topic.title || "your source") + ": why is " + topConcept.name + " essential, and what would break if it changed?"
  };

  var evOptions = [topConcept.def.slice(0, 130)];
  if (concepts[1]) evOptions.push("It is unrelated to " + concepts[1].name + " and acts independently.");
  else evOptions.push("It remains constant regardless of surrounding conditions.");
  evOptions.push("It only appears as measurement noise with no causal effect.");
  var evidence = (topic.evidence && topic.evidence.options && topic.evidence.options.length > 2) ? topic.evidence : {
    prompt: "Based on your indexed source for " + (topic.title || "this topic") + ", which statement best describes " + topConcept.name + "?",
    options: evOptions,
    answer: 0,
    why: topConcept.name + ": " + topConcept.def
  };

  var challenge = (topic.challenge && topic.challenge.keywords && topic.challenge.keywords.length) ? topic.challenge : {
    prompt: "Apply what you read in " + (topic.title || "the source") + ": explain how " + topConcept.name + " and " + secondConcept.name + " interact in a real scenario.",
    keywords: keywords,
    minCorrect: Math.min(2, Math.max(1, keywords.length)),
    why: "Key connection: " + topConcept.name + " (" + topConcept.def.slice(0, 90) + ") relates to " + secondConcept.name + "."
  };

  var game = topic.game;
  if (!game || !game.sliders || game.sliders.length < 2 || (game.sliders[0] && game.sliders[0].label === "Factor A")) {
    var sliderLabels = concepts.slice(0, 3).map(function (c, i) {
      return { id: "f" + i, label: c.name.slice(0, 16) };
    });
    if (sliderLabels.length < 2) {
      sliderLabels = [{ id: "f0", label: "Input Level" }, { id: "f1", label: "System Rate" }];
    }
    game = {
      title: (topic.title || "System") + " balance lab",
      unit: "balance",
      kind: "limiting",
      target: 0,
      goal: "Balance the key factors from " + (topic.title || "your source") + ". The lowest factor limits overall system output.",
      sliders: sliderLabels
    };
  }

  var misconceptions = (topic.misconceptions && topic.misconceptions.length) ? topic.misconceptions : concepts.slice(0, 2).map(function (c) {
    return {
      wrong: c.name + " operates completely independently of other factors.",
      right: c.name + ": " + c.def
    };
  });

  return {
    concepts: concepts,
    relationships: rels,
    process: process,
    quiz: quiz,
    classification: Array.from(new Set(tags)).join(", "),
    diagram: diagram,
    story: story,
    worked: worked,
    guide: guide,
    hint: hint,
    hook: hook,
    evidence: evidence,
    challenge: challenge,
    game: game,
    misconceptions: misconceptions,
    explain: {
      prompt: "Explain the core ideas from " + (topic.title || "this topic") + " in your own words.",
      keywords: keywords,
      minCorrect: Math.min(2, Math.max(1, keywords.length))
    }
  };
}
