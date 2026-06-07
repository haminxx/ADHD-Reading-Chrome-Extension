// Focus Reader - Camera frame (runs inside camera.html, the extension-origin
// iframe injected over the page). This is the ONLY place that touches the
// webcam and WebGazer. Because the iframe is the extension's own origin, the
// camera permission prompt is for the extension, appears once, and persists
// across every site (the previous content-script getUserMedia approach was
// silently blocked by many sites' Permissions-Policy).
//
// It talks to the parent (the content script or the reader page) purely via
// postMessage: it receives start/stop/recalibrate, and it streams gaze (x, y)
// plus status. The parent maps coordinates to words (see gazeEngine.js).
//
// The iframe is full-viewport and aligned at (0,0), so WebGazer's predicted
// coordinates and our calibration clicks are already in the parent's viewport
// space - no remapping needed. Everything runs locally; the FaceMesh model is
// redirected from tfhub.dev to vendored files, so no network calls at runtime.
(function () {
  "use strict";

  var TAG = "fr-cam";
  var CALIB_CLICKS_PER_DOT = 3;
  var NO_DATA_TIMEOUT_MS = 11000;
  var CALIBRATED_FLAG = "fr-gaze-calibrated";

  var origFetch = null;
  var running = false;       // streaming gaze to parent
  var starting = false;      // mid-startup guard
  var lastDataTime = 0;
  var watchdog = null;

  var calibEl = document.getElementById("cam-calib");
  var progressEl = document.getElementById("cam-progress");
  var cancelBtn = document.getElementById("cam-cancel");

  // ---------------------------------------------------------------------------
  // Messaging to the parent
  // ---------------------------------------------------------------------------
  function post(msg) {
    msg.tag = TAG;
    try {
      parent.postMessage(msg, "*");
    } catch (e) {
      /* ignore */
    }
  }
  function status(phase, text) { post({ type: "status", phase: phase, text: text }); }

  // ---------------------------------------------------------------------------
  // Model redirect: tfhub.dev FaceMesh/detector downloads -> local vendored files
  // ---------------------------------------------------------------------------
  function mapModelUrl(url) {
    if (!url || url.indexOf("tfhub.dev") === -1) return null;
    var family = null;
    if (url.indexOf("face_landmarks_detection") !== -1) {
      family = "face_mesh";
    } else if (url.indexOf("face_detection") !== -1) {
      family = "face_detection_short";
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
        /* fall through */
      }
      return origFetch(input, init);
    };
  }

  // ---------------------------------------------------------------------------
  // Camera + WebGazer
  // ---------------------------------------------------------------------------
  function probeCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("getUserMedia unavailable"));
    }
    return navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then(function (stream) {
        // Release immediately; WebGazer opens its own stream on begin().
        stream.getTracks().forEach(function (t) { t.stop(); });
        return true;
      });
  }

  function onGaze(data) {
    if (!running || !data) return;
    var x = data.x, y = data.y;
    if (typeof x !== "number" || typeof y !== "number") return;
    if (!isFinite(x) || !isFinite(y)) return;
    lastDataTime = Date.now();
    post({ type: "gaze", x: x, y: y });
  }

  function configureWebgazer() {
    var wg = window.webgazer;
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
    lastDataTime = Date.now();
    watchdog = setInterval(function () {
      if (!running) return;
      if (Date.now() - lastDataTime > NO_DATA_TIMEOUT_MS) {
        stopWatchdog();
        post({ type: "nodata" });
      }
    }, 2000);
  }

  function stopWatchdog() {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Calibration overlay (lives in this iframe; clicks pair eye features with
  // known screen positions). Coordinates equal the parent viewport's.
  // ---------------------------------------------------------------------------
  var POSITIONS = [
    [10, 12], [50, 12], [90, 12],
    [10, 50], [50, 50], [90, 50],
    [10, 88], [50, 88], [90, 88]
  ];

  function clearDots() {
    var dots = calibEl.querySelectorAll(".cam-dot");
    for (var i = 0; i < dots.length; i++) dots[i].remove();
  }

  function runCalibration(onDone) {
    clearDots();
    calibEl.hidden = false;
    status("calibrating");

    var totalNeeded = POSITIONS.length * CALIB_CLICKS_PER_DOT;
    var done = 0;
    var dotsDone = 0;

    function updateProgress() {
      progressEl.textContent =
        "Calibrated " + done + " / " + totalNeeded + " points";
    }

    POSITIONS.forEach(function (p) {
      var dot = document.createElement("div");
      dot.className = "cam-dot";
      dot.style.left = p[0] + "%";
      dot.style.top = p[1] + "%";
      var count = 0;

      var label = document.createElement("span");
      label.className = "cam-dot-count";
      label.textContent = String(CALIB_CLICKS_PER_DOT);
      dot.appendChild(label);

      dot.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (dot.classList.contains("cam-dot-done")) return;
        count++;
        done++;
        dot.setAttribute("data-progress", String(count));
        label.textContent = String(Math.max(0, CALIB_CLICKS_PER_DOT - count));

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
          dot.classList.add("cam-dot-done");
          label.textContent = "";
          dotsDone++;
        }
        updateProgress();
        post({ type: "calib-progress", done: done, total: totalNeeded });

        if (dotsDone >= POSITIONS.length) {
          calibEl.hidden = true;
          clearDots();
          try { localStorage.setItem(CALIBRATED_FLAG, "1"); } catch (e) {}
          onDone();
        }
      });
      calibEl.appendChild(dot);
    });

    updateProgress();
  }

  function hasCalibratedBefore() {
    try { return localStorage.getItem(CALIBRATED_FLAG) === "1"; } catch (e) {}
    return false;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  function enterReading() {
    running = true;
    starting = false;
    startWatchdog();
    post({ type: "reading" });
  }

  function startEngine(skipCalibration) {
    if (starting || running) return;
    if (!window.webgazer) {
      post({ type: "error", name: "WebgazerMissing", message: "webgazer-undefined" });
      return;
    }
    starting = true;
    installModelRedirect();

    status("requesting-camera");
    probeCamera()
      .then(function () {
        status("loading-model");
        configureWebgazer();
        return window.webgazer.begin();
      })
      .then(function () {
        if (skipCalibration && hasCalibratedBefore()) {
          enterReading();
          return;
        }
        runCalibration(function () {
          enterReading();
        });
      })
      .catch(function (err) {
        starting = false;
        post({
          type: "error",
          name: String((err && err.name) || "Error"),
          message: String((err && err.message) || err)
        });
      });
  }

  function recalibrate() {
    if (!window.webgazer) return;
    running = false;
    stopWatchdog();
    runCalibration(function () {
      enterReading();
    });
  }

  function stopEngine() {
    running = false;
    starting = false;
    stopWatchdog();
    calibEl.hidden = true;
    clearDots();
    try {
      if (window.webgazer) {
        window.webgazer.clearGazeListener();
        window.webgazer.end();
      }
    } catch (e) {
      /* ignore */
    }
    ["webgazerVideoContainer", "webgazerGazeDot", "webgazerFaceOverlay",
     "webgazerFaceFeedbackBox", "webgazerVideoFeed"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
  }

  cancelBtn.addEventListener("click", function () {
    stopEngine();
    post({ type: "cancelled" });
  });

  window.addEventListener("message", function (ev) {
    // Only accept commands from our embedder.
    if (ev.source !== parent) return;
    var msg = ev.data;
    if (!msg || msg.tag !== TAG || !msg.cmd) return;

    if (msg.cmd === "start") {
      startEngine(!!msg.skipCalibration);
    } else if (msg.cmd === "recalibrate") {
      recalibrate();
    } else if (msg.cmd === "stop") {
      stopEngine();
    }
  });

  window.addEventListener("pagehide", stopEngine);

  // Tell the parent we're ready to receive commands.
  post({ type: "ready" });
})();
