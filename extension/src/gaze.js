// Focus Reader - Gaze Reading (beta), host-page entry.
// This thin layer lives on every http(s) page and just wires the popup and
// page lifecycle to FocusReaderGazeHost, which owns the camera iframe and the
// bolding engine. The camera + WebGazer themselves run inside the extension's
// camera.html iframe (see camera.js) so the permission prompt is reliable and
// persists across sites.
(function (global) {
  "use strict";

  // Only run in the top frame and only once.
  if (window.top !== window) return;
  if (window.__frGazeLoaded) return;
  window.__frGazeLoaded = true;

  var Host = global.FocusReaderGazeHost;
  if (!Host) return; // gazeHost.js failed to load; bail safely.

  var enabled = false;  // desired state for this tab
  var intensity = 0.5;

  // Tell content.js to pause/resume the static page-wide bolding while gaze
  // reading owns the text styling.
  function emitGazeState(on) {
    window.__frGazeRunning = !!on;
    try {
      window.dispatchEvent(
        new CustomEvent("fr-gaze-change", { detail: { running: !!on } })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function onState(state) {
    if (state === "reading") {
      emitGazeState(true);
    } else if (state === "stopped" || state === "error") {
      emitGazeState(false);
      if (state === "error") {
        enabled = false;
        try { chrome.storage.sync.set({ gazeEnabled: false }); } catch (e) {}
      }
    }
  }

  function startGaze(skipCalibration) {
    enabled = true;
    Host.start({
      intensity: intensity,
      skipCalibration: !!skipCalibration,
      onState: onState
    });
  }

  function stopGaze() {
    enabled = false;
    Host.stop();
    emitGazeState(false);
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  try {
    chrome.storage.sync.get({ intensity: 0.5 }, function (s) {
      if (s && !chrome.runtime.lastError && typeof s.intensity === "number") {
        intensity = s.intensity;
        Host.setIntensity(intensity);
      }
    });
  } catch (e) {
    /* storage unavailable */
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") return;
      if (changes.intensity && typeof changes.intensity.newValue === "number") {
        intensity = changes.intensity.newValue;
        Host.setIntensity(intensity);
      }
      // Turning the toggle off anywhere stops this tab; turning it on does not
      // auto-start (that is an explicit per-tab action via the popup message).
      if (changes.gazeEnabled && changes.gazeEnabled.newValue === false) {
        stopGaze();
      }
    });
  } catch (e) {
    /* ignore */
  }

  // ---------------------------------------------------------------------------
  // Popup messages (active tab)
  // ---------------------------------------------------------------------------
  try {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg) return;
      if (msg.type === "gazeStart") {
        startGaze(false);
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "gazeStop") {
        stopGaze();
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "gazeRecalibrate") {
        if (Host.isActive()) Host.recalibrate();
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "gazeStatus") {
        sendResponse && sendResponse({
          running: Host.isRunning(),
          starting: Host.isActive() && !Host.isRunning()
        });
      }
      return true;
    });
  } catch (e) {
    /* ignore */
  }

  // Stop the camera when the tab is hidden (privacy + performance); resume on
  // return without forcing recalibration (WebGazer persists its model).
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && Host.isActive()) {
      Host.stop();
      emitGazeState(false);
    } else if (!document.hidden && enabled && !Host.isActive()) {
      startGaze(true);
    }
  });

  window.addEventListener("pagehide", function () {
    if (Host.isActive()) Host.stop();
  });
})(typeof window !== "undefined" ? window : globalThis);
