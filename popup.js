// Focus Reader popup / popover logic.
(function () {
  "use strict";

  var bionicSplit =
    (window.FocusReaderBionic || {}).bionicSplit ||
    function (w) {
      var n = Math.ceil(w.length / 2);
      return [w.slice(0, n), w.slice(n)];
    };
  var store = window.FocusReaderStore;

  var el = {
    startBtn: document.getElementById("startBtn"),
    primaryLabel: document.getElementById("primaryLabel"),
    primaryIcon: document.getElementById("primaryIcon"),
    siteNote: document.getElementById("siteNote"),
    statusDot: document.getElementById("statusDot"),
    intensity: document.getElementById("intensity"),
    intensityValue: document.getElementById("intensityValue"),
    preview: document.getElementById("preview"),
    dropzone: document.getElementById("dropzone"),
    dropzoneText: document.getElementById("dropzoneText"),
    fileInput: document.getElementById("fileInput"),
    openReaderBtn: document.getElementById("openReaderBtn"),
    openBlankReaderBtn: document.getElementById("openBlankReaderBtn")
  };

  var PREVIEW_TEXT =
    "Bionic reading helps people focus their attention on text.";

  var state = { enabled: true, intensity: 0.5, disabledSites: [] };
  var currentHost = "";
  var currentTabHttp = false;
  var selectedFile = null;

  // ---------------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderPreview() {
    var tokens = PREVIEW_TEXT.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) || [];
    var html = "";
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (/[\p{L}\p{N}]/u.test(tok)) {
        var parts = bionicSplit(tok, state.intensity);
        html += "<b>" + escapeHtml(parts[0]) + "</b>" + escapeHtml(parts[1]);
      } else {
        html += escapeHtml(tok);
      }
    }
    el.preview.innerHTML = html;
  }

  function isActiveHere() {
    return (
      !!state.enabled &&
      !!currentHost &&
      state.disabledSites.indexOf(currentHost) === -1
    );
  }

  function renderControls() {
    var active = isActiveHere();

    el.primaryLabel.textContent = active ? "Stop Reading" : "Start Reading";
    el.primaryIcon.innerHTML = active ? "&#10073;&#10073;" : "&#9654;";
    el.startBtn.classList.toggle("is-on", active);
    el.statusDot.classList.toggle("on", active);

    if (!currentHost || !currentTabHttp) {
      el.startBtn.disabled = true;
      el.siteNote.textContent = "Open a normal web page to use this here";
    } else {
      el.startBtn.disabled = false;
      el.siteNote.textContent = (active ? "active on " : "paused on ") + currentHost;
    }

    el.intensity.value = String(state.intensity);
    el.intensityValue.textContent = Math.round(state.intensity * 100) + "%";
    renderPreview();
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

  // ---------------------------------------------------------------------------
  // Start / Stop
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
    renderControls();
  });

  // Intensity
  el.intensity.addEventListener("input", function () {
    state.intensity = parseFloat(el.intensity.value);
    el.intensityValue.textContent = Math.round(state.intensity * 100) + "%";
    renderPreview();
  });
  el.intensity.addEventListener("change", function () {
    save({ intensity: parseFloat(el.intensity.value) });
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
      blob: selectedFile, // Blobs are structured-cloneable into IndexedDB
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

  el.openBlankReaderBtn.addEventListener("click", openReaderTab);

  // ---------------------------------------------------------------------------
  function init() {
    chrome.storage.sync.get(
      { enabled: true, intensity: 0.5, disabledSites: [] },
      function (stored) {
        if (stored && !chrome.runtime.lastError) {
          state.enabled = stored.enabled;
          state.intensity = stored.intensity;
          state.disabledSites = stored.disabledSites || [];
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
          renderControls();
        });
      }
    );
  }

  init();
})();
