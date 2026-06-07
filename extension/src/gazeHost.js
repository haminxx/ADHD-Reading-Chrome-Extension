// Focus Reader - Gaze Host (parent-side controller).
// Embeds the extension-origin camera iframe (camera.html) as a full-viewport
// transparent overlay, relays start/stop/recalibrate to it, receives the gaze
// stream, and feeds it into the shared gaze engine (gazeEngine.js) which does
// the word bolding in THIS document.
//
// Used by both the host-page content script (gaze.js) and the reader page
// (reader.js), so the camera/eye-tracking code lives in exactly one place.
// Exposes a single global: window.FocusReaderGazeHost.
(function (global) {
  "use strict";

  var TAG = "fr-cam";

  var engine = null;
  var iframe = null;
  var onState = null;
  var intensity = 0.5;
  var running = false;    // gaze streaming + bolding active
  var starting = false;   // mid-startup (camera/calibration) guard
  var skipCalibration = false;
  var toastEl = null;
  var msgHandler = null;

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  function showToast(message) {
    hideToast();
    toastEl = document.createElement("div");
    toastEl.id = "fr-gaze-toast";
    var span = document.createElement("span");
    span.textContent = message;
    toastEl.appendChild(span);
    document.body.appendChild(toastEl);
  }

  function hideToast() {
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = null;
  }

  function flashToast(message, ms) {
    showToast(message);
    setTimeout(hideToast, ms || 4000);
  }

  function emit(state, message) {
    if (typeof onState === "function") {
      try { onState(state, message); } catch (e) { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Iframe
  // ---------------------------------------------------------------------------
  function createIframe() {
    iframe = document.createElement("iframe");
    iframe.id = "fr-cam-frame";
    iframe.setAttribute("allow", "camera");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("title", "Focus Reader gaze camera");
    try {
      iframe.src = chrome.runtime.getURL("camera.html");
    } catch (e) {
      iframe.src = "camera.html";
    }
    var s = iframe.style;
    s.position = "fixed";
    s.left = "0";
    s.top = "0";
    s.width = "100%";
    s.height = "100%";
    s.border = "0";
    s.margin = "0";
    s.padding = "0";
    s.background = "transparent";
    s.colorScheme = "normal";
    s.zIndex = "2147483647";
    s.pointerEvents = "none"; // becomes "auto" only while calibrating
    (document.body || document.documentElement).appendChild(iframe);
  }

  function setCalibratingPointer(on) {
    if (iframe) iframe.style.pointerEvents = on ? "auto" : "none";
  }

  function removeIframe() {
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = null;
  }

  function sendToFrame(cmd, extra) {
    if (!iframe || !iframe.contentWindow) return;
    var msg = { tag: TAG, cmd: cmd };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
      }
    }
    try {
      iframe.contentWindow.postMessage(msg, "*");
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Friendly error text
  // ---------------------------------------------------------------------------
  function describeError(name) {
    name = String(name || "");
    if (/NotAllowed|Permission|denied|SecurityError/i.test(name)) {
      return "Gaze Reading: camera permission was denied. Allow the camera " +
        "for this extension, then turn it on again.";
    }
    if (/NotFound|DevicesNotFound|OverconstrainedError/i.test(name)) {
      return "Gaze Reading: no camera was found on this device.";
    }
    if (/NotReadable|TrackStart/i.test(name)) {
      return "Gaze Reading: the camera is already in use by another app.";
    }
    if (/Webgazer|undefined/i.test(name)) {
      return "Gaze Reading failed to load. Reload the page and try again.";
    }
    return "Gaze Reading: this page blocks the camera. Try another page or " +
      "open a document in the reader.";
  }

  // ---------------------------------------------------------------------------
  // Message handling from the camera iframe
  // ---------------------------------------------------------------------------
  function handleMessage(ev) {
    if (!iframe || ev.source !== iframe.contentWindow) return;
    var msg = ev.data;
    if (!msg || msg.tag !== TAG || !msg.type) return;

    if (msg.type === "ready") {
      sendToFrame("start", { skipCalibration: skipCalibration });
      return;
    }

    if (msg.type === "status") {
      if (msg.phase === "requesting-camera") {
        showToast("Gaze Reading: allow camera access to continue...");
        emit("requesting-camera");
      } else if (msg.phase === "loading-model") {
        showToast("Gaze Reading: loading model (local)...");
        emit("loading");
      } else if (msg.phase === "calibrating") {
        setCalibratingPointer(true);
        showToast("Calibrate: look at each dot and click it.");
        emit("calibrating");
      }
      return;
    }

    if (msg.type === "calib-progress") {
      return; // overlay in the iframe already shows the count
    }

    if (msg.type === "reading") {
      setCalibratingPointer(false);
      running = true;
      starting = false;
      if (!engine) engine = global.FocusReaderGazeEngine.create({ intensity: intensity });
      engine.setIntensity(intensity);
      engine.start();
      hideToast();
      flashToast("Gaze Reading is on. Words bold where you look.", 3500);
      emit("reading");
      return;
    }

    if (msg.type === "gaze") {
      if (running && engine) engine.feed(msg.x, msg.y);
      return;
    }

    if (msg.type === "nodata") {
      flashToast(
        "Gaze Reading: no face detected. Check your camera and lighting.",
        6000
      );
      stop();
      emit("error", "no-face");
      return;
    }

    if (msg.type === "error") {
      flashToast(describeError(msg.name || msg.message), 6500);
      stop();
      emit("error", msg.name || msg.message);
      return;
    }

    if (msg.type === "cancelled") {
      stop();
      emit("stopped");
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function start(opts) {
    opts = opts || {};
    if (running || starting) return;
    if (typeof opts.intensity === "number") intensity = opts.intensity;
    onState = opts.onState || onState;
    skipCalibration = !!opts.skipCalibration;

    starting = true;
    if (!msgHandler) {
      msgHandler = handleMessage;
      global.addEventListener("message", msgHandler);
    }
    if (!engine) engine = global.FocusReaderGazeEngine.create({ intensity: intensity });
    engine.setIntensity(intensity);

    showToast("Gaze Reading (beta): starting...");
    emit("loading");
    createIframe(); // posts "ready" -> we send "start"
  }

  function stop() {
    var wasActive = running || starting;
    running = false;
    starting = false;
    sendToFrame("stop");
    removeIframe();
    if (engine) engine.clear();
    hideToast();
    if (msgHandler) {
      global.removeEventListener("message", msgHandler);
      msgHandler = null;
    }
    if (wasActive) emit("stopped");
  }

  function recalibrate() {
    if (!iframe) return;
    if (engine) engine.clear();
    sendToFrame("recalibrate");
  }

  function setIntensity(v) {
    if (typeof v === "number" && isFinite(v)) {
      intensity = v;
      if (engine) engine.setIntensity(v);
    }
  }

  global.FocusReaderGazeHost = {
    start: start,
    stop: stop,
    recalibrate: recalibrate,
    setIntensity: setIntensity,
    isRunning: function () { return running; },
    isActive: function () { return running || starting; }
  };
})(typeof window !== "undefined" ? window : globalThis);
