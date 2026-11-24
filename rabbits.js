"use strict";
/* Unlocked — Interactive Forest Rabbit Ecosystem
   Uses the 4-pose rabbit model & expressions sheet (/public/assets/aistudio/image_3b954c6d.png):
   idle (front), hop (3/4 stride), curious (head-tilt), and sleep (cozy nap + ZZ).
   Starts with 1 rabbit, doubles every 10s from screen corners up to 64 cap.
   Click any rabbit to halve the population. Hops randomly, avoids collisions,
   and slowly gathers around the spot where the mouse is waiting. */

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var ASSET_SRC = "/public/assets/aistudio/image_3b954c6d.png";
  var MAX_RABBITS = 64;
  var DOUBLE_INTERVAL_MS = 10000;
  var RABBIT_HEIGHT = 24;
  var MIN_SEPARATION = 26;
  var HIT_RADIUS = 20;

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var canvas = document.createElement("canvas");
  canvas.id = "rabbitEcosystemCanvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:45;";

  var ctx = null;
  var vw = window.innerWidth || 1200;
  var vh = window.innerHeight || 800;
  var dpr = Math.min(2, window.devicePixelRatio || 1);

  var sprites = {
    idle: null,
    hop: null,
    curious: null,
    sleep: null
  };
  var rawImg = new Image();
  rawImg.crossOrigin = "anonymous";

  function extractPose(sourceCanvas, region) {
    var rCanvas = document.createElement("canvas");
    rCanvas.width = region.w;
    rCanvas.height = region.h;
    var rctx = rCanvas.getContext("2d");
    rctx.imageSmoothingEnabled = true;
    rctx.imageSmoothingQuality = "high";
    rctx.drawImage(sourceCanvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);

    var im = rctx.getImageData(0, 0, region.w, region.h);
    var d = im.data;
    var minX = region.w, minY = region.h, maxX = 0, maxY = 0;
    for (var y = 0; y < region.h; y++) {
      for (var x = 0; x < region.w; x++) {
        var a = d[(y * region.w + x) * 4 + 3];
        if (a > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return null;

    var pad = 3;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(region.w - 1, maxX + pad);
    maxY = Math.min(region.h - 1, maxY + pad);
    var cropW = maxX - minX + 1;
    var cropH = maxY - minY + 1;

    var cropped = document.createElement("canvas");
    cropped.width = cropW;
    cropped.height = cropH;
    var cctx = cropped.getContext("2d");
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(rCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    // Progressive 0.5x mipmap downsampling preserves warm caramel lineart & facial details
    var targetH = Math.max(40, Math.round(RABBIT_HEIGHT * dpr * 2));
    var cur = cropped;
    while (cur.height * 0.5 >= targetH) {
      var nextW = Math.max(1, Math.round(cur.width * 0.5));
      var nextH = Math.max(1, Math.round(cur.height * 0.5));
      var stepCanvas = document.createElement("canvas");
      stepCanvas.width = nextW;
      stepCanvas.height = nextH;
      var sctx = stepCanvas.getContext("2d");
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(cur, 0, 0, nextW, nextH);
      cur = stepCanvas;
    }

    return {
      canvas: cur,
      w: Math.round(RABBIT_HEIGHT * (cropW / cropH)),
      h: RABBIT_HEIGHT
    };
  }

  function buildPoseSprites(img) {
    try {
      var w = img.naturalWidth || 560;
      var h = img.naturalHeight || 667;
      var off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      var octx = off.getContext("2d");
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(img, 0, 0, w, h);

      // Cleanly remove center artist signature text between top and bottom poses
      var sx = w / 560;
      var sy = h / 667;
      octx.clearRect(Math.floor(225 * sx), Math.floor(338 * sy), Math.ceil(115 * sx), Math.ceil(18 * sy));

      sprites.idle = extractPose(off, {
        x: Math.floor(18 * sx),
        y: Math.floor(10 * sy),
        w: Math.ceil(236 * sx),
        h: Math.ceil(306 * sy)
      });
      sprites.hop = extractPose(off, {
        x: Math.floor(306 * sx),
        y: Math.floor(30 * sy),
        w: Math.ceil(244 * sx),
        h: Math.ceil(296 * sy)
      });
      sprites.curious = extractPose(off, {
        x: Math.floor(10 * sx),
        y: Math.floor(346 * sy),
        w: Math.ceil(268 * sx),
        h: Math.ceil(304 * sy)
      });
      sprites.sleep = extractPose(off, {
        x: Math.floor(280 * sx),
        y: Math.floor(348 * sy),
        w: Math.ceil(262 * sx),
        h: Math.ceil(306 * sy)
      });
    } catch (err) {
      sprites = { idle: null, hop: null, curious: null, sleep: null };
    }
  }

  rawImg.onload = function () { buildPoseSprites(rawImg); };
  rawImg.src = ASSET_SRC;

  var nextId = 1;
  var rabbits = [];
  var puffs = [];

  var mouse = {
    x: vw * 0.5,
    y: vh * 0.5,
    active: false,
    settledAt: performance.now(),
    anchorX: vw * 0.5,
    anchorY: vh * 0.5
  };

  function resize() {
    vw = window.innerWidth || 1200;
    vh = window.innerHeight || 800;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(vw * dpr));
    canvas.height = Math.max(1, Math.floor(vh * dpr));
    ctx = canvas.getContext("2d");
  }

  function cornerPosition(cornerIdx) {
    var topY = 72;
    var pad = 18;
    switch (cornerIdx % 4) {
      case 0: return { x: pad, y: topY, tx: vw * 0.25, ty: vh * 0.3 };
      case 1: return { x: vw - pad, y: topY, tx: vw * 0.75, ty: vh * 0.3 };
      case 2: return { x: pad, y: vh - pad, tx: vw * 0.25, ty: vh * 0.7 };
      default: return { x: vw - pad, y: vh - pad, tx: vw * 0.75, ty: vh * 0.7 };
    }
  }

  function createRabbit(fromCorner) {
    var c = cornerPosition(Math.floor(Math.random() * 4));
    var angle = Math.atan2(c.ty - c.y, c.tx - c.x) + (Math.random() - 0.5) * 0.85;
    var speed = 85 + Math.random() * 45;
    var id = nextId++;
    return {
      id: id,
      x: c.x + (Math.random() - 0.5) * 12,
      y: c.y + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      facing: Math.cos(angle) >= 0 ? 1 : -1,
      hopPhase: 0.05 + Math.random() * 0.2,
      hopDur: 0.20 + Math.random() * 0.11,
      hopAmp: 6 + Math.random() * 5,
      restTimer: 0,
      hopCount: 0,
      mood: "hop",
      isSleeping: false,
      curiousTimer: 0.6,
      wanderAngle: angle,
      orbitAngle: (id * 2.39996) % (Math.PI * 2),
      orbitRadius: 20 + (id % 5) * 8,
      spawnScale: fromCorner ? 0.25 : 1,
      squash: 0
    };
  }

  function spawnPuff(x, y, color) {
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI * 2 * i) / 6 + Math.random() * 0.4;
      var sp = 22 + Math.random() * 28;
      puffs.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 10,
        life: 1,
        r: 2 + Math.random() * 2,
        color: color || "#FFF8E5"
      });
    }
  }

  function doublePopulation() {
    if (rabbits.length >= MAX_RABBITS) return;
    var target = Math.min(MAX_RABBITS, Math.max(1, rabbits.length * 2));
    var toAdd = target - rabbits.length;
    for (var i = 0; i < toAdd; i++) {
      rabbits.push(createRabbit(true));
    }
  }

  function halvePopulation(clickedIndex) {
    if (rabbits.length <= 1) {
      if (rabbits[0]) {
        rabbits[0].isSleeping = false;
        rabbits[0].curiousTimer = 1.4;
        rabbits[0].hopPhase = 0.01;
        rabbits[0].restTimer = 0;
        rabbits[0].hopAmp = 14;
        spawnPuff(rabbits[0].x, rabbits[0].y - 6, "#AEE3F5");
      }
      return;
    }
    var targetCount = Math.max(1, Math.floor(rabbits.length / 2));
    var removeCount = rabbits.length - targetCount;

    var clicked = rabbits[clickedIndex];
    if (clicked) {
      spawnPuff(clicked.x, clicked.y - 6, "#FFF8E5");
      rabbits.splice(clickedIndex, 1);
      removeCount--;
    }
    while (removeCount > 0 && rabbits.length > 1) {
      var idx = Math.floor(Math.random() * rabbits.length);
      var removed = rabbits.splice(idx, 1)[0];
      if (removed) spawnPuff(removed.x, removed.y - 6, "#F3DFC6");
      removeCount--;
    }

    // Remaining bunnies look surprised/curious after a friend disappears
    for (var i = 0; i < rabbits.length; i++) {
      rabbits[i].isSleeping = false;
      rabbits[i].curiousTimer = 1.3 + Math.random() * 0.7;
    }
  }

  function findRabbitAt(clientX, clientY) {
    var bestIdx = -1;
    var bestDist = HIT_RADIUS;
    for (var i = rabbits.length - 1; i >= 0; i--) {
      var r = rabbits[i];
      var lift = r.hopPhase >= 0 ? Math.sin(r.hopPhase * Math.PI) * r.hopAmp : 0;
      var dx = clientX - r.x;
      var dy = clientY - (r.y - lift);
      var d = Math.hypot(dx, dy);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function isInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest("button, a, input, select, textarea, label, summary, .opt, .arch-card, .topic-card, .tab");
  }

  function step(dt, now) {
    var waitMs = mouse.active ? (now - mouse.settledAt) : 0;
    var gatherStrength = waitMs > 350 ? Math.min(1, (waitMs - 350) / 1200) : 0;

    for (var i = 0; i < rabbits.length; i++) {
      var r = rabbits[i];
      if (r.spawnScale < 1) r.spawnScale = Math.min(1, r.spawnScale + dt * 5.5);
      if (r.squash > 0) r.squash = Math.max(0, r.squash - dt * 4.5);
      if (r.curiousTimer > 0) r.curiousTimer = Math.max(0, r.curiousTimer - dt);

      if (reducedMotion) {
        r.mood = (r.id % 3 === 0) ? "sleep" : ((r.id % 2 === 0) ? "curious" : "idle");
        continue;
      }

      var desiredVx = 0, desiredVy = 0;
      var nearMouse = false;
      var isResting = r.restTimer > 0 && r.hopPhase < 0;

      if (gatherStrength > 0.05) {
        var tx = Math.max(16, Math.min(vw - 16, mouse.x + Math.cos(r.orbitAngle) * r.orbitRadius));
        var ty = Math.max(72, Math.min(vh - 16, mouse.y + Math.sin(r.orbitAngle) * r.orbitRadius));
        var gx = tx - r.x;
        var gy = ty - r.y;
        var gd = Math.hypot(gx, gy);

        if (gd > 12) {
          var gatherSpeed = 68 + gatherStrength * 74;
          desiredVx = (gx / gd) * gatherSpeed;
          desiredVy = (gy / gd) * gatherSpeed;
          r.isSleeping = false;
          if (r.restTimer > 0.12) r.restTimer = 0.12;
        } else {
          nearMouse = true;
          r.facing = mouse.x >= r.x ? 1 : -1;
          desiredVx = 0;
          desiredVy = 0;
        }
      }

      if (r.hopPhase >= 0) {
        r.isSleeping = false;
        r.mood = "hop";
        r.hopPhase += dt / r.hopDur;
        if (gatherStrength > 0.1) {
          r.vx += (desiredVx - r.vx) * Math.min(1, dt * 5.2 * gatherStrength);
          r.vy += (desiredVy - r.vy) * Math.min(1, dt * 5.2 * gatherStrength);
        }
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        if (Math.abs(r.vx) > 2) r.facing = r.vx >= 0 ? 1 : -1;

        if (r.hopPhase >= 1) {
          r.hopPhase = -1;
          r.hopCount++;
          r.squash = 0.26;
          r.vx *= 0.25;
          r.vy *= 0.25;

          if (nearMouse && gatherStrength > 0.45) {
            if (Math.random() < 0.5) {
              r.isSleeping = true;
              r.restTimer = 1.2 + Math.random() * 1.4;
            } else {
              r.curiousTimer = 0.7 + Math.random() * 0.5;
              r.restTimer = 0.65 + Math.random() * 0.6;
            }
          } else if (r.hopCount % 8 === 0 || Math.random() < 0.1) {
            r.isSleeping = true;
            r.restTimer = 0.9 + Math.random() * 1.1;
          } else if (Math.random() < 0.3) {
            r.curiousTimer = 0.35 + Math.random() * 0.35;
            r.restTimer = 0.25 + Math.random() * 0.35;
          } else {
            r.isSleeping = false;
            r.restTimer = 0.08 + Math.random() * 0.26;
          }
        }
      } else {
        r.restTimer -= dt;
        if (r.isSleeping) {
          r.mood = "sleep";
        } else if (r.curiousTimer > 0 || (nearMouse && gatherStrength > 0.25)) {
          r.mood = "curious";
        } else {
          r.mood = "idle";
        }

        if (!isResting || r.restTimer <= 0) {
          r.isSleeping = false;
          r.hopPhase = 0;
          r.mood = "hop";
          r.hopDur = 0.19 + Math.random() * 0.11;
          r.hopAmp = 6 + Math.random() * 5;
          if (gatherStrength > 0.15 && Math.hypot(desiredVx, desiredVy) > 4) {
            var jitter = (Math.random() - 0.5) * 0.45;
            var baseA = Math.atan2(desiredVy, desiredVx) + jitter;
            var sp = 68 + Math.random() * 54;
            r.vx = Math.cos(baseA) * sp;
            r.vy = Math.sin(baseA) * sp;
          } else {
            r.wanderAngle += (Math.random() - 0.5) * 2.0;
            var wsp = 72 + Math.random() * 64;
            r.vx = Math.cos(r.wanderAngle) * wsp;
            r.vy = Math.sin(r.wanderAngle) * wsp;
          }
          if (Math.abs(r.vx) > 2) r.facing = r.vx >= 0 ? 1 : -1;
        }
      }
    }

    // Pairwise collision avoidance
    for (var i = 0; i < rabbits.length; i++) {
      var a = rabbits[i];
      for (var j = i + 1; j < rabbits.length; j++) {
        var b = rabbits[j];
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var dist = Math.hypot(dx, dy);
        if (dist < MIN_SEPARATION) {
          var nx = dist > 0.01 ? dx / dist : Math.cos(i * 1.7);
          var ny = dist > 0.01 ? dy / dist : Math.sin(i * 1.7);
          var overlap = (MIN_SEPARATION - dist) * 0.5;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          a.vx -= nx * 48 * dt;
          a.vy -= ny * 48 * dt;
          b.vx += nx * 48 * dt;
          b.vy += ny * 48 * dt;
        }
      }
    }

    var minX = 18, maxX = Math.max(36, vw - 18);
    var minY = 72, maxY = Math.max(94, vh - 18);
    for (var m = 0; m < rabbits.length; m++) {
      var rb = rabbits[m];
      if (rb.x < minX) { rb.x = minX; rb.vx = Math.abs(rb.vx); rb.wanderAngle = Math.atan2(rb.vy, rb.vx); }
      if (rb.x > maxX) { rb.x = maxX; rb.vx = -Math.abs(rb.vx); rb.wanderAngle = Math.atan2(rb.vy, rb.vx); }
      if (rb.y < minY) { rb.y = minY; rb.vx = rb.vx; rb.vy = Math.abs(rb.vy); rb.wanderAngle = Math.atan2(rb.vy, rb.vx); }
      if (rb.y > maxY) { rb.y = maxY; rb.vx = rb.vx; rb.vy = -Math.abs(rb.vy); rb.wanderAngle = Math.atan2(rb.vy, rb.vx); }
    }

    for (var p = puffs.length - 1; p >= 0; p--) {
      var pf = puffs[p];
      pf.x += pf.vx * dt;
      pf.y += pf.vy * dt;
      pf.life -= dt * 2.1;
      if (pf.life <= 0) puffs.splice(p, 1);
    }
  }

  function render(now) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, vw, vh);

    for (var i = 0; i < rabbits.length; i++) {
      var r = rabbits[i];
      var lift = r.hopPhase >= 0 ? Math.sin(r.hopPhase * Math.PI) * r.hopAmp : 0;
      var shScale = Math.max(0.45, 1 - lift / 26) * r.spawnScale;
      ctx.save();
      ctx.globalAlpha = 0.34 * shScale;
      ctx.fillStyle = "#061009";
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + RABBIT_HEIGHT * 0.44, 7.5 * shScale, 2.5 * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var sorted = rabbits.slice().sort(function (a, b) { return a.y - b.y; });
    for (var j = 0; j < sorted.length; j++) {
      var rb = sorted[j];
      var hop = rb.hopPhase >= 0 ? Math.sin(rb.hopPhase * Math.PI) * rb.hopAmp : 0;
      var breathe = rb.mood === "sleep" ? Math.sin(now * 0.0045 + rb.id) * 0.032 : 0;
      var sx = rb.spawnScale * (1 + rb.squash * 0.22 + breathe);
      var sy = rb.spawnScale * (1 - rb.squash * 0.16 - breathe * 0.6);

      var sp = sprites[rb.mood] || sprites.idle;
      var flipX = 1;
      if (rb.mood === "hop") {
        // Top-right hop pose naturally faces left; mirror when moving right
        flipX = -rb.facing;
      } else if (rb.mood === "curious") {
        flipX = rb.facing;
      }

      ctx.save();
      ctx.translate(rb.x, rb.y - hop);
      ctx.scale(flipX * sx, sy);

      if (sp && sp.canvas) {
        ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      } else if (rawImg.complete && rawImg.naturalWidth > 0) {
        ctx.drawImage(rawImg, 18, 10, 236, 306, -RABBIT_HEIGHT * 0.4, -RABBIT_HEIGHT / 2, RABBIT_HEIGHT * 0.8, RABBIT_HEIGHT);
      }
      ctx.restore();
    }

    for (var k = 0; k < puffs.length; k++) {
      var pf = puffs[k];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pf.life);
      ctx.fillStyle = pf.color;
      ctx.beginPath();
      ctx.arc(pf.x, pf.y, pf.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  var lastTime = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    step(dt, now);
    render(now);
    requestAnimationFrame(loop);
  }

  function start() {
    if (!document.body) return;
    document.body.appendChild(canvas);
    resize();

    rabbits.push(createRabbit(true));
    setInterval(doublePopulation, DOUBLE_INTERVAL_MS);

    window.addEventListener("resize", resize);

    window.addEventListener("mousemove", function (e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      if (Math.hypot(e.clientX - mouse.anchorX, e.clientY - mouse.anchorY) > 12) {
        mouse.anchorX = e.clientX;
        mouse.anchorY = e.clientY;
        mouse.settledAt = performance.now();
      }
      if (!isInteractiveTarget(e.target) && findRabbitAt(e.clientX, e.clientY) !== -1) {
        document.body.style.cursor = "pointer";
      } else if (document.body.style.cursor === "pointer") {
        document.body.style.cursor = "";
      }
    }, { passive: true });

    window.addEventListener("mouseleave", function () {
      mouse.active = false;
      if (document.body.style.cursor === "pointer") document.body.style.cursor = "";
    });

    document.addEventListener("click", function (e) {
      if (isInteractiveTarget(e.target)) return;
      var hit = findRabbitAt(e.clientX, e.clientY);
      if (hit !== -1) {
        e.stopPropagation();
        halvePopulation(hit);
      }
    });

    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
