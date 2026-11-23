"use strict";
/* Unlocked Phase 1 — engine: state, helpers, classification, SRS, screens,
   quest, cycle, dashboard, quiz engine. Depends on data.js globals. */

var STORE_KEY = "unlocked_phase1_v1";
var state = {
  archetype: null,
  activeTopicId: "photosynthesis",
  journey: [],
  index: 0,
  xp: 0,
  progress: {},      // topicId -> { mastery:{}, completed:[], quizLog:{correct,total}, index }
  edits: {},         // topicId -> override { title, summary, classification, concepts, quiz, relationships, source_text }
  customTopics: [],  // topics created from PDF
  srs: {},           // conceptKey -> { reps, ease, interval, due }
  plan: null,
  assessmentProfile: null
};

var T = null; // active topic

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function store() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        archetype: state.archetype, activeTopicId: state.activeTopicId, xp: state.xp,
        progress: state.progress, edits: state.edits, customTopics: state.customTopics,
        srs: state.srs, plan: state.plan, assessmentProfile: state.assessmentProfile
      }));
    }
  } catch (e) {}
}
function restore() {
  try {
    if (typeof localStorage === "undefined") return;
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (s.archetype) state.archetype = s.archetype;
    if (s.activeTopicId) state.activeTopicId = s.activeTopicId;
    if (typeof s.xp === "number") state.xp = s.xp;
    if (s.progress) state.progress = s.progress;
    if (s.edits) state.edits = s.edits;
    if (s.customTopics) state.customTopics = s.customTopics;
    if (s.srs) state.srs = s.srs;
    if (s.plan) state.plan = s.plan;
    if (s.assessmentProfile) state.assessmentProfile = s.assessmentProfile;
  } catch (e) {}
}

function allTopics() { return SAMPLE_TOPICS.concat(state.customTopics || []); }
function getTopic(id) {
  var base = allTopics().find(function (t) { return t.id === id; });
  if (!base) return null;
  var merged = clone(base);
  var ed = state.edits[id];
  if (ed) {
    if (ed.title != null) merged.title = ed.title;
    if (ed.summary != null) merged.summary = ed.summary;
    if (ed.classification != null) merged.classification = ed.classification;
    if (ed.concepts != null) merged.concepts = ed.concepts;
    if (ed.quiz != null) merged.quiz = ed.quiz;
    if (ed.relationships != null) merged.relationships = ed.relationships;
    if (ed.source_text != null) merged.source_text = ed.source_text;
  }
  return merged;
}
function setTopic(id) {
  var t = getTopic(id) || getTopic(SAMPLE_TOPICS[0].id);
  state.activeTopicId = t ? t.id : SAMPLE_TOPICS[0].id;
  T = t;
  store();
}
function topicProgress(id) {
  id = id || (T && T.id) || state.activeTopicId;
  if (!state.progress[id]) {
    var tp = getTopic(id);
    var mastery = {};
    if (tp) tp.concepts.forEach(function (c) { mastery[c.id] = 0; });
    state.progress[id] = { mastery: mastery, completed: [], quizLog: { correct: 0, total: 0 }, index: 0 };
  }
  return state.progress[id];
}

/* helpers */
function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function toast(msg) {
  var t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
}
function addXP(n) { state.xp += n; var x = $("xpVal"); if (x) x.textContent = state.xp; store(); if (n > 0) toast("+" + n + " XP"); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
  });
}
function shuffle(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* classification */
function classifyContent(topic) {
  var text = ((topic.classification || "") + " " + (topic.title || "") + " " + (topic.summary || "")).toLowerCase();
  var signals = [];
  if (/process|stage|cycle|reaction|convert/.test(text)) signals.push("process");
  if (/structure|part|component|organelle/.test(text)) signals.push("structure");
  if (/relation|concept|connect/.test(text)) signals.push("concept");
  if (/quant|numeric|rate|intensity|force|price|amount/.test(text)) signals.push("quant");
  if (/procedure|calc|solve/.test(text)) signals.push("procedure");
  var rep = null;
  for (var i = 0; i < REPRESENTATION_RULES.length; i++) {
    if (REPRESENTATION_RULES[i].test(signals.join(" "))) { rep = REPRESENTATION_RULES[i]; break; }
  }
  if (!rep) rep = REPRESENTATION_RULES[0];
  return { classification: signals.length ? signals : ["concept"], representation: rep.rep, representationLabel: rep.label };
}

/* SRS */
function todayStr(d) {
  d = d || new Date();
  var y = d.getFullYear(), m = ("0" + (d.getMonth() + 1)).slice(-2), day = ("0" + d.getDate()).slice(-2);
  return y + "-" + m + "-" + day;
}
function addDays(str, n) {
  var p = str.split("-").map(Number);
  var d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function srsKey(topicId, cid) { return topicId + "::" + cid; }
function srsGet(key) {
  if (!state.srs[key]) state.srs[key] = { reps: 0, ease: 2.5, interval: 0, due: todayStr() };
  return state.srs[key];
}
function srsReview(key, grade) {
  var c = srsGet(key);
  if (grade === 0) { c.reps = 0; c.interval = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.due = todayStr(); }
  else {
    if (c.reps === 0) c.interval = 1;
    else if (c.reps === 1) c.interval = 3;
    else c.interval = Math.round(c.interval * c.ease);
    c.ease = Math.max(1.3, c.ease + (grade === 1 ? -0.2 : (grade === 3 ? 0.15 : 0)));
    c.reps++;
    c.due = addDays(todayStr(), c.interval);
  }
  state.srs[key] = c; store();
  return c;
}
function srsDueCount(topic) {
  var today = todayStr(), n = 0;
  topic.concepts.forEach(function (c) {
    var s = state.srs[srsKey(topic.id, c.id)];
    if (!s || s.due <= today) n++;
  });
  return n;
}

/* screens */
var SCREEN_NAMES = ["home", "library", "quest", "cycle", "dashboard", "upload", "editor", "review"];
function showScreen(name) {
  SCREEN_NAMES.forEach(function (s) {
    var node = $("screen-" + s);
    if (node) node.classList.toggle("hidden", s !== name);
  });
  var navBtns = document.querySelectorAll("#nav button");
  for (var i = 0; i < navBtns.length; i++) {
    var ds = navBtns[i].getAttribute("data-screen");
    navBtns[i].classList.toggle("active", ds === (name === "cycle" ? "quest" : name));
  }
  if (name === "quest") renderQuest();
  if (name === "dashboard") renderDashboard();
  if (name === "library") renderLibrary();
  if (name === "upload") renderUpload();
  if (name === "editor") renderEditor();
  if (name === "review") renderReview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function topicThumbHtml(t) {
  var src = t.image || "/public/assets/aistudio/image_9f1ca12d.png";
  return '<div class="topic-thumb"><img src="' + esc(src) + '" alt="' + esc(t.title) + '" referrerpolicy="no-referrer" onerror="this.parentNode.innerHTML=\'<div class=art-fallback>' + esc(t.title) + '</div>\'" /></div>';
}

function renderHome() {
  var banner = $("assessmentBanner");
  if (banner) {
    var ap = state.assessmentProfile;
    if (ap && ap.primary_key && ARCHETYPES[ap.primary_key]) {
      banner.classList.remove("hidden");
      var secText = ap.secondary_name ? (" + " + ap.secondary_name) : "";
      var ctxText = ap.study_context ? (" · Context: " + ap.study_context.replace(/_/g, " ")) : "";
      banner.innerHTML =
        '<div class="ed-item" style="background:var(--tint-mint)">' +
        '<div class="row"><div><div class="status-text done" style="margin-bottom:4px">Assessment profile: ' + esc(ap.label || "Detected") + '</div>' +
        '<div style="font-weight:700">Recommended starting archetype: ' + esc(ap.primary_name + secText) + '</div>' +
        '<div class="small muted">Selected from your 24-question assessment' + esc(ctxText) + '. You can still switch or explore any archetype below.</div></div>' +
        '<button class="btn sm" id="launchAssessedBtn">Start as ' + esc(ap.primary_name) + ' →</button></div></div>';
      var lbtn = $("launchAssessedBtn");
      if (lbtn) lbtn.addEventListener("click", function () { startJourney(ap.primary_key); });
    } else {
      banner.classList.add("hidden");
      banner.innerHTML = "";
    }
  }

  var picker = $("homeTopicPicker");
  picker.innerHTML = "";
  var wrap = el("div", "topic-grid");
  allTopics().forEach(function (t) {
    var on = state.activeTopicId === t.id;
    var c = el("div", "topic-card" + (on ? " on" : ""));
    c.innerHTML = topicThumbHtml(t) +
      '<div class="topic-body"><div class="tt">' + esc(t.title) + '</div><div class="ts">' + esc((t.summary || "").slice(0, 90)) + (t.summary && t.summary.length > 90 ? "..." : "") + '</div><div class="tm">' + (on ? "✓ Selected" : "Select topic") + "</div></div>";
    c.addEventListener("click", function () { setTopic(t.id); renderHome(); toast("Topic: " + t.title); });
    wrap.appendChild(c);
  });
  picker.appendChild(wrap);

  var grid = $("archGrid");
  grid.innerHTML = "";
  var recKey = state.assessmentProfile && state.assessmentProfile.primary_key;
  Object.keys(ARCHETYPES).forEach(function (key) {
    var a = ARCHETYPES[key];
    var card = el("div", "arch-card");
    card.style.setProperty("--c1", a.color[0]);
    card.style.setProperty("--c2", a.color[1]);
    if (recKey === key) card.style.background = "var(--tint-mint)";
    card.innerHTML = '<div class="glyph"><span>' + a.glyph + '</span>' + (recKey === key ? '<span class="status-text done">Match</span>' : "") + "</div>" +
      '<div class="nm">' + a.name + "</div>" +
      '<div class="sub">' + a.mode + "</div>" + '<div class="bar"></div>';
    card.addEventListener("click", function () { startJourney(key); });
    grid.appendChild(card);
  });
}

function startJourney(key) {
  state.archetype = key;
  var a = ARCHETYPES[key];
  state.journey = a.journeys.map(function (_, i) { return i; });
  var p = topicProgress();
  p.completed = []; p.index = 0; p.quizLog = { correct: 0, total: 0 };
  T.concepts.forEach(function (c) { p.mastery[c.id] = 0; });
  state.plan = null;
  store();
  showScreen("quest");
}

function renderLibrary() {
  var grid = $("libraryGrid");
  grid.innerHTML = "";
  allTopics().forEach(function (t) {
    var on = state.activeTopicId === t.id;
    var p = state.progress[t.id];
    var masteryPct = 0;
    if (p) {
      var vals = Object.keys(p.mastery || {}).map(function (k) { return p.mastery[k]; });
      masteryPct = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;
    }
    var c = el("div", "topic-card" + (on ? " on" : ""));
    c.innerHTML = topicThumbHtml(t) +
      '<div class="topic-body"><div class="tt">' + esc(t.title) + '</div>' +
      '<div class="ts">' + esc((t.summary || "").slice(0, 110)) + '</div>' +
      '<div class="tm">' + (t.id.indexOf("custom") === 0 ? "Custom topic" : "Sample") + " · " + (t.concepts ? t.concepts.length : 0) + " concepts · mastery " + masteryPct + "%</div></div>";
    c.addEventListener("click", function () { setTopic(t.id); toast("Topic: " + t.title); showScreen("home"); });
    grid.appendChild(c);
  });
}

function computeAdaptiveRecommendation() {
  var a = ARCHETYPES[state.archetype];
  var p = topicProgress();
  var rep = classifyContent(T);
  var imm = p.quizLog.total ? Math.round((p.quizLog.correct / p.quizLog.total) * 100) : null;
  var due = srsDueCount(T);
  var vals = (T.concepts || []).map(function (c) { return p.mastery[c.id] || 0; });
  var avgMastery = vals.length ? Math.round(vals.reduce(function (x, y) { return x + y; }, 0) / vals.length) : 0;

  var rules = [];
  if (imm !== null && imm < 60) {
    rules.push({
      badge: "Remedial rule",
      cls: "lock",
      text: "Quiz accuracy is " + imm + "%. Rules engine recommends reinforcing with a worked example or guided retrieval before advancing.",
      actionLabel: "Open worked example →",
      onAction: function () {
        var idx = a.journeys.findIndex(function (j) { return j.view === "worked" || j.view === "guide" || j.view === "diagram"; });
        p.index = idx >= 0 ? idx : 0; store(); showScreen("cycle");
      }
    });
  }
  if (due > 0 && p.completed.length >= 2) {
    rules.push({
      badge: "SRS rule",
      cls: "now",
      text: due + " concept flashcard" + (due === 1 ? " is" : "s are") + " due for spaced-repetition review to lock in retention.",
      actionLabel: "Review " + due + " due card" + (due === 1 ? "" : "s") + " →",
      onAction: function () { showScreen("review"); }
    });
  }
  if (state.assessmentProfile && state.assessmentProfile.secondary_name && state.assessmentProfile.profile_type === "blended") {
    rules.push({
      badge: "Blended profile",
      cls: "done",
      text: "Your assessment showed a blend with " + state.assessmentProfile.secondary_name + ". Try switching to " + state.assessmentProfile.secondary_name + " after completing this cycle to compare formats.",
      actionLabel: "Switch to " + state.assessmentProfile.secondary_name,
      onAction: function () { startJourney(state.assessmentProfile.secondary_key); }
    });
  }
  if (!rules.length) {
    rules.push({
      badge: "Sequencing rule",
      cls: "now",
      text: "Content classified as [" + rep.classification.join(", ") + "] → best visual fit: " + rep.representationLabel + ". Average mastery: " + avgMastery + "%."
    });
  }
  return rules[0];
}

function renderQuest() {
  if (!state.archetype || !T) { showScreen("home"); return; }
  var a = ARCHETYPES[state.archetype];
  var p = topicProgress();
  $("questArchTag").textContent = a.glyph + " " + a.name + " - " + a.mode;
  var doneCount = p.completed.length, total = a.journeys.length;
  var pct = total ? Math.round((doneCount / total) * 100) : 0;
  $("questRingPct").textContent = pct + "%";
  $("questRing").style.setProperty("--p", pct);
  $("questTitle").textContent = "Chapter: " + T.title;
  $("questSub").textContent = "Concept mastery is earned through demonstrated understanding, not by viewing content.";

  var abox = $("adaptiveBox");
  if (abox) {
    var rec = computeAdaptiveRecommendation();
    abox.innerHTML = '<div class="ed-item" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--tint-sky)">' +
      '<div style="flex:1"><span class="status-text ' + rec.cls + '" style="margin-right:10px">' + esc(rec.badge) + ' ·</span><span class="small">' + esc(rec.text) + '</span></div>' +
      (rec.actionLabel ? '<button class="btn secondary sm" id="adaptiveActionBtn">' + esc(rec.actionLabel) + '</button>' : '') +
      '</div>';
    if (rec.onAction && $("adaptiveActionBtn")) {
      $("adaptiveActionBtn").addEventListener("click", rec.onAction);
    }
  }

  var ml = $("masteryList"); ml.innerHTML = "";
  T.concepts.forEach(function (c) {
    var m = p.mastery[c.id] || 0;
    var row = el("div", "mrow");
    row.innerHTML = '<span>' + esc(c.name) + '</span><div class="mbar"><div style="width:' + m + '%"></div></div><span class="mv">' + m + "%</span>";
    ml.appendChild(row);
  });

  var nextIdx = nextIncompleteIndex(p);
  var mlist = $("missionList"); mlist.innerHTML = "";
  a.journeys.forEach(function (j, i) {
    var done = p.completed.indexOf(i) > -1;
    var current = !done && i === nextIdx;
    var locked = !done && !current && i > nextIdx;
    var m = el("div", "mission" + (done ? " done" : "") + (current ? " current" : ""));
    m.style.cursor = "pointer";
    var tag = done ? '<span class="status-text done">Complete</span>' : (current ? '<span class="status-text now">Current</span>' : (locked ? '<span class="status-text next">Up next</span>' : '<span class="status-text next">Up next</span>'));
    m.innerHTML = '<div class="num">' + (done ? "✓" : (i + 1)) + "</div>" +
      '<div class="body"><div class="ttl">' + esc(j.stage) + '</div><div class="st">' + esc(j.instr) + "</div></div>" + tag;
    m.addEventListener("click", function () {
      p.index = i; store(); showScreen("cycle");
    });
    mlist.appendChild(m);
  });

  $("continueBtn").textContent = doneCount >= total ? "Journey complete - view progress" : "Continue learning";
}

function nextIncompleteIndex(p) {
  for (var i = 0; i < state.journey.length; i++) if (p.completed.indexOf(i) === -1) return i;
  return 0;
}

/* cycle */
var STAGE_ORDER = ["Discover", "Orient", "Understand", "Interact", "Retrieve", "Revisit"];
function stageIcon(s) { return ({ Discover: "?", Orient: "O", Understand: "U", Interact: "I", Retrieve: "R", Revisit: "V" })[s] || "*"; }
function stageToCycle(s) {
  s = s.toLowerCase();
  if (/mission|hook|target|diagnose|goal|predict|curiosity/.test(s)) return 0;
  if (/overview|map|foundation|introduce|orient/.test(s)) return 1;
  if (/demonstrate|explain|derive|learn|connect/.test(s)) return 2;
  if (/experiment|investigate|guide|hint|challenge|zoom|plan|prioritise/.test(s)) return 3;
  if (/recall|correct|check|revisit|release|review|apply|mix|transfer|explain back/.test(s)) return 4;
  return 5;
}

function renderCycle() {
  if (!state.archetype || !T) { showScreen("home"); return; }
  var a = ARCHETYPES[state.archetype];
  var p = topicProgress();
  var j = a.journeys[p.index];
  $("cycleMissionTag").textContent = "Mission " + (p.index + 1) + " of " + a.journeys.length;

  var strip = $("stageStrip"); strip.innerHTML = "";
  var stageIdx = stageToCycle(j.stage);
  STAGE_ORDER.forEach(function (s, i) {
    var chip = el("div", "stage-chip" + (i === stageIdx ? " on" : "") + (i < stageIdx ? " ok" : ""));
    chip.innerHTML = '<span class="n">Stage ' + (i + 1) + '</span><span class="ic">' + stageIcon(s) + "</span> " + s;
    strip.appendChild(chip);
  });

  $("stageInstr").innerHTML = "<strong>" + esc(j.stage) + ".</strong> " + esc(j.instr);

  var content = $("stageContent"); content.innerHTML = "";
  var renderer = RENDERERS[j.view] || RENDERERS.summary;
  var node;
  try { node = renderer(j); } catch (e) { node = el("div", "note", "This activity could not render: " + esc(e.message)); }
  content.appendChild(node);

  $("prevStage").disabled = p.index === 0;
  var isLast = p.index >= a.journeys.length - 1;
  $("nextStage").textContent = isLast ? "Finish journey" : "Next";
}

/* dashboard */
var charts = {};
function renderDashboard() {
  var a = state.archetype ? ARCHETYPES[state.archetype] : null;
  var p = state.archetype ? topicProgress() : { mastery: {}, completed: [], quizLog: { correct: 0, total: 0 } };
  var total = a ? a.journeys.length : 6;
  var done = p.completed.length;
  var imm = p.quizLog.total ? Math.round((p.quizLog.correct / p.quizLog.total) * 100) : 0;
  var ret = Math.round(imm * 0.85), transfer = Math.round(imm * 0.6);

  function kpi(lab, big, sub) { return '<div class="kpi"><div class="lab">' + lab + '</div><div class="big">' + big + '</div><div class="sub">' + sub + "</div></div>"; }
  $("kpis").innerHTML = kpi("Engagement", done + "/" + total, "activities completed") +
    kpi("Immediate learning", imm + "%", "recall accuracy") +
    kpi("Delayed retention", ret + "%", "projected") +
    kpi("Transfer", transfer + "%", "projected");

  drawEngagement(done, total);
  drawImmediate(imm);
  drawRetention(imm, ret, transfer);

  var rep = classifyContent(T || { classification: "" });
  var used = {};
  if (a) a.journeys.forEach(function (j) { used[j.view] = (used[j.view] || 0) + 1; });
  var rows = [
    ["Labelled diagram", used.diagram || 0],
    ["Concept map", (used.conceptmap || 0) + (used.reconstruct || 0)],
    ["Graph", used.graph || 0],
    ["Story / timeline", used.story || 0],
    ["Game / simulation", used.game || 0],
    ["Retrieval / quiz", (used.quiz || 0) + (used.retrieve || 0)],
    ["Worked example", (used.worked || 0) + (used.guide || 0) + (used.hint || 0)]
  ];
  var maxUse = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
  var html = '<div class="note"><strong>Content classification:</strong> ' + esc(rep.classification.join(", ")) +
    " - best representation: <strong>" + esc(rep.representationLabel) + "</strong>. Content decides representation; archetype decides experience.</div>";
  html += '<div style="display:grid;gap:8px;margin-top:10px">';
  rows.forEach(function (r) {
    html += '<div class="mrow"><span>' + r[0] + '</span><div class="mbar"><div style="width:' + Math.round((r[1] / maxUse) * 100) + '%"></div></div><span class="mv">' + r[1] + "</span></div>";
  });
  html += "</div>";
  $("repMatrix").innerHTML = html;
}
function drawEngagement(done, total) {
  var c = $("engagementChart"); if (!c || !window.Chart) return;
  try { if (charts.eng) charts.eng.destroy(); charts.eng = new Chart(c, {
    type: "doughnut", data: { labels: ["Completed", "Remaining"], datasets: [{ data: [done, Math.max(0, total - done)], backgroundColor: ["#7EA85B", "#F4EED9"], borderColor: "#2C261F", borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { labels: { color: "#2C261F", font: { weight: "600" } } } } } }); } catch (e) {}
}
function drawImmediate(imm) {
  var c = $("immediateChart"); if (!c || !window.Chart) return;
  try { if (charts.imm) charts.imm.destroy(); charts.imm = new Chart(c, {
    type: "bar", data: { labels: ["Recall"], datasets: [{ label: "Accuracy %", data: [imm], backgroundColor: "#558E9B", borderColor: "#2C261F", borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#2C261F" }, grid: { color: "rgba(44,38,31,.08)" } }, y: { beginAtZero: true, max: 100, ticks: { color: "#2C261F" }, grid: { color: "rgba(44,38,31,.08)" } } } } }); } catch (e) {}
}
function drawRetention(imm, ret, transfer) {
  var c = $("retentionChart"); if (!c || !window.Chart) return;
  try { if (charts.ret) charts.ret.destroy(); charts.ret = new Chart(c, {
    type: "bar",
    data: { labels: ["Immediate", "Delayed retention", "Transfer"], datasets: [
      { label: "Standard sequence (projected)", data: [imm, Math.round(imm * 0.7), Math.round(imm * 0.5)], backgroundColor: "#D6CCB5", borderColor: "#2C261F", borderWidth: 2 },
      { label: "This journey (projected)", data: [imm, ret, transfer], backgroundColor: "#7EA85B", borderColor: "#2C261F", borderWidth: 2 } ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#2C261F", font: { weight: "600" } } } }, scales: { x: { ticks: { color: "#2C261F" }, grid: { color: "rgba(44,38,31,.08)" } }, y: { beginAtZero: true, max: 100, ticks: { color: "#2C261F" }, grid: { color: "rgba(44,38,31,.08)" } } } } }); } catch (e) {}
}

/* quiz engine */
function makeQuiz(questions, handlers) {
  handlers = handlers || {};
  var wrap = el("div");
  var idx = 0, correct = 0;
  function render() {
    wrap.innerHTML = "";
    if (!questions.length) { wrap.innerHTML = '<div class="note">No quiz questions yet - add them in the Editor.</div>'; return; }
    var q = questions[idx];
    wrap.appendChild(el("div", "small muted", "Question " + (idx + 1) + " of " + questions.length));
    wrap.appendChild(el("div", "", '<div style="font-size:1.08rem;font-weight:600;margin:6px 0 14px">' + esc(q.q) + "</div>"));
    var box = el("div", "opts");
    var answered = false;
    q.opts.forEach(function (o, i) {
      var b = el("button", "opt", '<span class="k">' + String.fromCharCode(65 + i) + "</span><span>" + esc(o) + "</span>");
      b.addEventListener("click", function () {
        if (answered) return; answered = true;
        var btns = box.querySelectorAll(".opt");
        for (var k = 0; k < btns.length; k++) btns[k].style.pointerEvents = "none";
        if (i === q.a) { b.classList.add("correct"); correct++; }
        else { b.classList.add("wrong"); if (btns[q.a]) btns[q.a].classList.add("correct"); }
        var p = topicProgress();
        p.quizLog.total++; if (i === q.a) p.quizLog.correct++;
        store();
        if (handlers.record) handlers.record(i === q.a);
        var fb = el("div", "fb " + (i === q.a ? "good" : "bad"), "<strong>" + (i === q.a ? "Correct. " : "Not quite. ") + "</strong>" + esc(q.why || ""));
        wrap.appendChild(fb);
        var next = el("button", "btn sm", idx < questions.length - 1 ? "Next question" : "See result");
        next.style.marginTop = "14px";
        next.addEventListener("click", function () { idx++; if (idx < questions.length) render(); else finish(); });
        wrap.appendChild(next);
      });
      box.appendChild(b);
    });
    wrap.appendChild(box);
  }
  function finish() {
    wrap.innerHTML = "";
    var pct = Math.round((correct / questions.length) * 100), passed = pct >= 60;
    wrap.appendChild(el("div", "fb " + (passed ? "good" : "bad"), "<strong>" + correct + " / " + questions.length + " correct (" + pct + "%).</strong> " + (passed ? "Nice work - this concept is demonstrated." : "Review the explanations and try again to build mastery.")));
    if (handlers.complete) handlers.complete(pct, passed);
    var again = el("button", "btn secondary sm", "Try again"); again.style.marginTop = "12px";
    again.addEventListener("click", function () { idx = 0; correct = 0; render(); });
    wrap.appendChild(again);
  }
  render();
  return wrap;
}

/* mastery */
function bumpMastery(amount) {
  var p = topicProgress();
  (T.concepts || []).forEach(function (c) {
    var cur = p.mastery[c.id] || 0;
    p.mastery[c.id] = Math.min(100, cur + Math.round(amount / 2));
  });
  store();
  if ($("screen-quest") && !$("screen-quest").classList.contains("hidden")) renderQuest();
}