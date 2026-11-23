"use strict";
/* Unlocked Phase 1 — features: PDF upload/extraction, knowledge-unit editor,
   spaced-repetition review, and app init/wiring. Depends on data.js + engine.js. */

/* ============================== UPLOAD (PDF.js) ============================== */

var pdfTextCache = "";

function renderUpload() {
  var zone = $("uploadZone"), input = $("fileInput");
  if (!zone) return;
  if (!zone._wired) {
    zone._wired = true;
    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.style.borderColor = "var(--accent)"; });
    zone.addEventListener("dragleave", function () { zone.style.borderColor = ""; });
    zone.addEventListener("drop", function (e) {
      e.preventDefault(); zone.style.borderColor = "";
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePdf(e.dataTransfer.files[0]);
    });
    input.addEventListener("change", function () { if (input.files && input.files[0]) handlePdf(input.files[0]); });
  }
  var cb = $("createTopicBtn");
  if (cb && !cb._wired) {
    cb._wired = true;
    cb.addEventListener("click", function () {
      if (!pdfTextCache) { toast("Upload a PDF first."); return; }
      var id = "custom_" + Date.now();
      var topic = {
        id: id,
        title: "Imported document",
        summary: pdfTextCache.slice(0, 100) + (pdfTextCache.length > 100 ? "..." : ""),
        classification: "concept",
        concepts: [], relationships: [], process: [], story: { title: "Source document", scenes: [] },
        graph: { labels: [], series: [] },
        diagram: { inputs: [], outputs: [], center: "Topic", centerSub: "add knowledge units in the Editor" },
        worked: [], guide: [], quiz: [], misconceptions: [],
        hint: { question: "Add a question in the Editor.", hints: [], keywords: [], answerHtml: "" },
        explain: { prompt: "Explain the main idea.", keywords: [], minCorrect: 1 },
        predict: { prompt: "What do you predict?", revealHtml: "" },
        hook: { prompt: "What stands out in this document?" },
        evidence: { prompt: "Which explanation fits?", options: ["Option A", "Option B"], answer: 0, why: "" },
        challenge: { prompt: "Apply the main idea to a new problem.", keywords: [], minCorrect: 1, why: "" },
        game: { title: "Interactive simulation", goal: "Adjust the variables.", kind: "limiting", target: 0, unit: "score", sliders: [{ id: "a", label: "Factor A" }, { id: "b", label: "Factor B" }] },
        source_text: pdfTextCache
      };
      state.customTopics.push(topic);
      state.edits[id] = { source_text: pdfTextCache };
      setTopic(id);
      store();
      toast("Topic created - add concepts and questions in the Editor.");
      showScreen("editor");
    });
  }
}

function handlePdf(file) {
  var status = $("pdfStatus");
  var result = $("pdfResult");
  if (status) status.textContent = "Extracting text from " + file.name + " ...";
  if (!window.pdfjsLib) {
    if (status) status.textContent = "PDF.js failed to load (offline?). Check your connection and refresh.";
    return;
  }
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (e) {}
  var reader = new FileReader();
  reader.onload = function () {
    var data = new Uint8Array(reader.result);
    pdfjsLib.getDocument({ data: data }).promise.then(function (doc) {
      var pages = [];
      var chain = Promise.resolve();
      for (var i = 1; i <= doc.numPages; i++) {
        (function (n) {
          chain = chain.then(function () {
            return doc.getPage(n).then(function (page) {
              return page.getTextContent().then(function (tc) {
                var s = tc.items.map(function (it) { return it.str; }).join(" ");
                pages.push(s);
                if (status) status.textContent = "Extracted " + n + " / " + doc.numPages + " pages ...";
              });
            });
          });
        })(i);
      }
      chain.then(function () {
        pdfTextCache = pages.join("\n\n").trim();
        if (status) status.textContent = "Done. " + doc.numPages + " pages, " + pdfTextCache.length + " characters extracted.";
        var text = $("pdfText");
        if (text) text.textContent = pdfTextCache.slice(0, 6000) + (pdfTextCache.length > 6000 ? "\n\n... [truncated preview; full text saved to the topic]" : "");
        if (result) result.classList.remove("hidden");
        toast("PDF text extracted.");
      });
    }).catch(function (err) {
      if (status) status.textContent = "Could not read this PDF: " + (err && err.message ? err.message : err);
    });
  };
  reader.readAsArrayBuffer(file);
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
  if (edTopicId == null) loadEditorDraft(state.activeTopicId);
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
      $("edQuiz").classList.toggle("hidden", tab !== "quiz");
      $("edSource").classList.toggle("hidden", tab !== "source");
      if (tab === "concepts") drawConceptEditor();
      if (tab === "quiz") drawQuizEditor();
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
  drawQuizEditor();
  drawSourceEditor();
}

function loadEditorDraft(id) {
  edTopicId = id;
  edDraft = clone(getTopic(id));
  setTopic(id);
  var nameEl = $("editorTopicName");
  if (nameEl) nameEl.textContent = "(" + edDraft.title + ")";
  if ($("editorTopicSelect")) $("editorTopicSelect").value = id;
  drawConceptEditor();
  drawQuizEditor();
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

function drawSourceEditor() {
  var host = $("edSource"); if (!host || !edDraft) return;
  host.innerHTML = "";
  var ta = el("textarea");
  ta.style.minHeight = "240px";
  ta.placeholder = "Paste the source text (e.g. extracted from a PDF) here...";
  ta.value = edDraft.source_text || "";
  ta.addEventListener("input", function () { edDraft.source_text = ta.value; });
  host.appendChild(ta);
  host.appendChild(el("p", "small muted", "This text is stored with the topic for reference. Turning it into concepts/questions is the Phase 2 (AI) step; here you build them manually above."));
}

function saveEditor() {
  if (!edDraft || !edTopicId) return;
  state.edits[edTopicId] = {
    title: edDraft.title,
    summary: edDraft.summary,
    concepts: edDraft.concepts,
    quiz: edDraft.quiz,
    relationships: edDraft.relationships || [],
    source_text: edDraft.source_text || ""
  };
  // refresh derived progress mastery keys
  var p = state.progress[edTopicId];
  if (p) { p.mastery = p.mastery || {}; edDraft.concepts.forEach(function (c) { if (p.mastery[c.id] == null) p.mastery[c.id] = 0; }); }
  store();
  T = getTopic(edTopicId);
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
    '<span class="pill-stat">Total concepts: <strong>' + total + "</strong></span>" +
    '<span class="pill-stat due">Due now: <strong>' + due + "</strong></span>" +
    '<span class="pill-stat">Learned: <strong>' + learned + "</strong></span>";
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
  back.className = "back";

  var reveal = el("button", "btn", "Show answer");
  reveal.addEventListener("click", function () {
    back.classList.remove("hidden");
    reveal.remove();
    gradeButtons();
  });
  actions.appendChild(reveal);

  function gradeButtons() {
    var grades = [
      { g: 0, label: "Again", cls: "btn bad" },
      { g: 1, label: "Hard", cls: "btn warn" },
      { g: 2, label: "Good", cls: "btn good" },
      { g: 3, label: "Easy", cls: "btn" }
    ];
    grades.forEach(function (gr) {
      var b = el("button", gr.cls + " sm", gr.label);
      b.addEventListener("click", function () {
        srsReview(srsKey(T.id, cid), gr.g);
        reviewQueue.shift();
        drawSrsProgress();
        drawSrsCard();
        drawSrsSchedule();
        if (gr.g === 0) { /* Again keeps it due today; it will reappear next render */ }
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
  if (window.mermaid) { try { mermaid.initialize({ startOnLoad: false, theme: "dark" }); } catch (e) {} }

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
  showScreen(state.archetype ? "quest" : "home");
}

document.addEventListener("DOMContentLoaded", init);