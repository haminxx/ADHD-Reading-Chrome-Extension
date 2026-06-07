// Focus Reader - Gaze Engine (shared, camera-free DOM logic).
// Given a stream of gaze points (viewport pixels), this finds the words in the
// reading zone around the gaze and bionic-bolds them: nearby words on the same
// line get instant bold, and the focal word gets an animated per-character
// sweep. It also draws a faint gaze cursor and a subtle reading-line band.
//
// This module owns NO camera and NO WebGazer code. It runs in whatever document
// it is loaded in (a host web page via the content script, or the reader page),
// so it is reused by both. Coordinates are expected in that document's viewport
// space. Exposes a single global: window.FocusReaderGazeEngine.create(opts).
(function (global) {
  "use strict";

  var bionicSplit =
    (global.FocusReaderBionic || {}).bionicSplit ||
    function (w, f) {
      var n = Math.ceil(w.length * (typeof f === "number" ? f : 0.5));
      if (n < 1) n = 1;
      if (n >= w.length) n = w.length - 1;
      return [w.slice(0, n), w.slice(n)];
    };

  var WORD_CHAR = /[\p{L}\p{N}'\u2019\-]/u;
  var HAS_LETTER = /[\p{L}\p{N}]/u;

  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1,
    VAR: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, MATH: 1,
    CANVAS: 1, AUDIO: 1, VIDEO: 1, BUTTON: 1
  };

  // Our own overlay element ids we must never treat as readable content.
  var OWN_IDS = {
    "fr-gaze-cursor": 1,
    "fr-gaze-line-band": 1,
    "fr-gaze-toast": 1,
    "fr-cam-frame": 1
  };

  // Tunables (shared defaults).
  var SMOOTH_ALPHA = 0.22;       // low-pass factor for gaze point
  var PROCESS_INTERVAL_MS = 50;  // throttle gaze->word work (~20Hz)
  var PRIMARY_DWELL_MS = 90;     // focal word must rest this long before sweep
  var CHAR_SWEEP_MS = 45;        // pace of the per-character bold sweep
  var SWEEP_MIN_MS = 180;        // minimum total sweep duration
  var ZONE_GRACE_MS = 350;       // keep zone words briefly after gaze leaves
  var ZONE_X_SAMPLES = [-90, -45, 0, 45, 90]; // horizontal gaze samples (px)
  var ZONE_Y_SAMPLES = [-14, 0, 14];          // vertical samples (one line band)
  var MAX_ZONE_WORDS = 12;       // cap DOM work per frame
  var LINE_BAND_PAD_X = 24;      // reading-line highlight padding
  var LINE_BAND_PAD_Y = 6;
  var LINE_TOLERANCE = 22;       // px: words within this Y of focal are "same line"

  function nowMs() {
    return (global.performance && performance.now)
      ? performance.now()
      : Date.now();
  }

  // Each call returns an independent engine bound to the current document.
  function create(opts) {
    opts = opts || {};
    var doc = global.document;

    var intensity = typeof opts.intensity === "number" ? opts.intensity : 0.5;
    var showCursor = opts.showCursor !== false;

    // Per-engine state.
    var sx = null, sy = null;        // smoothed gaze point
    var lastProcess = 0;
    var pendingPrimaryKey = "";
    var pendingPrimarySince = 0;
    var primaryKey = "";
    var zoneEntries = {};            // key -> { wrap, text, info, role, lastSeen }
    var sweepRAF = null;
    var cursorEl = null, lineBandEl = null;

    var nodeIds = new WeakMap();
    var nextNodeId = 1;

    // -------------------------------------------------------------------------
    // Word location helpers
    // -------------------------------------------------------------------------
    function isSkipped(el) {
      while (el && el.nodeType === 1) {
        if (SKIP_TAGS[el.tagName]) return true;
        if (el.isContentEditable) return true;
        if (el.id && OWN_IDS[el.id]) return true;
        el = el.parentElement;
      }
      return false;
    }

    function isGazeWrap(el) {
      return el && el.classList &&
        (el.classList.contains("adhd-gaze-word") ||
          el.classList.contains("adhd-gaze-zone-word"));
    }

    function caretNodeAt(x, y) {
      if (doc.caretRangeFromPoint) {
        var range = doc.caretRangeFromPoint(x, y);
        if (range) {
          return { node: range.startContainer, offset: range.startOffset };
        }
      } else if (doc.caretPositionFromPoint) {
        var pos = doc.caretPositionFromPoint(x, y);
        if (pos) return { node: pos.offsetNode, offset: pos.offset };
      }
      return null;
    }

    function wordAt(node, offset) {
      if (!node || node.nodeType !== 3) return null;
      var text = node.nodeValue;
      if (!text || !HAS_LETTER.test(text)) return null;

      if (offset >= text.length) offset = text.length - 1;
      if (offset < 0) offset = 0;

      if (!WORD_CHAR.test(text.charAt(offset))) {
        if (offset > 0 && WORD_CHAR.test(text.charAt(offset - 1))) {
          offset = offset - 1;
        } else if (
          offset < text.length - 1 &&
          WORD_CHAR.test(text.charAt(offset + 1))
        ) {
          offset = offset + 1;
        } else {
          return null;
        }
      }

      var start = offset, end = offset + 1;
      while (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) start--;
      while (end < text.length && WORD_CHAR.test(text.charAt(end))) end++;

      while (start < end && !HAS_LETTER.test(text.charAt(start))) start++;
      while (end > start && !HAS_LETTER.test(text.charAt(end - 1))) end--;

      var word = text.slice(start, end);
      if (!word || !HAS_LETTER.test(word)) return null;
      return { node: node, start: start, end: end, word: word };
    }

    function nodeId(node) {
      if (!node) return 0;
      if (!nodeIds.has(node)) nodeIds.set(node, nextNodeId++);
      return nodeIds.get(node);
    }

    function wordKey(info) {
      return nodeId(info.node) + ":" + info.start + ":" + info.end;
    }

    function wordAtPoint(x, y) {
      if (x < 0 || y < 0 || x > global.innerWidth || y > global.innerHeight) {
        return null;
      }
      var el = doc.elementFromPoint(x, y);
      if (!el || isSkipped(el)) return null;
      var caret = caretNodeAt(x, y);
      if (!caret) return null;
      var info = wordAt(caret.node, caret.offset);
      if (!info) return null;
      info.key = wordKey(info);
      return info;
    }

    function wordCenter(info) {
      try {
        var range = doc.createRange();
        range.setStart(info.node, info.start);
        range.setEnd(info.node, info.end);
        var rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      } catch (e) {
        return null;
      }
    }

    function distSq(ax, ay, bx, by) {
      var dx = ax - bx, dy = ay - by;
      return dx * dx + dy * dy;
    }

    function wordsInReadingZone(cx, cy) {
      var seen = {};
      var list = [];
      var i, j, info, center;

      for (j = 0; j < ZONE_Y_SAMPLES.length; j++) {
        for (i = 0; i < ZONE_X_SAMPLES.length; i++) {
          info = wordAtPoint(cx + ZONE_X_SAMPLES[i], cy + ZONE_Y_SAMPLES[j]);
          if (!info || seen[info.key]) continue;
          seen[info.key] = true;
          center = wordCenter(info);
          if (!center) continue;
          info.centerX = center.x;
          info.centerY = center.y;
          list.push(info);
          if (list.length >= MAX_ZONE_WORDS) break;
        }
        if (list.length >= MAX_ZONE_WORDS) break;
      }

      if (!list.length) return { primary: null, context: [] };

      var primary = list[0], best = Infinity, k;
      for (k = 0; k < list.length; k++) {
        var d = distSq(list[k].centerX, list[k].centerY, cx, cy);
        if (d < best) {
          best = d;
          primary = list[k];
        }
      }

      var lineY = primary.centerY;
      var context = [];
      for (k = 0; k < list.length; k++) {
        if (list[k].key === primary.key) continue;
        if (Math.abs(list[k].centerY - lineY) <= LINE_TOLERANCE) {
          context.push(list[k]);
        }
      }
      context.sort(function (a, b) { return a.centerX - b.centerX; });

      return { primary: primary, context: context };
    }

    // -------------------------------------------------------------------------
    // Word wrapping / bolding
    // -------------------------------------------------------------------------
    function buildPrimaryWrap(word) {
      var wrap = doc.createElement("span");
      wrap.className = "adhd-gaze-word";
      var chars = [];
      for (var i = 0; i < word.length; i++) {
        var c = doc.createElement("span");
        c.textContent = word.charAt(i);
        wrap.appendChild(c);
        chars.push(c);
      }
      wrap.__frChars = chars;
      return wrap;
    }

    function buildZoneWrap(word) {
      var wrap = doc.createElement("span");
      wrap.className = "adhd-gaze-zone-word";
      var parts = bionicSplit(word, intensity);
      if (parts[0]) {
        var bold = doc.createElement("span");
        bold.className = "adhd-gaze-zone-bold";
        bold.textContent = parts[0];
        wrap.appendChild(bold);
      }
      if (parts[1]) wrap.appendChild(doc.createTextNode(parts[1]));
      return wrap;
    }

    function restoreWrap(entry) {
      if (!entry || !entry.wrap || !entry.wrap.parentNode) return;
      try {
        entry.wrap.parentNode.replaceChild(
          doc.createTextNode(entry.text),
          entry.wrap
        );
        entry.wrap.parentNode.normalize();
      } catch (e) {
        /* ignore */
      }
    }

    function clearZoneEntry(key) {
      var entry = zoneEntries[key];
      if (!entry) return;
      restoreWrap(entry);
      delete zoneEntries[key];
      if (primaryKey === key) primaryKey = "";
    }

    function clearAllZoneWords() {
      if (sweepRAF) {
        cancelAnimationFrame(sweepRAF);
        sweepRAF = null;
      }
      Object.keys(zoneEntries).forEach(clearZoneEntry);
      primaryKey = "";
      pendingPrimaryKey = "";
      removeLineBand();
    }

    function sortForDomActivation(words) {
      return words.slice().sort(function (a, b) {
        if (a.node === b.node) return b.start - a.start;
        var pos = a.node.compareDocumentPosition(b.node);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
    }

    function mountWordWrap(info, role) {
      var node = info.node;
      if (!node || node.nodeType !== 3 || !node.parentNode) return null;
      if (isSkipped(node.parentNode)) return null;
      if (isGazeWrap(node.parentNode)) return null;

      var wordNode;
      try {
        node.splitText(info.end);
        wordNode = node.splitText(info.start);
      } catch (e) {
        return null;
      }
      if (!wordNode || wordNode.nodeValue !== info.word) {
        try { node.parentNode && node.parentNode.normalize(); } catch (e2) {}
        return null;
      }

      var wrap = role === "primary"
        ? buildPrimaryWrap(info.word)
        : buildZoneWrap(info.word);
      wordNode.parentNode.replaceChild(wrap, wordNode);
      return wrap;
    }

    function ensureZoneWord(info, role) {
      var key = info.key;
      var now = nowMs();
      var entry = zoneEntries[key];

      if (entry && entry.wrap && entry.wrap.isConnected) {
        if (role === "primary" && entry.role === "context") {
          restoreWrap(entry);
          delete zoneEntries[key];
          entry = null;
        } else {
          entry.lastSeen = now;
          if (role === "primary") {
            entry.role = "primary";
            primaryKey = key;
            if (entry.wrap.classList.contains("adhd-gaze-word")) {
              startSweep(entry.wrap, entry.text);
            }
          }
          return entry;
        }
      }

      var wrap = mountWordWrap(info, role);
      if (!wrap) return null;

      entry = {
        wrap: wrap,
        text: info.word,
        info: info,
        role: role,
        lastSeen: now
      };
      zoneEntries[key] = entry;

      if (role === "primary") {
        primaryKey = key;
        startSweep(wrap, info.word);
      }
      return entry;
    }

    function startSweep(wrap, word) {
      var chars = wrap.__frChars || [];
      var parts = bionicSplit(word, intensity);
      var boldCount = parts[0] ? parts[0].length : Math.ceil(word.length * 0.5);
      if (boldCount < 1) boldCount = 1;
      if (boldCount > chars.length) boldCount = chars.length;

      var total = Math.max(SWEEP_MIN_MS, boldCount * CHAR_SWEEP_MS);
      var startTs = null;
      var lit = 0;

      function step(ts) {
        if (!startTs) startTs = ts;
        var t = (ts - startTs) / total;
        if (t > 1) t = 1;
        var target = Math.round(t * boldCount);
        while (lit < target && lit < chars.length) {
          chars[lit].classList.add("adhd-gaze-bold");
          lit++;
        }
        if (t < 1 && primaryKey && zoneEntries[primaryKey] &&
            zoneEntries[primaryKey].wrap === wrap) {
          sweepRAF = requestAnimationFrame(step);
        } else {
          sweepRAF = null;
        }
      }
      sweepRAF = requestAnimationFrame(step);
    }

    // -------------------------------------------------------------------------
    // Reading-line band + cursor
    // -------------------------------------------------------------------------
    function ensureLineBand() {
      if (lineBandEl) return;
      lineBandEl = doc.createElement("div");
      lineBandEl.id = "fr-gaze-line-band";
      doc.body.appendChild(lineBandEl);
    }

    function updateLineBand(primary) {
      if (!primary) {
        removeLineBand();
        return;
      }
      var entry = zoneEntries[primary.key];
      var rect = null;
      if (entry && entry.wrap && entry.wrap.isConnected) {
        rect = entry.wrap.getBoundingClientRect();
      } else {
        try {
          var range = doc.createRange();
          range.setStart(primary.node, primary.start);
          range.setEnd(primary.node, primary.end);
          rect = range.getBoundingClientRect();
        } catch (e) {
          rect = null;
        }
      }
      if (!rect || (!rect.width && !rect.height)) {
        removeLineBand();
        return;
      }
      ensureLineBand();
      lineBandEl.style.left = (rect.left - LINE_BAND_PAD_X) + "px";
      lineBandEl.style.top = (rect.top - LINE_BAND_PAD_Y) + "px";
      lineBandEl.style.width = (rect.width + LINE_BAND_PAD_X * 2) + "px";
      lineBandEl.style.height = (rect.height + LINE_BAND_PAD_Y * 2) + "px";
    }

    function removeLineBand() {
      if (lineBandEl && lineBandEl.parentNode) {
        lineBandEl.parentNode.removeChild(lineBandEl);
      }
      lineBandEl = null;
    }

    function ensureCursor() {
      if (!showCursor || cursorEl) return;
      cursorEl = doc.createElement("div");
      cursorEl.id = "fr-gaze-cursor";
      doc.body.appendChild(cursorEl);
    }

    function moveCursor(x, y) {
      if (cursorEl) {
        cursorEl.style.left = x + "px";
        cursorEl.style.top = y + "px";
      }
    }

    function removeCursor() {
      if (cursorEl && cursorEl.parentNode) {
        cursorEl.parentNode.removeChild(cursorEl);
      }
      cursorEl = null;
    }

    // -------------------------------------------------------------------------
    // Frame processing
    // -------------------------------------------------------------------------
    function pruneStaleZoneWords(now) {
      Object.keys(zoneEntries).forEach(function (key) {
        if (now - zoneEntries[key].lastSeen > ZONE_GRACE_MS) {
          clearZoneEntry(key);
        }
      });
    }

    function applyReadingZone(zone, now) {
      if (!zone.primary) {
        pruneStaleZoneWords(now);
        removeLineBand();
        return;
      }

      var pk = zone.primary.key;
      var activeKeys = {};
      var ordered = sortForDomActivation(zone.context);
      var i;

      for (i = 0; i < ordered.length; i++) {
        ensureZoneWord(ordered[i], "context");
        activeKeys[ordered[i].key] = true;
      }

      if (pk === pendingPrimaryKey) {
        if (now - pendingPrimarySince >= PRIMARY_DWELL_MS) {
          ensureZoneWord(zone.primary, "primary");
          activeKeys[pk] = true;
        }
      } else {
        pendingPrimaryKey = pk;
        pendingPrimarySince = now;
      }

      updateLineBand(zone.primary);

      Object.keys(zoneEntries).forEach(function (key) {
        if (!activeKeys[key]) zoneEntries[key].lastSeen = now;
      });

      pruneStaleZoneWords(now);
    }

    function processPoint(x, y) {
      if (x < 0 || y < 0 || x > global.innerWidth || y > global.innerHeight) {
        return;
      }
      try {
        applyReadingZone(wordsInReadingZone(x, y), nowMs());
      } catch (e) {
        /* never let a single bad sample kill the loop */
      }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    return {
      // Begin drawing feedback (gaze cursor).
      start: function () {
        ensureCursor();
      },

      // Feed a raw gaze sample (viewport px). Smooths + throttles internally.
      feed: function (x, y) {
        if (typeof x !== "number" || typeof y !== "number") return;
        if (!isFinite(x) || !isFinite(y)) return;

        if (sx === null) {
          sx = x;
          sy = y;
        } else {
          sx += SMOOTH_ALPHA * (x - sx);
          sy += SMOOTH_ALPHA * (y - sy);
        }
        moveCursor(sx, sy);

        var now = nowMs();
        if (now - lastProcess < PROCESS_INTERVAL_MS) return;
        lastProcess = now;
        processPoint(sx, sy);
      },

      setIntensity: function (v) {
        if (typeof v === "number" && isFinite(v)) intensity = v;
      },

      // Remove every wrapped word, the cursor and the line band; reset smoothing.
      clear: function () {
        clearAllZoneWords();
        removeCursor();
        sx = sy = null;
        lastProcess = 0;
        pendingPrimaryKey = "";
        pendingPrimarySince = 0;
      }
    };
  }

  global.FocusReaderGazeEngine = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
