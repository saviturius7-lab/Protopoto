"use strict";
/* Unlocked Phase 1 — renderers (content-driven, read active topic T) + game. */

var RENDERERS = {};

RENDERERS.summary = function () {
  var w = el("div");
  w.appendChild(el("div", "instr", "<strong>Quick summary.</strong> " + esc(T.summary || "")));
  var grid = el("div", "grid two"); grid.style.marginTop = "14px";
  (T.concepts || []).slice(0, 6).forEach(function (c) {
    var d = el("div");
    d.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:13px 15px";
    d.innerHTML = "<strong>" + esc(c.name) + '</strong><div class="small muted">' + esc(c.def) + "</div>";
    grid.appendChild(d);
  });
  w.appendChild(grid);
  if (T.misconceptions && T.misconceptions.length) {
    var misc = el("div", "viz"); misc.style.marginTop = "16px";
    misc.innerHTML = "<h4>Common misconceptions to watch out for</h4>";
    T.misconceptions.forEach(function (m) {
      var row = el("div", "ed-item"); row.style.marginTop = "8px";
      row.innerHTML = '<div class="small" style="color:var(--bad)"><strong>Myth:</strong> ' + esc(m.wrong) + '</div>' +
        '<div class="small" style="color:var(--good);margin-top:4px"><strong>Reality:</strong> ' + esc(m.right) + "</div>";
      misc.appendChild(row);
    });
    w.appendChild(misc);
  }
  return w;
};

RENDERERS.diagram = function () {
  var w = el("div");
  var viz = el("div", "viz");
  var rep = classifyContent(T);
  viz.innerHTML = "<h4>Understand - same knowledge, different representations</h4>" +
    "<p class='small muted' style='margin-top:0'>Content classification (<strong>" + esc(rep.classification.join(", ")) + "</strong>) recommends: <strong>" + esc(rep.representationLabel) + "</strong>. Switch tabs any time.</p>";
  var tabs = el("div", "tabs");
  var panel = el("div");
  var defs = [
    { id: "diagram", label: "Diagram", build: buildDiagram },
    { id: "process", label: "Flowchart", build: buildProcess },
    { id: "story", label: "Story / timeline", build: buildStory },
    { id: "graph", label: "Graph", build: buildGraph }
  ];
  var defaultId = defs.some(function (d) { return d.id === rep.representation; }) ? rep.representation : "diagram";
  var built = {};
  defs.forEach(function (d) {
    var b = el("button", "tab" + (d.id === defaultId ? " on" : ""), d.label);
    b.addEventListener("click", function () {
      var btns = tabs.querySelectorAll(".tab");
      for (var k = 0; k < btns.length; k++) btns[k].classList.remove("on");
      b.classList.add("on");
      panel.innerHTML = "";
      if (!built[d.id]) built[d.id] = d.build();
      panel.appendChild(built[d.id]);
    });
    tabs.appendChild(b);
  });
  viz.appendChild(tabs); viz.appendChild(panel);
  var initial = defs.find(function (d) { return d.id === defaultId; }) || defs[0];
  built[initial.id] = initial.build();
  panel.appendChild(built[initial.id]);
  w.appendChild(viz);
  return w;
};

function buildDiagram() {
  var box = el("div");
  var dg = T.diagram || { inputs: [], outputs: [], center: "Process", centerSub: "" };
  var W = 640, H = 300, cx = 320, cy = 150;
  var inp = dg.inputs || [], outp = dg.outputs || [];
  var svg = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="300" xmlns="http://www.w3.org/2000/svg" font-family="inherit" style="background:var(--surface-2);border:2px solid var(--border);border-radius:12px">';
  svg += '<defs><marker id="ar" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#2C261F"/></marker>' +
    '<marker id="ar2" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#2C261F"/></marker></defs>';
  svg += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="122" ry="80" fill="#DFEAC6" stroke="#2C261F" stroke-width="3"/>';
  svg += '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" fill="#2C261F" font-size="16" font-weight="700">' + esc(dg.center || "") + "</text>";
  if (dg.centerSub) svg += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" fill="#57534A" font-size="11.5" font-weight="600">' + esc(dg.centerSub) + "</text>";
  inp.forEach(function (it, i) {
    var y = cy - 50 + i * (100 / Math.max(1, inp.length));
    svg += '<line x1="95" y1="' + y + '" x2="' + (cx - 122) + '" y2="' + y + '" stroke="#2C261F" stroke-width="2.5" marker-end="url(#ar)"/>';
    svg += '<text x="86" y="' + (y + 4) + '" text-anchor="end" fill="#2C261F" font-size="13" font-weight="700">' + esc(it.label) + "</text>";
  });
  outp.forEach(function (it, i) {
    var y = cy - 50 + i * (100 / Math.max(1, outp.length));
    svg += '<line x1="' + (cx + 122) + '" y1="' + y + '" x2="' + (W - 95) + '" y2="' + y + '" stroke="#2C261F" stroke-width="2.5" marker-end="url(#ar2)"/>';
    svg += '<text x="' + (W - 86) + '" y="' + (y + 4) + '" fill="#2C261F" font-size="13" font-weight="700">' + esc(it.label) + "</text>";
  });
  svg += "</svg>";
  box.innerHTML = svg;
  var cap = el("p", "small muted", "Labelled diagram: parts, structure and spatial relationships.");
  cap.style.marginTop = "8px";
  cap.style.marginBottom = "0";
  box.appendChild(cap);
  return box;
}

function initMermaidOoo() {
  if (!window.mermaid) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      background: "#F2ECD5",
      primaryColor: "#FCEB9C",
      primaryTextColor: "#2C261F",
      primaryBorderColor: "#2C261F",
      lineColor: "#2C261F",
      secondaryColor: "#DCE9E6",
      tertiaryColor: "#DFEAC6",
      fontFamily: "Plus Jakarta Sans, sans-serif"
    }
  });
}

function buildProcess() {
  var box = el("div");
  var steps = T.process || [];
  if (!steps.length) {
    box.innerHTML = '<p class="small muted">No process steps defined yet for this topic.</p>';
    return box;
  }
  var md = el("div"); md.className = "mermaid";
  md.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:12px;overflow:auto";
  var lines = ["flowchart LR"];
  steps.forEach(function (s, i) {
    var label = (s.t || ("Step " + (i + 1))).replace(/["[\]()]/g, "");
    lines.push("  S" + i + '["' + (i + 1) + ". " + label + '"]');
    if (i > 0) lines.push("  S" + (i - 1) + " --> S" + i);
  });
  md.textContent = lines.join("\n");
  box.appendChild(md);
  var list = el("div", "grid"); list.style.marginTop = "14px";
  steps.forEach(function (s, i) {
    var d = el("div", "ed-item");
    d.innerHTML = "<strong>" + (i + 1) + ". " + esc(s.t) + '</strong><div class="small muted">' + esc(s.d) + "</div>";
    list.appendChild(d);
  });
  box.appendChild(list);
  setTimeout(function () { try { initMermaidOoo(); if (window.mermaid) mermaid.run({ nodes: [md] }); } catch (e) {} }, 40);
  return box;
}

function buildStory() {
  var box = el("div");
  var scenes = (T.story && T.story.scenes) ? T.story.scenes : [];
  if (!scenes.length) {
    box.innerHTML = '<p class="small muted">No story scenes defined yet for this topic.</p>';
    return box;
  }
  var md = el("div"); md.className = "mermaid";
  md.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:12px;overflow:auto";
  var lines = ["timeline"];
  scenes.forEach(function (s) {
    var tClean = String(s.t || "").replace(/:/g, " -");
    var dClean = String(s.d || "").replace(/:/g, " -");
    lines.push("    " + tClean + " : " + dClean);
  });
  md.textContent = lines.join("\n");
  box.appendChild(md);
  var list = el("div", "grid two"); list.style.marginTop = "16px";
  scenes.forEach(function (s, i) {
    var d = el("div");
    d.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:12px 14px";
    d.innerHTML = '<div class="status-text now" style="margin-bottom:4px">Scene ' + (i + 1) + "</div><strong>" + esc(s.t) + '</strong><div class="small muted">' + esc(s.d) + "</div>";
    list.appendChild(d);
  });
  box.appendChild(list);
  setTimeout(function () { try { initMermaidOoo(); if (window.mermaid) mermaid.run({ nodes: [md] }); } catch (e) {} }, 40);
  return box;
}

function buildGraph() {
  var box = el("div");
  var g = T.graph || { labels: [], series: [] };
  if (!g.labels || !g.labels.length || !g.series || !g.series.length) {
    box.innerHTML = '<p class="small muted">No quantitative graph series defined for this topic yet.</p>';
    return box;
  }
  var cbox = el("div", "chart-box");
  var canvas = el("canvas");
  cbox.appendChild(canvas); box.appendChild(cbox);
  setTimeout(function () {
    try {
      if (!window.Chart) { canvas.outerHTML = '<p class="small muted">Chart library unavailable offline.</p>'; return; }
      var palette = ["#558E9B", "#C97A2B", "#7EA85B"];
      new Chart(canvas, {
        type: "line",
        data: { labels: g.labels, datasets: (g.series || []).map(function (s, idx) {
          var col = palette[idx % palette.length];
          return { label: s.name, data: s.data, borderColor: col, backgroundColor: "transparent", borderDash: s.dashed ? [6, 4] : [], borderWidth: 3, tension: 0.35, pointRadius: 4, pointBackgroundColor: col };
        }) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#2C261F", font: { weight: "600" } } } },
          scales: { x: { title: { display: true, text: g.xlabel || "", color: "#2C261F", font: { weight: "700" } }, ticks: { color: "#57534A" }, grid: { color: "rgba(44,38,31,.08)" } },
            y: { title: { display: true, text: g.ylabel || "", color: "#2C261F", font: { weight: "700" } }, ticks: { color: "#57534A" }, grid: { color: "rgba(44,38,31,.08)" } } } }
      });
    } catch (e) {}
  }, 30);
  return box;
}

RENDERERS.graph = function () { return buildGraph(); };

RENDERERS.story = function () {
  var w = el("div"); var viz = el("div", "viz");
  viz.innerHTML = "<h4>Story - a meaningful sequence</h4>";
  viz.appendChild(buildStory()); w.appendChild(viz); return w;
};

RENDERERS.conceptmap = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Concept map - how ideas connect</h4>";
  var container = el("div"); container.id = "conceptmap";
  viz.appendChild(container); w.appendChild(viz);
  setTimeout(function () {
    var concepts = T.concepts || [], rels = T.relationships || [];
    if (window.vis && vis.Network) {
      try {
        var nodes = new vis.DataSet(concepts.map(function (c) { return { id: c.id, label: c.name, shape: "box", borderWidth: 2, color: { background: "#FCEB9C", border: "#2C261F", highlight: { background: "#558E9B", border: "#2C261F" } }, font: { color: "#2C261F", face: "Plus Jakarta Sans", bold: true } }; }));
        var edges = new vis.DataSet(rels.map(function (r) { return { from: r.from, to: r.to, label: r.label, arrows: "to", color: { color: "#2C261F" }, font: { color: "#57534A", size: 11, background: "#F2ECD5" }, width: 2 }; }));
        w._net = new vis.Network(container, { nodes: nodes, edges: edges }, { layout: { improvedLayout: true }, physics: { stabilization: true, barnesHut: { gravitationalConstant: -8000 } }, interaction: { hover: true, tooltipDelay: 120 } });
        return;
      } catch (e) {}
    }
    container.innerHTML = '<p class="small muted" style="padding:12px">Map library unavailable offline. Connections:<br>' +
      rels.map(function (r) { return esc(r.from) + " -> " + esc(r.label) + " -> " + esc(r.to); }).join("<br>") + "</p>";
  }, 30);
  return w;
};

RENDERERS.reconstruct = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Reconstruct - rebuild the map from memory</h4>" +
    "<p class='small muted' style='margin-top:0'>Concept mapping is strongest when you actively construct the connections. Hide the labels, rebuild the links, then reveal to check.</p>";
  var container = el("div"); container.style.cssText = "width:100%;height:340px;background:var(--surface-2);border:2px solid var(--border);border-radius:12px";
  viz.appendChild(container);
  var check = el("button", "btn sm", "Hide labels to rebuild"); check.style.marginTop = "12px";
  viz.appendChild(check);
  var hidden = el("div", "small"); hidden.style.color = "var(--warn)"; hidden.style.marginTop = "8px";
  viz.appendChild(hidden);
  var showLabels = true;
  function build(labels) {
    var concepts = T.concepts || [], rels = T.relationships || [];
    if (window.vis && vis.Network) {
      try {
        var nodes = new vis.DataSet(concepts.map(function (c) { return { id: c.id, label: labels ? c.name : "?", shape: "box", borderWidth: 2, color: { background: labels ? "#DCE9E6" : "#F3D8D5", border: "#2C261F" }, font: { color: "#2C261F", bold: true } }; }));
        var edges = new vis.DataSet(rels.map(function (r) { return { from: r.from, to: r.to, label: labels ? r.label : "", arrows: "to", color: { color: "#2C261F" }, font: { color: "#57534A", size: 11, background: "#F2ECD5" }, width: 2 }; }));
        if (container._net) container._net.destroy();
        container._net = new vis.Network(container, { nodes: nodes, edges: edges }, { physics: { stabilization: true, barnesHut: { gravitationalConstant: -8000 } }, interaction: { hover: true } });
        return;
      } catch (e) {}
    }
    container.innerHTML = '<p class="small muted" style="padding:12px">Map library unavailable offline. Rebuild these from memory:<br>' +
      rels.map(function (r) { return esc(r.from) + " -> " + esc(r.label) + " -> " + esc(r.to); }).join("<br>") + "</p>";
  }
  build(true);
  check.addEventListener("click", function () {
    showLabels = !showLabels; build(showLabels);
    check.textContent = showLabels ? "Hide labels to rebuild" : "Reveal map to check";
    hidden.textContent = showLabels ? "" : "Try to reconstruct the connections from memory, then reveal to check.";
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.concepts = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Explore each concept</h4>";
  var list = el("div", "grid two"); list.style.marginTop = "8px";
  (T.concepts || []).forEach(function (c) {
    var d = el("details");
    d.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:12px 14px";
    d.innerHTML = "<summary style='cursor:pointer;font-weight:700'>" + esc(c.name) + '</summary><div class="small muted" style="margin-top:8px">' + esc(c.def) + "</div>";
    list.appendChild(d);
  });
  viz.appendChild(list); w.appendChild(viz);
  return w;
};

RENDERERS.quiz = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Retrieval practice - recall, do not reread</h4>";
  var host = el("div"); viz.appendChild(host); w.appendChild(viz);
  setTimeout(function () {
    var qs = shuffle(T.quiz || []);
    host.appendChild(makeQuiz(qs, { complete: function (pct, passed) { bumpMastery(passed ? 18 : 6); } }));
  }, 20);
  return w;
};

RENDERERS.retrieve = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Retrieve - bring it back from memory</h4>" +
    "<p class='small muted' style='margin-top:0'>Cover the definition, recall it in your own words, then flip to check.</p>";
  var cards = el("div", "grid two"); cards.style.marginTop = "10px";
  (T.concepts || []).slice(0, 6).forEach(function (c) {
    var card = el("div");
    card.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:14px 16px;cursor:pointer;min-height:96px";
    card.innerHTML = "<strong>" + esc(c.name) + '</strong><div class="small muted" style="margin-top:8px">Click to reveal definition</div><div class="small" style="margin-top:8px;display:none">' + esc(c.def) + "</div>";
    card.addEventListener("click", function () {
      var rev = card.querySelectorAll(".small")[1], hint = card.querySelector(".small.muted");
      if (rev.style.display === "none") { rev.style.display = "block"; hint.style.display = "none"; }
      else { rev.style.display = "none"; hint.style.display = "block"; }
    });
    cards.appendChild(card);
  });
  viz.appendChild(cards);
  setTimeout(function () {
    var check = el("button", "btn sm", "Quick self-check quiz"); check.style.marginTop = "14px";
    check.addEventListener("click", function () {
      var holder = el("div"); holder.style.marginTop = "12px"; viz.appendChild(holder);
      holder.appendChild(makeQuiz(shuffle((T.quiz || []).slice(0, 3)), { complete: function (pct, passed) { bumpMastery(passed ? 12 : 4); } }));
      check.remove();
    });
    viz.appendChild(check);
  }, 20);
  w.appendChild(viz);
  return w;
};

RENDERERS.challenge = function () {
  var w = el("div");
  var viz = el("div", "viz");
  var ch = T.challenge || { prompt: "Apply the concept to a new problem.", keywords: [], minCorrect: 1, why: "" };
  viz.innerHTML = "<h4>Mission - apply the concept</h4>" +
    "<p class='small muted' style='margin-top:0'>" + esc(ch.prompt) + "</p>";
  var ta = el("textarea"); ta.placeholder = "Your reasoning ..."; viz.appendChild(ta);
  var btn = el("button", "btn sm", "Check my reasoning"); btn.style.marginTop = "12px";
  viz.appendChild(btn);
  var fb = el("div"); fb.style.marginTop = "12px"; viz.appendChild(fb);
  btn.addEventListener("click", function () {
    var v = ta.value.toLowerCase();
    var found = (ch.keywords || []).filter(function (k) { return k.re.test(v); }).length;
    var good = found >= (ch.minCorrect || 1);
    fb.innerHTML = '<div class="fb ' + (good ? "good" : "bad") + '"><strong>' + (good ? "Good application. " : "Keep going. ") + "</strong>" +
      "You covered " + found + "/" + (ch.keywords || []).length + " key ideas. " + esc(ch.why || "") + "</div>";
    bumpMastery(good ? 15 : 5); btn.remove();
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.predict = function () {
  var w = el("div");
  var viz = el("div", "viz");
  var pr = T.predict || { prompt: "What do you predict will happen, and why?" };
  viz.innerHTML = "<h4>Predict - commit to a hypothesis</h4><p class='small muted' style='margin-top:0'>" + esc(pr.prompt) + "</p>";
  var ta = el("textarea"); ta.placeholder = "I predict ... because ..."; viz.appendChild(ta);
  var btn = el("button", "btn sm", "Lock in prediction"); btn.style.marginTop = "12px"; viz.appendChild(btn);
  var fb = el("div"); fb.style.marginTop = "12px"; viz.appendChild(fb);
  btn.addEventListener("click", function () {
    if (!ta.value.trim()) { fb.innerHTML = '<div class="fb bad">Write a quick prediction first.</div>'; return; }
    fb.innerHTML = '<div class="fb good">Prediction locked. ' + esc(pr.revealHtml || "") + "</div>";
    btn.remove();
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.worked = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Worked example - step by step</h4>";
  var list = el("div", "grid"); list.style.marginTop = "8px";
  (T.worked || []).forEach(function (s, i) {
    var d = el("div");
    d.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:12px 15px;display:flex;gap:12px;align-items:flex-start";
    d.innerHTML = '<div style="flex:0 0 28px;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--gold);border:2px solid var(--border);font-weight:700;font-size:.82rem;color:var(--ink)">' + (i + 1) + "</div>" +
      "<div><strong>" + esc(s.t) + '</strong><div class="small muted">' + esc(s.d) + "</div></div>";
    list.appendChild(d);
  });
  viz.appendChild(list); w.appendChild(viz);
  return w;
};

RENDERERS.guide = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Guided practice - complete the steps</h4><p class='small muted' style='margin-top:0'>Fill each blank. Hints are available.</p>";
  var host = el("div", "grid"); host.style.marginTop = "8px";
  viz.appendChild(host);
  (T.guide || []).forEach(function (it) {
    var box = el("div");
    box.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:12px 15px";
    box.innerHTML = '<div style="font-weight:700;margin-bottom:8px">' + esc(it.q) + "</div>";
    var inp = el("input"); inp.type = "text"; inp.placeholder = "Your answer"; box.appendChild(inp);
    var btn = el("button", "btn secondary sm", "Check"); btn.style.marginTop = "8px";
    var fb = el("div", "small"); fb.style.marginTop = "8px";
    box.appendChild(btn); box.appendChild(fb);
    btn.addEventListener("click", function () {
      var norm = function (s) { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
      if (norm(inp.value) === norm(it.a)) { fb.innerHTML = "<span style='color:var(--good);font-weight:700'>Correct.</span>"; bumpMastery(10); }
      else { fb.innerHTML = "<span style='color:var(--warn);font-weight:700'>Hint: " + esc(it.hint || "") + "</span>"; }
    });
    host.appendChild(box);
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.hint = function () {
  var w = el("div");
  var viz = el("div", "viz");
  var h = T.hint || { question: "Attempt the question, then reveal a hint if stuck.", hints: [], keywords: [], answerHtml: "" };
  viz.innerHTML = "<h4>Hint system - help when you are stuck</h4><p class='small muted' style='margin-top:0'>Attempt first, then reveal a hint only if needed. The aim is independence.</p>";
  var box = el("div");
  box.style.cssText = "background:var(--surface-2);border:2px solid var(--border);border-radius:12px;padding:14px 16px";
  box.innerHTML = '<div style="font-weight:700">' + esc(h.question) + "</div>";
  var ta = el("textarea"); ta.placeholder = "Your explanation ..."; ta.style.marginTop = "10px"; box.appendChild(ta);
  var row = el("div", "row"); row.style.marginTop = "10px";
  var hintBtn = el("button", "btn secondary sm", "Reveal a hint");
  var checkBtn = el("button", "btn sm", "Check answer");
  row.appendChild(hintBtn); row.appendChild(checkBtn); box.appendChild(row);
  var fb = el("div"); fb.style.marginTop = "10px"; box.appendChild(fb);
  var level = 0;
  hintBtn.addEventListener("click", function () {
    var hints = h.hints || [];
    if (!hints.length) { fb.innerHTML = '<div class="fb bad">No hints defined for this topic.</div>'; return; }
    level = Math.min(level + 1, hints.length);
    fb.innerHTML = '<div class="fb bad">' + esc(hints[level - 1]) + "</div>";
  });
  checkBtn.addEventListener("click", function () {
    var v = ta.value.toLowerCase();
    var found = (h.keywords || []).filter(function (k) { return k.re.test(v); }).length;
    if (found >= 1) { fb.innerHTML = '<div class="fb good">' + esc(h.answerHtml || "Correct.") + "</div>"; bumpMastery(14); }
    else { fb.innerHTML = '<div class="fb bad">Not quite - connect the ideas. Try a hint if you need one.</div>'; }
  });
  viz.appendChild(box); w.appendChild(viz);
  return w;
};

RENDERERS.explain = function () {
  var w = el("div");
  var viz = el("div", "viz");
  var ex = T.explain || { prompt: "Explain the concept in your own words.", keywords: [], minCorrect: 1 };
  viz.innerHTML = "<h4>Explain - teach it in your own words</h4><p class='small muted' style='margin-top:0'>" + esc(ex.prompt) + "</p>";
  var ta = el("textarea"); ta.style.minHeight = "120px"; ta.placeholder = "Explain in your own words ..."; viz.appendChild(ta);
  var btn = el("button", "btn sm", "Check my explanation"); btn.style.marginTop = "12px"; viz.appendChild(btn);
  var fb = el("div"); fb.style.marginTop = "12px"; viz.appendChild(fb);
  btn.addEventListener("click", function () {
    var v = ta.value.toLowerCase();
    var keys = ex.keywords || [];
    var found = keys.filter(function (k) { return k.re.test(v); });
    var missing = keys.filter(function (k) { return !k.re.test(v); });
    var good = found.length >= (ex.minCorrect || 1);
    fb.innerHTML = '<div class="fb ' + (good ? "good" : "bad") + '"><strong>' + (good ? "Solid explanation. " : "Almost. ") + "</strong>You mentioned " +
      found.length + "/" + keys.length + " key ideas" + (missing.length ? " - consider adding: " + missing.map(function (m) { return m.msg; }).join(", ") + "." : ".") + "</div>";
    bumpMastery(good ? 16 : 6); btn.remove();
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.hook = function () {
  var w = el("div");
  var viz = el("div", "viz");
  var hk = T.hook || { prompt: "What do you notice? What do you wonder?" };
  viz.innerHTML = "<h4>Curiosity hook</h4><p style='font-size:1.05rem;color:var(--ink);font-weight:600'>" + esc(hk.prompt) + "</p>";
  var ta = el("textarea"); ta.placeholder = "My initial idea ..."; viz.appendChild(ta);
  w.appendChild(viz);
  return w;
};

RENDERERS.evidence = function () {
  var w = el("div");
  w.appendChild(RENDERERS.graph());
  var viz = el("div", "viz");
  var ev = T.evidence || { prompt: "Which explanation best fits the evidence?", options: [], answer: 0, why: "" };
  viz.innerHTML = "<h4>Competing explanations</h4><p class='small muted' style='margin-top:0'>" + esc(ev.prompt) + "</p>";
  var host = el("div", "opts"); host.style.marginTop = "8px"; viz.appendChild(host);
  var fb = el("div"); viz.appendChild(fb);
  (ev.options || []).forEach(function (o, i) {
    var b = el("button", "opt", "<span class='k'>" + String.fromCharCode(65 + i) + "</span><span>" + esc(o) + "</span>");
    b.addEventListener("click", function () {
      var btns = host.querySelectorAll(".opt");
      for (var k = 0; k < btns.length; k++) btns[k].style.pointerEvents = "none";
      if (i === ev.answer) { b.classList.add("correct"); fb.innerHTML = '<div class="fb good">Correct - ' + esc(ev.why) + "</div>"; bumpMastery(12); }
      else { b.classList.add("wrong"); if (btns[ev.answer]) btns[ev.answer].classList.add("correct"); fb.innerHTML = '<div class="fb bad">' + esc(ev.why) + "</div>"; }
    });
    host.appendChild(b);
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.goal = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Set your target</h4><p class='small muted' style='margin-top:0'>What are you studying this for?</p>";
  var sel = el("select");
  sel.innerHTML = "<option>An upcoming examination</option><option>Long-term understanding</option><option>Applying knowledge to a practical task</option><option>Exploring out of curiosity</option><option>Keeping up with coursework</option>";
  viz.appendChild(sel);
  var days = el("input"); days.type = "number"; days.min = "1"; days.value = "7"; days.placeholder = "Days until target"; days.style.marginTop = "10px";
  viz.appendChild(days);
  var btn = el("button", "btn sm", "Build my plan"); btn.style.marginTop = "12px"; viz.appendChild(btn);
  var fb = el("div"); fb.style.marginTop = "12px"; viz.appendChild(fb);
  btn.addEventListener("click", function () {
    var n = Math.max(1, parseInt(days.value, 10) || 7);
    state.plan = { target: sel.value, days: n }; store();
    fb.innerHTML = '<div class="fb good">Target set: <strong>' + esc(sel.value) + "</strong> in <strong>" + n + " days</strong>. We will diagnose gaps, prioritise, and allocate practice accordingly.</div>";
    btn.remove();
  });
  w.appendChild(viz);
  return w;
};

RENDERERS.diagnose = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Diagnose - check existing knowledge</h4>";
  var host = el("div"); viz.appendChild(host); w.appendChild(viz);
  setTimeout(function () { host.appendChild(makeQuiz(shuffle((T.quiz || []).slice(0, 3)), { complete: function (pct, passed) { bumpMastery(passed ? 10 : 4); } })); }, 20);
  return w;
};

RENDERERS.mastery = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Mastery by concept</h4><p class='small muted' style='margin-top:0'>Gaps drive the next study plan. Concepts below 60% are prioritised.</p>";
  var box = el("div", "chart-box"); box.style.height = "260px";
  var canvas = el("canvas"); box.appendChild(canvas); viz.appendChild(box);
  var list = el("div", "mastery-list"); list.style.marginTop = "14px"; viz.appendChild(list);
  w.appendChild(viz);
  setTimeout(function () {
    var p = topicProgress();
    var labels = (T.concepts || []).map(function (c) { return c.name; });
    var data = (T.concepts || []).map(function (c) { return p.mastery[c.id] || 0; });
    try {
      if (window.Chart) new Chart(canvas, {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Mastery %", data: data, backgroundColor: data.map(function (v) { return v >= 60 ? "#7EA85B" : "#F2B44B"; }), borderColor: "#2C261F", borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#2C261F", maxRotation: 60, minRotation: 40 }, grid: { color: "rgba(44,38,31,.08)" } }, y: { beginAtZero: true, max: 100, ticks: { color: "#2C261F" }, grid: { color: "rgba(44,38,31,.08)" } } } }
      });
    } catch (e) {}
    (T.concepts || []).forEach(function (c) {
      var m = p.mastery[c.id] || 0;
      var row = el("div", "mrow");
      row.innerHTML = "<span>" + esc(c.name) + '</span><div class="mbar"><div style="width:' + m + '%"></div></div><span class="mv">' + m + "%</span>";
      list.appendChild(row);
    });
  }, 30);
  return w;
};

RENDERERS.plan = function () {
  var w = el("div");
  var viz = el("div", "viz");
  viz.innerHTML = "<h4>Plan - prioritise by gap and deadline</h4><p class='small muted' style='margin-top:0'>A realistic sequence built from your target and the concepts you have not mastered yet.</p>";
  var plan = state.plan || { target: "An upcoming examination", days: 7 };
  var days = Math.max(1, plan.days || 7);
  var p = topicProgress();
  var ranked = (T.concepts || []).slice().sort(function (a, b) { return (p.mastery[a.id] || 0) - (p.mastery[b.id] || 0); });
  var perDay = Math.max(1, Math.ceil(ranked.length / days));
  var header = el("div", "note");
  header.innerHTML = "<strong>Target:</strong> " + esc(plan.target) + " · <strong>Deadline:</strong> " + days + " day" + (days === 1 ? "" : "s") +
    " · <strong>Priority:</strong> weakest concepts first.";
  viz.appendChild(header);
  var list = el("div", "grid"); list.style.marginTop = "6px";
  ranked.forEach(function (c, i) {
    var day = Math.min(days, Math.floor(i / perDay) + 1);
    var m = p.mastery[c.id] || 0;
    var priority = m < 40 ? "High" : (m < 70 ? "Medium" : "Low");
    var pColor = priority === "High" ? "var(--bad)" : (priority === "Medium" ? "var(--warn)" : "var(--good)");
    var row = el("div", "mission"); row.style.padding = "12px 14px";
    row.innerHTML = '<div class="num" style="flex:0 0 58px;width:58px;font-size:.76rem">Day ' + day + "</div>" +
      '<div class="body"><div class="ttl">' + esc(c.name) + '</div>' +
      '<div class="st">Priority: <strong style="color:' + pColor + '">' + priority + "</strong> · activity: explanation, retrieval, application</div></div>";
    list.appendChild(row);
  });
  viz.appendChild(list);
  var btn = el("button", "btn sm", "Schedule spaced review"); btn.style.marginTop = "14px";
  btn.addEventListener("click", function () { toast("Revision quest scheduled: revisit weakest concepts in 1, 3 and 7 days."); addXP(15); btn.remove(); });
  viz.appendChild(btn);
  w.appendChild(viz);
  return w;
};

RENDERERS.game = function () { return buildGame(); };

/* ---------------- GAME ---------------- */
function gameScore(kind, v, g) {
  if (kind === "physics") {
    var net = Math.max(0, (v.force || 0) - (v.friction || 0));
    var a = net / Math.max(1, v.mass || 1);
    return Math.round(Math.max(0, 100 - Math.abs(a - (g.target || 3)) * 20));
  }
  if (kind === "market") {
    var dev = Math.abs((v.price || 0) - (g.target || 50)) / 50 + Math.abs((v.supply || 0) - (v.demand || 0)) / 100;
    return Math.round(Math.max(0, 100 - dev * 60));
  }
  var arr = (g.sliders || []).map(function (s) { return v[s.id] || 0; });
  return Math.round(Math.min.apply(null, arr.concat([100])));
}

function buildGame() {
  var w = el("div");
  var viz = el("div", "viz");
  var g = T.game || { title: "Interactive simulation", goal: "Adjust the variables.", kind: "limiting", target: 0, unit: "score", sliders: [] };
  viz.innerHTML = "<h4>Experiment - " + esc(g.title) + "</h4><p class='small muted' style='margin-top:0'>" + esc(g.goal) + "</p>";
  var canvas = el("canvas");
  canvas.style.cssText = "width:100%;height:300px;display:block;background:linear-gradient(#DCE9E6,#F4EED9);border-radius:12px;border:2px solid var(--border)";
  viz.appendChild(canvas);
  var sliders = el("div");
  sliders.style.cssText = "display:grid;gap:10px;margin-top:12px";
  (g.sliders || []).forEach(function (s) {
    var row = el("div");
    row.style.cssText = "display:grid;grid-template-columns:120px 1fr 56px;gap:10px;align-items:center;font-size:.88rem;font-weight:600";
    row.innerHTML = "<span>" + esc(s.label) + '</span><input type="range" min="0" max="100" value="50" data-id="' + esc(s.id) + '"><span class="val" style="font-family:var(--font-mono);text-align:right" data-val="' + esc(s.id) + '">50</span>';
    sliders.appendChild(row);
  });
  viz.appendChild(sliders);
  var liveNote = el("div", "small"); liveNote.style.cssText = "margin-top:10px;font-weight:600;color:var(--ink)";
  viz.appendChild(liveNote);
  var rowBtns = el("div", "row"); rowBtns.style.marginTop = "12px";
  var roundLbl = el("span", "meta-line", "Round 1 / 5"); roundLbl.style.margin = "0";
  var runBtn = el("button", "btn sm", "Run round");
  var resetBtn = el("button", "btn secondary sm", "Reset");
  rowBtns.appendChild(roundLbl); rowBtns.appendChild(runBtn); rowBtns.appendChild(resetBtn);
  viz.appendChild(rowBtns);
  var fb = el("div"); fb.style.marginTop = "12px"; viz.appendChild(fb);
  w.appendChild(viz);

  var growth = 0, round = 1, MAXR = 5;

  function vals() {
    var o = {};
    sliders.querySelectorAll("input[type=range]").forEach(function (inp) { o[inp.getAttribute("data-id")] = +inp.value; });
    return o;
  }
  function score(v) {
    return gameScore(g.kind, v, g);
  }
  function tip(v) {
    if (g.kind === "physics") {
      var net = Math.max(0, (v.force || 0) - (v.friction || 0));
      var a = net / Math.max(1, v.mass || 1);
      return "Net force " + Math.round(net) + " N on " + (v.mass || 1) + " kg gives a = " + a.toFixed(1) + " m/s2 (target " + (g.target || 3) + ").";
    }
    if (g.kind === "market") {
      var d = Math.abs((v.price || 0) - (g.target || 50));
      return d < 8 ? "Near equilibrium - supply and demand are balanced." : ((v.price || 0) > (g.target || 50) ? "Price above equilibrium, so there is a surplus." : "Price below equilibrium, so there is a shortage.");
    }
    var arr = (g.sliders || []).map(function (s) { return v[s.id] || 0; });
    var min = Math.min.apply(null, arr.concat([100]));
    return "Limiting input is the lowest slider (" + Math.round(min) + "). Raise the lowest to grow faster.";
  }
  function draw() {
    var v = vals();
    liveNote.textContent = tip(v);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var W = canvas.width = Math.max(320, canvas.clientWidth * 2), H = canvas.height = 300 * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    var w = W / 2, h = H / 2;
    ctx.clearRect(0, 0, w, h);
    var sc = score(v);
    var slidersArr = g.sliders || [];
    var barW = Math.min(72, (w - 60) / Math.max(1, slidersArr.length) - 12);
    var barColors = ["#558E9B", "#7EA85B", "#F2B44B"];
    slidersArr.forEach(function (s, i) {
      var x = 24 + i * (barW + 18), y = 60, bh = 150;
      var val = v[s.id] || 0;
      ctx.fillStyle = "#FCF9EE"; ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = barColors[i % barColors.length]; ctx.fillRect(x, y + bh * (1 - val / 100), barW, bh * (val / 100));
      ctx.strokeStyle = "#2C261F"; ctx.lineWidth = 2; ctx.strokeRect(x, y, barW, bh);
      if (s.id === "price" && g.target != null) {
        var ty = y + bh * (1 - g.target / 100);
        ctx.fillStyle = "#C45158"; ctx.fillRect(x - 4, ty, barW + 8, 4);
      }
      ctx.fillStyle = "#2C261F"; ctx.font = "700 11px Plus Jakarta Sans, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(s.label, x + barW / 2, y - 8);
      ctx.fillText(Math.round(val), x + barW / 2, y + bh + 16);
    });
    ctx.fillStyle = "#2C261F"; ctx.font = "700 34px Fredoka, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(sc + "%", w / 2, h - 38);
    ctx.fillStyle = "#57534A"; ctx.font = "600 12px Plus Jakarta Sans, sans-serif";
    ctx.fillText(g.unit || "score", w / 2, h - 18);
    ctx.fillStyle = "#FCF9EE"; ctx.fillRect(24, 24, w - 48, 12);
    ctx.fillStyle = "#7EA85B"; ctx.fillRect(24, 24, (w - 48) * Math.min(1, growth / 100), 12);
    ctx.strokeStyle = "#2C261F"; ctx.lineWidth = 2; ctx.strokeRect(24, 24, w - 48, 12);
    ctx.fillStyle = "#2C261F"; ctx.font = "700 11px Plus Jakarta Sans, sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Session Progress", 24, 18);
  }

  sliders.querySelectorAll("input[type=range]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var id = inp.getAttribute("data-id");
      var span = sliders.querySelector('[data-val="' + id + '"]');
      if (span) span.textContent = inp.value;
      draw();
    });
  });

  runBtn.addEventListener("click", function () {
    var v = vals();
    var sc = score(v);
    growth += sc;
    fb.innerHTML = '<div class="fb ' + (sc >= 60 ? "good" : "bad") + '">Round ' + round + ": " + esc(tip(v)) + " Score " + sc + "%.</div>";
    round++;
    roundLbl.textContent = "Round " + Math.min(round, MAXR) + " / " + MAXR;
    draw();
    if (round > MAXR) {
      runBtn.disabled = true;
      var avg = Math.round(growth / MAXR);
      fb.innerHTML += '<div class="fb ' + (avg >= 60 ? "good" : "bad") + '" style="margin-top:10px"><strong>Result:</strong> average ' + avg + "%. " +
        (avg >= 70 ? "You balanced the system well." : "Try to raise the limiting input each round.") + "</div>";
      bumpMastery(avg >= 60 ? 20 : 8);
    }
  });
  resetBtn.addEventListener("click", function () {
    growth = 0; round = 1; runBtn.disabled = false; roundLbl.textContent = "Round 1 / 5";
    sliders.querySelectorAll("input[type=range]").forEach(function (inp) {
      inp.value = 50;
      var span = sliders.querySelector('[data-val="' + inp.getAttribute("data-id") + '"]');
      if (span) span.textContent = "50";
    });
    fb.innerHTML = ""; draw();
  });

  setTimeout(draw, 30);
  return w;
}