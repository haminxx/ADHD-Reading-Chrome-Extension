// Focus Reader - Gaze Reading (beta).
// A separate mode from the static bionic bolding. When enabled it uses the
// webcam (via the locally-vendored WebGazer.js) to estimate where the user is
// looking, finds the word near the gaze point, and animates a bionic bold
// "sweep" across that word's leading characters as they read it.
//
// Everything runs locally: WebGazer bundles TensorFlow.js (WebGL/GPU backend)
// and we redirect its FaceMesh model download to model files vendored inside
// the extension (see installModelRedirect). No network calls at runtime.
//
// Realistic precision is word/line level, not true per-character gaze. The
// per-character effect is a reading-paced ANIMATION over the gazed word, with
// smoothing + a dwell threshold so jittery gaze doesn't thrash.
(function () {
  "use strict";

  // Only run in the top frame and only once per frame.
  if (window.top !== window) return;
  if (window.__frGazeLoaded) return;
  window.__frGazeLoaded = true;

  // ---------------------------------------------------------------------------
  // Shared helpers / constants
  // ---------------------------------------------------------------------------
  var bionicSplit =
    (window.FocusReaderBionic || {}).bionicSplit ||
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

  // Tunables
  var SMOOTH_ALPHA = 0.25;       // low-pass factor for gaze point
  var PROCESS_INTERVAL_MS = 40;  // throttle gaze->word work (~25Hz)
  var DWELL_MS = 160;            // gaze must rest on a word this long to trigger
  var CHAR_SWEEP_MS = 55;        // pace of the per-character bold sweep
  var SWEEP_MIN_MS = 200;        // minimum total sweep duration
  var NO_DATA_TIMEOUT_MS = 11000;// if WebGazer never reports gaze, assume failure
  var CALIB_CLICKS_PER_DOT = 5;  // clicks needed per calibration dot
  var SHOW_GAZE_CURSOR = true;   // faint dot showing the estimated gaze point
  var INTENSITY = 0.5;           // bold fraction; synced from storage

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var enabled = false;       // desired state (from storage)
  var starting = false;      // mid-startup guard
  var running = false;       // gaze loop active (post-calibration)
  var hasCalibrated = false; // skip the calibration overlay on tab-resume

  var origFetch = null;
  var sx = null, sy = null;          // smoothed gaze point
  var lastProcess = 0;
  var lastDataTime = 0;
  var watchdog = null;

  var pendingNode = null, pendingStart = -1, pendingWord = "", pendingSince = 0;
  var activeWrap = null, activeWordText = "";
  var sweepRAF = null;

  var cursorEl = null, toastEl = null, calibEl = null;

  // ---------------------------------------------------------------------------
  // Model redirect: send WebGazer's tfhub.dev FaceMesh downloads to local files
  // ---------------------------------------------------------------------------
  function mapModelUrl(url) {
    if (!url || url.indexOf("tfhub.dev") === -1) return null;
    var family = null;
    if (url.indexOf("face_landmarks_detection") !== -1) {
      family = "face_mesh"; // we vendored the default (non-attention) mesh
    } else if (url.indexOf("face_detection") !== -1) {
      family = "face_detection_short"; // default short-range detector
    }
    if (!family) return null;

    var file;
    if (url.indexOf("model.json") !== -1) {
      file = "model.json";
    } else {
      var m = url.match(/([\w.\-]+\.bin)/);
      file = m ? m[1] : "group1-shard1of1.bin";
    }
    try {
      return chrome.runtime.getURL("vendor/models/" + family + "/" + file);
    } catch (e) {
      return null;
    }
  }

  function installModelRedirect() {
    if (origFetch) return;
    origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!origFetch) return;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === "string" ? input : input && input.url;
        var local = mapModelUrl(url || "");
        if (local) return origFetch(local, init);
      } catch (e) {
        /* fall through to original */
      }
      return origFetch(input, init);
    };
  }

  function removeModelRedirect() {
    if (origFetch) {
      window.fetch = origFetch;
      origFetch = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Small UI: toast
  // ---------------------------------------------------------------------------
  function showToast(message, actions) {
    hideToast();
    toastEl = document.createElement("div");
    toastEl.id = "fr-gaze-toast";
    var text = document.createElement("span");
    text.textContent = message;
    toastEl.appendChild(text);
    if (actions && actions.length) {
      var box = document.createElement("div");
      box.className = "fr-gaze-toast-actions";
      actions.forEach(function (a) {
        var b = document.createElement("button");
        b.textContent = a.label;
        if (a.primary) b.className = "fr-gaze-primary";
        b.addEventListener("click", a.onClick);
        box.appendChild(b);
      });
      toastEl.appendChild(box);
    }
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function hideToast() {
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = null;
  }

  function flashToast(message, ms) {
    showToast(message);
    setTimeout(hideToast, ms || 3500);
  }

  // ---------------------------------------------------------------------------
  // Gaze cursor (feedback dot)
  // ---------------------------------------------------------------------------
  function ensureCursor() {
    if (!SHOW_GAZE_CURSOR) return;
    if (cursorEl) return;
    cursorEl = document.createElement("div");
    cursorEl.id = "fr-gaze-cursor";
    document.body.appendChild(cursorEl);
  }

  function moveCursor(x, y) {
    if (cursorEl) {
      cursorEl.style.left = x + "px";
      cursorEl.style.top = y + "px";
    }
  }

  function removeCursor() {
    if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
    cursorEl = null;
  }

  // ---------------------------------------------------------------------------
  // Word location + wrapping
  // ---------------------------------------------------------------------------
  function isSkipped(el) {
    while (el && el.nodeType === 1) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.isContentEditable) return true;
      if (el.id === "fr-gaze-calib" || el.id === "fr-gaze-toast") return true;
      if (el.id === "webgazerVideoContainer" || el.id === "webgazerVideoFeed") {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function caretNodeAt(x, y) {
    var range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
      if (range) return { node: range.startContainer, offset: range.startOffset };
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) return { node: pos.offsetNode, offset: pos.offset };
    }
    return null;
  }

  // Returns {node, start, end, word} for the word at (text node, offset).
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

    // Trim leading/trailing apostrophes/hyphens that aren't real letters.
    while (start < end && !HAS_LETTER.test(text.charAt(start))) start++;
    while (end > start && !HAS_LETTER.test(text.charAt(end - 1))) end--;

    var word = text.slice(start, end);
    if (!word || !HAS_LETTER.test(word)) return null;
    return { node: node, start: start, end: end, word: word };
  }

  function buildWordWrap(word) {
    var wrap = document.createElement("span");
    wrap.className = "adhd-gaze-word";
    var chars = [];
    for (var i = 0; i < word.length; i++) {
      var c = document.createElement("span");
      c.textContent = word.charAt(i);
      wrap.appendChild(c);
      chars.push(c);
    }
    wrap.__frChars = chars;
    return wrap;
  }

  function clearActiveWord() {
    if (sweepRAF) {
      cancelAnimationFrame(sweepRAF);
      sweepRAF = null;
    }
    if (activeWrap && activeWrap.parentNode) {
      var parent = activeWrap.parentNode;
      var textNode = document.createTextNode(activeWordText);
      parent.replaceChild(textNode, activeWrap);
      try {
        parent.normalize();
      } catch (e) {
        /* ignore */
      }
    }
    activeWrap = null;
    activeWordText = "";
  }

  function activateWord(info) {
    clearActiveWord();

    var node = info.node;
    if (!node || node.nodeType !== 3 || !node.parentNode) return;
    if (isSkipped(node.parentNode)) return;
    if (node.parentNode.classList &&
        node.parentNode.classList.contains("adhd-gaze-word")) {
      return; // already ours
    }

    var wordNode;
    try {
      node.splitText(info.end);          // tail after the word
      wordNode = node.splitText(info.start); // [start, end) -> the word
    } catch (e) {
      return; // node mutated underneath us
    }
    if (!wordNode || wordNode.nodeValue !== info.word) {
      // DOM shifted; bail without corrupting anything.
      try { node.parentNode && node.parentNode.normalize(); } catch (e2) {}
      return;
    }

    var wrap = buildWordWrap(info.word);
    wordNode.parentNode.replaceChild(wrap, wordNode);
    activeWrap = wrap;
    activeWordText = info.word;
    startSweep(wrap, info.word);
  }

  // ---------------------------------------------------------------------------
  // Per-character bold sweep (faux-bold via class -> no layout reflow)
  // ---------------------------------------------------------------------------
  function startSweep(wrap, word) {
    var chars = wrap.__frChars || [];
    var parts = bionicSplit(word, INTENSITY);
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
      if (t < 1 && wrap === activeWrap) {
        sweepRAF = requestAnimationFrame(step);
      } else {
        sweepRAF = null;
      }
    }
    sweepRAF = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // Gaze processing
  // ---------------------------------------------------------------------------
  function processPoint(x, y) {
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      return;
    }
    var el = document.elementFromPoint(x, y);
    if (!el) return;

    // Still resting on the active word -> keep it, reset any pending candidate.
    if (activeWrap && activeWrap.contains(el)) {
      pendingNode = null;
      pendingStart = -1;
      return;
    }
    if (isSkipped(el)) return;

    var caret = caretNodeAt(x, y);
    if (!caret) return;
    var info = wordAt(caret.node, caret.offset);
    if (!info) {
      pendingNode = null;
      pendingStart = -1;
      return;
    }

    var now = performance.now();
    if (info.node === pendingNode && info.start === pendingStart) {
      if (now - pendingSince >= DWELL_MS) {
        if (!activeWrap || activeWordText !== info.word) {
          activateWord(info);
        }
      }
    } else {
      pendingNode = info.node;
      pendingStart = info.start;
      pendingWord = info.word;
      pendingSince = now;
    }
  }

  function onGaze(data, clock) {
    if (!running) return;
    var now = performance.now();
    if (!data) return; // no face / low confidence this frame
    lastDataTime = now;

    var x = data.x, y = data.y;
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

    if (now - lastProcess < PROCESS_INTERVAL_MS) return;
    lastProcess = now;
    try {
      processPoint(sx, sy);
    } catch (e) {
      /* never let a single bad sample kill the loop */
    }
  }

  // ---------------------------------------------------------------------------
  // Calibration overlay
  // ---------------------------------------------------------------------------
  function runCalibration(onDone, onCancel) {
    calibEl = document.createElement("div");
    calibEl.id = "fr-gaze-calib";

    var card = document.createElement("div");
    card.className = "fr-gaze-calib-card";
    card.innerHTML =
      "<h2>Calibrate Gaze Reading</h2>" +
      "<p>Look directly at each red dot and click it. Keep your head fairly " +
      "still and your face well lit. Each dot needs " +
      CALIB_CLICKS_PER_DOT +
      " clicks.</p>" +
      "<p>Dots turn green as they learn your gaze.</p>";
    var progress = document.createElement("div");
    progress.className = "fr-gaze-progress";
    card.appendChild(progress);

    var cancelBtn = document.createElement("button");
    cancelBtn.className = "fr-gaze-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function () {
      teardownCalibration();
      onCancel && onCancel();
    });
    card.appendChild(cancelBtn);
    calibEl.appendChild(card);

    // 3x3 grid of dot positions (percent of viewport).
    var positions = [
      [10, 12], [50, 12], [90, 12],
      [10, 50], [50, 50], [90, 50],
      [10, 88], [50, 88], [90, 88]
    ];
    var totalNeeded = positions.length * CALIB_CLICKS_PER_DOT;
    var done = 0;
    var dotsDone = 0;

    positions.forEach(function (p) {
      var dot = document.createElement("div");
      dot.className = "fr-gaze-dot";
      dot.style.left = p[0] + "%";
      dot.style.top = p[1] + "%";
      var count = 0;
      var label = document.createElement("span");
      label.className = "fr-gaze-dot-count";
      label.textContent = String(CALIB_CLICKS_PER_DOT);
      dot.appendChild(label);

      dot.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (dot.classList.contains("fr-gaze-dot-done")) return;
        count++;
        done++;
        dot.setAttribute("data-progress", String(count));
        label.textContent = String(Math.max(0, CALIB_CLICKS_PER_DOT - count));

        // Pair this screen location with the current eye features.
        try {
          var r = dot.getBoundingClientRect();
          var cx = r.left + r.width / 2;
          var cy = r.top + r.height / 2;
          if (window.webgazer && window.webgazer.recordScreenPosition) {
            window.webgazer.recordScreenPosition(cx, cy, "click");
          }
        } catch (e) {
          /* ignore individual sample errors */
        }

        if (count >= CALIB_CLICKS_PER_DOT) {
          dot.classList.add("fr-gaze-dot-done");
          label.textContent = "";
          dotsDone++;
        }
        progress.textContent =
          "Calibrated " + done + " / " + totalNeeded + " points";

        if (dotsDone >= positions.length) {
          teardownCalibration();
          onDone && onDone();
        }
      });
      calibEl.appendChild(dot);
    });

    progress.textContent = "Calibrated 0 / " + totalNeeded + " points";
    document.body.appendChild(calibEl);
  }

  function teardownCalibration() {
    if (calibEl && calibEl.parentNode) calibEl.parentNode.removeChild(calibEl);
    calibEl = null;
  }

  // ---------------------------------------------------------------------------
  // WebGazer lifecycle
  // ---------------------------------------------------------------------------
  function configureWebgazer() {
    var wg = window.webgazer;
    // Hide all of WebGazer's own debug UI; we render our own minimal feedback.
    try { wg.params.showVideoPreview = false; } catch (e) {}
    try { wg.showVideo(false); } catch (e) {}
    try { wg.showFaceOverlay(false); } catch (e) {}
    try { wg.showFaceFeedbackBox(false); } catch (e) {}
    try { wg.showPredictionPoints(false); } catch (e) {}
    try { wg.applyKalmanFilter(true); } catch (e) {}
    try { wg.saveDataAcrossSessions(true); } catch (e) {}
    try { wg.setRegression("ridge"); } catch (e) {}
    wg.setGazeListener(onGaze);
  }

  function startWatchdog() {
    stopWatchdog();
    lastDataTime = performance.now();
    watchdog = setInterval(function () {
      if (!running) return;
      if (performance.now() - lastDataTime > NO_DATA_TIMEOUT_MS) {
        stopWatchdog();
        flashToast(
          "Gaze Reading: no face detected. Check your camera and lighting, " +
            "then re-enable.",
          6000
        );
        revertSetting();
      }
    }, 2000);
  }

  function stopWatchdog() {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
  }

  // Probe camera first so we get clean, explicit denial handling.
  function probeCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("getUserMedia unavailable"));
    }
    return navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(function (stream) {
        // Release immediately; WebGazer opens its own stream on begin().
        stream.getTracks().forEach(function (t) { t.stop(); });
        return true;
      });
  }

  function enterReadingLoop(announce) {
    running = true;
    starting = false;
    ensureCursor();
    startWatchdog();
    if (announce) {
      flashToast(
        "Gaze Reading is on. Read naturally; words emphasize as you look. " +
          "Open the popup to recalibrate or turn it off.",
        5000
      );
    }
  }

  // skipCalibration: reuse the persisted/in-memory model (e.g. tab resume).
  function startEngine(skipCalibration) {
    if (starting || running) return;
    if (!window.webgazer) {
      flashToast("Gaze Reading failed to load. Try reloading the page.", 5000);
      revertSetting();
      return;
    }
    starting = true;
    installModelRedirect();

    showToast("Gaze Reading (beta): starting camera...");

    probeCamera()
      .then(function () {
        showToast("Loading gaze model (local)...");
        configureWebgazer();
        return window.webgazer.begin();
      })
      .then(function () {
        hideToast();
        if (skipCalibration && hasCalibrated) {
          enterReadingLoop(false);
          return;
        }
        // Calibrate first; only enter the reading loop once it's complete.
        runCalibration(
          function onCalibrated() {
            hasCalibrated = true;
            enterReadingLoop(true);
          },
          function onCancelled() {
            starting = false;
            revertSetting();
          }
        );
      })
      .catch(function (err) {
        starting = false;
        var msg = "Gaze Reading: camera unavailable or denied.";
        if (err && /denied|NotAllowed|Permission/i.test(String(err.name || err))) {
          msg = "Gaze Reading: camera permission was denied for this site.";
        }
        console.warn("[Focus Reader] Gaze start failed:", err);
        flashToast(msg, 6000);
        revertSetting();
      });
  }

  function start() {
    startEngine(false);
  }

  function stop() {
    running = false;
    starting = false;
    stopWatchdog();
    teardownCalibration();
    clearActiveWord();
    removeCursor();
    hideToast();
    sx = sy = null;
    pendingNode = null;
    pendingStart = -1;

    try {
      if (window.webgazer) {
        window.webgazer.clearGazeListener();
        window.webgazer.end();
      }
    } catch (e) {
      /* ignore */
    }
    // Belt-and-braces cleanup of any leftover WebGazer DOM / camera.
    ["webgazerVideoContainer", "webgazerGazeDot", "webgazerFaceOverlay",
     "webgazerFaceFeedbackBox", "webgazerVideoFeed"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    removeModelRedirect();
  }

  function recalibrate() {
    if (!window.webgazer) return;
    running = false;
    clearActiveWord();
    removeCursor();
    runCalibration(
      function () {
        hasCalibrated = true;
        running = true;
        ensureCursor();
        startWatchdog();
        flashToast("Recalibrated. Gaze Reading is on.", 3000);
      },
      function () {
        // Cancelled recalibration -> just resume with the prior model.
        running = true;
        ensureCursor();
        startWatchdog();
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Settings wiring
  // ---------------------------------------------------------------------------
  function revertSetting() {
    try {
      chrome.storage.sync.set({ gazeEnabled: false });
    } catch (e) {
      /* ignore */
    }
    enabled = false;
    // stop() will also run via the storage change handler, but call directly
    // in case the write is a no-op (already false).
    stop();
  }

  function applyEnabled(next) {
    enabled = !!next;
    if (enabled) {
      start();
    } else {
      stop();
    }
  }

  // We deliberately do NOT auto-start gaze (and thus the camera) just because
  // the stored toggle is on. Auto-starting on every page load would surprise the
  // user with a camera prompt on each site, and reacting to the sync-storage
  // change would start the camera in *every* open tab at once. Instead, start is
  // driven by an explicit message to the *active* tab from the popup. We only
  // read intensity here (it tunes the sweep) and let storage drive *stopping*.
  function loadSettings() {
    try {
      chrome.storage.sync.get({ intensity: 0.5 }, function (s) {
        if (s && !chrome.runtime.lastError && typeof s.intensity === "number") {
          INTENSITY = s.intensity;
        }
      });
    } catch (e) {
      /* storage unavailable */
    }
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") return;
      if (changes.intensity && typeof changes.intensity.newValue === "number") {
        INTENSITY = changes.intensity.newValue;
      }
      // Turning the toggle off anywhere stops this tab; turning it on does not
      // auto-start (that is an explicit per-tab action via message).
      if (changes.gazeEnabled && changes.gazeEnabled.newValue === false) {
        applyEnabled(false);
      }
    });
  } catch (e) {
    /* ignore */
  }

  // Start / stop / recalibrate / status requests from the popup (active tab).
  try {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg) return;
      if (msg.type === "gazeStart") {
        applyEnabled(true);
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "gazeStop") {
        applyEnabled(false);
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "gazeRecalibrate") {
        if (running || starting) recalibrate();
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "gazeStatus") {
        sendResponse && sendResponse({ running: running, starting: starting });
      }
      return true;
    });
  } catch (e) {
    /* ignore */
  }

  // Stop the camera entirely when the tab is hidden (privacy + performance);
  // when it becomes visible again, resume without forcing recalibration since
  // WebGazer persists its trained model across sessions.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && (running || starting)) {
      stop();
    } else if (!document.hidden && enabled && !running && !starting) {
      startEngine(true);
    }
  });

  window.addEventListener("pagehide", function () {
    if (running || starting) stop();
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  if (document.body) {
    loadSettings();
  } else {
    document.addEventListener("DOMContentLoaded", loadSettings, { once: true });
  }
})();
