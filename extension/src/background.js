// Focus Reader background service worker.
// - Seeds default settings on install.
// - Keeps the toolbar badge in sync with the global on/off state.

var DEFAULTS = {
  enabled: true,
  intensity: 0.5,
  disabledSites: [],
  gazeEnabled: false
};

function updateBadge(enabled) {
  try {
    chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
    chrome.action.setBadgeBackgroundColor({
      color: enabled ? "#3b82f6" : "#9ca3af"
    });
  } catch (e) {
    /* action API may be unavailable in some contexts */
  }
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(DEFAULTS, function (current) {
    // Only write keys that are missing so we never clobber user choices.
    var toSet = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      if (current[key] === undefined) {
        toSet[key] = DEFAULTS[key];
      }
    });
    if (Object.keys(toSet).length) {
      chrome.storage.sync.set(toSet);
    }
    updateBadge(current.enabled !== undefined ? current.enabled : DEFAULTS.enabled);
  });
});

chrome.runtime.onStartup.addListener(function () {
  chrome.storage.sync.get({ enabled: true }, function (s) {
    updateBadge(s.enabled);
  });
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === "sync" && changes.enabled) {
    updateBadge(changes.enabled.newValue);
  }
});

// Lets any extension page (e.g. the popup) ask us to open the reader tab.
// Gaze/WebGazer no longer needs a background injection: the camera runs inside
// the extension-origin camera.html iframe (see camera.js).
chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg && msg.type === "openReader") {
    chrome.tabs.create({ url: chrome.runtime.getURL("reader.html") }, function (tab) {
      sendResponse({ ok: true, tabId: tab && tab.id });
    });
    return true; // keep the message channel open for the async response
  }
});
