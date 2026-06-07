// Focus Reader popup / popover logic.
(function () {
  "use strict";

  var store = window.FocusReaderStore;

  // Boldness levels for the segmented toggle (intensity = bold fraction).
  var LEVELS = [
    { key: "Light", v: 0.4 },
    { key: "Medium", v: 0.5 },
    { key: "Heavy", v: 0.6 }
  ];

  var el = {
    startBtn: document.getElementById("startBtn"),
    primaryLabel: document.getElementById("primaryLabel"),
    primaryIcon: document.getElementById("primaryIcon"),
    statusDot: document.getElementById("statusDot"),
    boldnessSeg: document.getElementById("boldnessSeg"),
    boldnessIndicator: document.getElementById("boldnessIndicator"),
    gazeToggle: document.getElementById("gazeToggle"),
    gazeNote: document.getElementById("gazeNote"),
    gazeRecalBtn: document.getElementById("gazeRecalBtn"),
    dropzone: document.getElementById("dropzone"),
    dropzoneText: document.getElementById("dropzoneText"),
    fileInput: document.getElementById("fileInput"),
    openReaderBtn: document.getElementById("openReaderBtn")
  };

  var segButtons = el.boldnessSeg
    ? el.boldnessSeg.querySelectorAll(".fr-seg-btn")
    : [];

  var state = {
    enabled: true,
    intensity: 0.5,
    disabledSites: [],
    gazeEnabled: false
  };
  var currentHost = "";
  var currentTabHttp = false;
  var selectedFile = null;

  // ---------------------------------------------------------------------------
  function levelIndexFor(intensity) {
    var best = 0, bestDiff = Infinity;
    for (var i = 0; i < LEVELS.length; i++) {
      var diff = Math.abs(LEVELS[i].v - intensity);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return best;
  }

  function renderBoldness() {
    var idx = levelIndexFor(state.intensity);
    if (el.boldnessIndicator) {
      el.boldnessIndicator.style.transform = "translateX(" + idx * 100 + "%)";
    }
    for (var i = 0; i < segButtons.length; i++) {
      segButtons[i].classList.toggle("is-active", i === idx);
    }
  }

  function isActiveHere() {
    return (
      !!state.enabled &&
      !!currentHost &&
      state.disabledSites.indexOf(currentHost) === -1
    );
  }

  function renderStart() {
    var active = isActiveHere();
    el.primaryLabel.textContent = active ? "Stop" : "Start";
    el.primaryIcon.innerHTML = active ? "&#10073;&#10073;" : "&#9654;";
    el.startBtn.classList.toggle("is-on", active);
    el.statusDot.classList.toggle("on", active);
    el.startBtn.disabled = !currentHost || !currentTabHttp;
  }

  function renderGaze() {
    var on = !!state.gazeEnabled;
    el.gazeToggle.setAttribute("aria-checked", on ? "true" : "false");
    el.gazeToggle.classList.toggle("is-on", on);
    el.gazeToggle.disabled = !currentTabHttp;
    el.gazeRecalBtn.hidden = !on || !currentTabHttp;
  }

  function renderAll() {
    renderStart();
    renderBoldness();
    renderGaze();
  }

  function save(partial) {
    Object.assign(state, partial);
    try {
      chrome.storage.sync.set(partial);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  function getActiveTab(cb) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        cb(tabs && tabs[0]);
      });
    } catch (e) {
      cb(null);
    }
  }

  function sendToActiveTab(message, cb) {
    getActiveTab(function (tab) {
      if (!tab || tab.id == null) {
        cb && cb(false);
        return;
      }
      try {
        chrome.tabs.sendMessage(tab.id, message, function (resp) {
          cb && cb(!chrome.runtime.lastError, resp);
        });
      } catch (e) {
        cb && cb(false);
      }
    });
  }

  function setGazeNote(text) {
    if (!el.gazeNote) return;
    if (text) {
      el.gazeNote.textContent = text;
      el.gazeNote.hidden = false;
    } else {
      el.gazeNote.textContent = "";
      el.gazeNote.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Start / Stop (per-site static bionic bolding)
  el.startBtn.addEventListener("click", function () {
    if (!currentHost) return;
    var list = state.disabledSites.slice();
    var idx = list.indexOf(currentHost);

    if (isActiveHere()) {
      if (idx === -1) list.push(currentHost); // stop on this site
      save({ disabledSites: list });
    } else {
      if (idx !== -1) list.splice(idx, 1); // un-pause this site
      save({ enabled: true, disabledSites: list });
    }
    renderStart();
  });

  // Bold intensity segmented toggle
  for (var s = 0; s < segButtons.length; s++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        var lvl = parseInt(btn.getAttribute("data-level"), 10) || 0;
        state.intensity = LEVELS[lvl].v;
        save({ intensity: state.intensity });
        renderBoldness();
      });
    })(segButtons[s]);
  }

  // Gaze reading toggle (bouncy). Press feedback + ripple, then start/stop on
  // the active tab (which triggers the camera permission request on the page).
  function setPressed(on) {
    el.gazeToggle.classList.toggle("is-pressed", on);
  }
  el.gazeToggle.addEventListener("mousedown", function () { setPressed(true); });
  el.gazeToggle.addEventListener("mouseup", function () { setPressed(false); });
  el.gazeToggle.addEventListener("mouseleave", function () { setPressed(false); });

  el.gazeToggle.addEventListener("click", function () {
    if (el.gazeToggle.disabled) return;
    var next = !state.gazeEnabled;
    state.gazeEnabled = next;
    save({ gazeEnabled: next });
    renderGaze();
    setGazeNote("");

    if (next) {
      // Replay the ripple animation.
      el.gazeToggle.classList.remove("fr-rippling");
      // force reflow so the animation can restart
      void el.gazeToggle.offsetWidth;
      el.gazeToggle.classList.add("fr-rippling");
    }

    sendToActiveTab({ type: next ? "gazeStart" : "gazeStop" }, function (ok) {
      if (!ok) {
        setGazeNote("Reload this tab, then try again");
      }
    });
  });

  el.gazeRecalBtn.addEventListener("click", function () {
    sendToActiveTab({ type: "gazeRecalibrate" }, function () {
      window.close();
    });
  });

  // ---------------------------------------------------------------------------
  // File import
  function acceptFile(file) {
    if (!file) return;
    selectedFile = file;
    el.dropzoneText.textContent = file.name;
    el.openReaderBtn.disabled = false;
  }

  el.fileInput.addEventListener("change", function () {
    acceptFile(el.fileInput.files && el.fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    el.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      el.dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    el.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove("dragover");
    });
  });
  el.dropzone.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    acceptFile(f);
  });

  function openReaderTab() {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("reader.html") });
    } catch (e) {
      window.open(chrome.runtime.getURL("reader.html"), "_blank");
    }
    window.close();
  }

  el.openReaderBtn.addEventListener("click", function () {
    if (!selectedFile || !store) {
      openReaderTab();
      return;
    }
    var record = {
      name: selectedFile.name,
      type: selectedFile.type || "",
      size: selectedFile.size,
      blob: selectedFile,
      intensity: state.intensity,
      savedAt: Date.now()
    };
    el.openReaderBtn.disabled = true;
    el.openReaderBtn.textContent = "Opening...";
    store
      .savePendingFile(record)
      .then(openReaderTab)
      .catch(function () {
        el.openReaderBtn.disabled = false;
        el.openReaderBtn.textContent = "Open in Reader";
        el.dropzoneText.textContent = "Could not read file - try again";
      });
  });

  // ---------------------------------------------------------------------------
  function init() {
    chrome.storage.sync.get(
      { enabled: true, intensity: 0.5, disabledSites: [], gazeEnabled: false },
      function (stored) {
        if (stored && !chrome.runtime.lastError) {
          state.enabled = stored.enabled;
          state.intensity = stored.intensity;
          state.disabledSites = stored.disabledSites || [];
          state.gazeEnabled = !!stored.gazeEnabled;
        }
        getActiveTab(function (tab) {
          var url = tab && tab.url;
          if (url) {
            try {
              var u = new URL(url);
              currentHost = u.hostname;
              currentTabHttp = u.protocol === "http:" || u.protocol === "https:";
            } catch (e) {
              currentHost = "";
            }
          }
          renderAll();

          // Reflect the actual gaze state of this tab.
          if (tab && tab.id != null && currentTabHttp) {
            try {
              chrome.tabs.sendMessage(
                tab.id,
                { type: "gazeStatus" },
                function (resp) {
                  if (chrome.runtime.lastError) return;
                  if (resp) {
                    state.gazeEnabled = !!(resp.running || resp.starting);
                    renderGaze();
                  }
                }
              );
            } catch (e) {
              /* ignore */
            }
          }
        });
      }
    );
  }

  init();
})();
