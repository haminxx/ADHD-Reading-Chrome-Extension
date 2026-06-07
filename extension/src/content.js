// Focus Reader content script.
// Walks the page, wraps the leading portion of each word in <b class="adhd-bold">,
// watches for dynamically added content, and reacts to settings changes.
(function () {
  "use strict";

  var bionicSplit = (window.FocusReaderBionic || {}).bionicSplit;
  if (typeof bionicSplit !== "function") {
    return; // helper failed to load; bail out safely.
  }

  var WRAP_CLASS = "fr-word-wrap";
  var BOLD_CLASS = "adhd-bold";

  // Tag names whose text we never touch.
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1,
    VAR: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, MATH: 1,
    CANVAS: 1, AUDIO: 1, VIDEO: 1
  };

  var WORD_CHAR_RE = /[\p{L}\p{N}]/u;

  var settings = {
    enabled: true,
    intensity: 0.5,
    disabledSites: []
  };

  var active = false; // whether we are currently transforming this page
  var observer = null;
  var pendingNodes = [];
  var flushScheduled = false;

  // Time-sliced work queue so transforming a large page never blocks the main
  // thread long enough to make the tab unresponsive.
  var workQueue = [];
  var working = false;
  var FRAME_BUDGET_MS = 8;

  function now() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function scheduleChunk(fn) {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(fn, { timeout: 300 });
    } else {
      setTimeout(fn, 0);
    }
  }

  var host = location.hostname || "";

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  function isSiteDisabled() {
    if (!Array.isArray(settings.disabledSites)) return false;
    return settings.disabledSites.indexOf(host) !== -1;
  }

  var gazePaused = false; // static bionic pauses while gaze reading is active

  function shouldBeActive() {
    return !!settings.enabled && !isSiteDisabled() && !gazePaused;
  }

  function loadSettings(cb) {
    try {
      chrome.storage.sync.get(
        { enabled: true, intensity: 0.5, disabledSites: [] },
        function (stored) {
          if (stored && !chrome.runtime.lastError) {
            settings.enabled = stored.enabled;
            settings.intensity = stored.intensity;
            settings.disabledSites = stored.disabledSites || [];
          }
          cb && cb();
        }
      );
    } catch (e) {
      cb && cb();
    }
  }

  // ---------------------------------------------------------------------------
  // Node eligibility
  // ---------------------------------------------------------------------------
  function isEditable(el) {
    while (el && el.nodeType === 1) {
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  function isEligibleTextNode(node) {
    if (!node || node.nodeType !== 3) return false;
    var text = node.nodeValue;
    if (!text || !text.trim()) return false;
    if (!WORD_CHAR_RE.test(text)) return false;

    var parent = node.parentNode;
    if (!parent || parent.nodeType !== 1) return false;
    if (parent.classList && parent.classList.contains(BOLD_CLASS)) return false;
    if (parent.classList && parent.classList.contains(WRAP_CLASS)) return false;

    // Walk up checking for skip tags / editable / already-wrapped ancestors.
    var el = parent;
    while (el && el.nodeType === 1) {
      var tag = el.tagName;
      if (SKIP_TAGS[tag]) return false;
      if (el.classList && el.classList.contains(WRAP_CLASS)) return false;
      if (el.isContentEditable) return false;
      el = el.parentElement;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Transform
  // ---------------------------------------------------------------------------
  // Builds a wrapper span for a text node's content with leading halves bolded.
  function buildWrapper(text) {
    var wrap = document.createElement("span");
    wrap.className = WRAP_CLASS;

    // Split into alternating word / non-word tokens, preserving everything.
    var tokens = text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu);
    if (!tokens) {
      wrap.appendChild(document.createTextNode(text));
      return wrap;
    }

    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (WORD_CHAR_RE.test(tok)) {
        var parts = bionicSplit(tok, settings.intensity);
        if (parts[0]) {
          var b = document.createElement("b");
          b.className = BOLD_CLASS;
          b.textContent = parts[0];
          wrap.appendChild(b);
        }
        if (parts[1]) {
          wrap.appendChild(document.createTextNode(parts[1]));
        }
      } else {
        wrap.appendChild(document.createTextNode(tok));
      }
    }
    return wrap;
  }

  function transformTextNode(node) {
    if (!isEligibleTextNode(node)) return;
    var wrap = buildWrapper(node.nodeValue);
    if (node.parentNode) {
      node.parentNode.replaceChild(wrap, node);
    }
  }

  // Collect eligible text nodes under a root using a TreeWalker.
  function collectTextNodes(root) {
    var nodes = [];
    if (!root) return nodes;

    // If root itself is a text node, handle directly.
    if (root.nodeType === 3) {
      if (isEligibleTextNode(root)) nodes.push(root);
      return nodes;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) {
      return nodes;
    }

    var walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (n) {
          return isEligibleTextNode(n)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );
    var n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
    }
    return nodes;
  }

  // Queue a list of nodes for time-sliced transformation. We pause the observer
  // while draining so our own DOM writes don't feed back into it.
  function processNodes(nodes) {
    if (!nodes || !nodes.length) return;
    for (var i = 0; i < nodes.length; i++) workQueue.push(nodes[i]);
    runQueue();
  }

  function runQueue() {
    if (working || !workQueue.length) return;
    working = true;
    stopObserving();

    function chunk(deadline) {
      if (!active) {
        workQueue.length = 0;
        working = false;
        return;
      }
      var start = now();
      var hasTime = function () {
        if (deadline && typeof deadline.timeRemaining === "function") {
          return deadline.timeRemaining() > 2;
        }
        return now() - start < FRAME_BUDGET_MS;
      };
      while (workQueue.length && hasTime()) {
        transformTextNode(workQueue.shift());
      }
      if (workQueue.length) {
        scheduleChunk(chunk);
      } else {
        working = false;
        startObserving();
      }
    }

    scheduleChunk(chunk);
  }

  function transformRoot(root) {
    processNodes(collectTextNodes(root));
  }

  // ---------------------------------------------------------------------------
  // Undo (revert wrappers back to plain text)
  // ---------------------------------------------------------------------------
  function revertAll() {
    stopObserving();
    var wraps = document.querySelectorAll("." + WRAP_CLASS);
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      var textNode = document.createTextNode(wrap.textContent);
      if (wrap.parentNode) {
        wrap.parentNode.replaceChild(textNode, wrap);
        textNode.parentNode.normalize();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Mutation handling
  // ---------------------------------------------------------------------------
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    var run = function () {
      flushScheduled = false;
      var batch = pendingNodes;
      pendingNodes = [];
      var nodes = [];
      for (var i = 0; i < batch.length; i++) {
        var found = collectTextNodes(batch[i]);
        for (var j = 0; j < found.length; j++) nodes.push(found[j]);
      }
      processNodes(nodes);
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 100);
    }
  }

  function onMutations(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) {
          pendingNodes.push(m.addedNodes[j]);
        }
      } else if (m.type === "characterData") {
        pendingNodes.push(m.target);
      }
    }
    if (pendingNodes.length) scheduleFlush();
  }

  function startObserving() {
    if (!active) return;
    if (!observer) observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopObserving() {
    if (observer) observer.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Activation lifecycle
  // ---------------------------------------------------------------------------
  function activate() {
    if (active) return;
    active = true;
    transformRoot(document.body);
    startObserving();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    stopObserving();
    pendingNodes = [];
    workQueue.length = 0;
    working = false;
    revertAll();
  }

  function reapply() {
    // Used when intensity changes: revert then rebuild with new settings.
    if (!active) return;
    stopObserving();
    workQueue.length = 0;
    working = false;
    revertAll();
    active = true; // revertAll set nothing, keep active true
    transformRoot(document.body);
    startObserving();
  }

  function applyState() {
    if (shouldBeActive()) {
      if (active) {
        reapply();
      } else {
        activate();
      }
    } else {
      deactivate();
    }
  }

  // Pause static bionic bolding while gaze reading owns the page's text styling.
  window.addEventListener("fr-gaze-change", function (ev) {
    var on = !!(ev && ev.detail && ev.detail.running);
    if (on === gazePaused) return;
    gazePaused = on;
    if (gazePaused) {
      deactivate();
    } else {
      applyState();
    }
  });

  // ---------------------------------------------------------------------------
  // React to settings changes from the popup
  // ---------------------------------------------------------------------------
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") return;
      var needsReapply = false;
      if (changes.enabled) {
        settings.enabled = changes.enabled.newValue;
      }
      if (changes.disabledSites) {
        settings.disabledSites = changes.disabledSites.newValue || [];
      }
      if (changes.intensity) {
        settings.intensity = changes.intensity.newValue;
        needsReapply = true;
      }

      if (!shouldBeActive()) {
        deactivate();
      } else if (!active) {
        activate();
      } else if (needsReapply) {
        reapply();
      }
    });
  } catch (e) {
    /* storage API unavailable */
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    loadSettings(function () {
      applyState();
    });
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
