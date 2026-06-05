// Focus Reader document viewer.
// Reads an imported PDF / text file (handed over via IndexedDB by the popup,
// or chosen directly here), extracts its text locally, and renders it with the
// leading half of every word bolded.
(function () {
  "use strict";

  var bionicSplit = (window.FocusReaderBionic || {}).bionicSplit;
  var store = window.FocusReaderStore;
  var pdfjsLib = window.pdfjsLib;

  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      chrome.runtime.getURL("vendor/pdf.worker.js");
  }

  var el = {
    fileName: document.getElementById("fileName"),
    intensity: document.getElementById("intensity"),
    intensityValue: document.getElementById("intensityValue"),
    openBtn: document.getElementById("openBtn"),
    chooseBtn: document.getElementById("chooseBtn"),
    fileInput: document.getElementById("fileInput"),
    dropzone: document.getElementById("dropzone"),
    empty: document.getElementById("empty"),
    loading: document.getElementById("loading"),
    loadingText: document.getElementById("loadingText"),
    doc: document.getElementById("doc"),
    error: document.getElementById("error"),
    errorText: document.getElementById("errorText")
  };

  var intensity = 0.5;
  // Parsed content kept as an array of blocks so we can re-render instantly
  // when the intensity slider moves, without re-parsing the file.
  // Each block: { type: "para" | "page", text: string }
  var blocks = [];

  // ---------------------------------------------------------------------------
  // View state
  // ---------------------------------------------------------------------------
  function show(view) {
    el.empty.hidden = view !== "empty";
    el.loading.hidden = view !== "loading";
    el.doc.hidden = view !== "doc";
    el.error.hidden = view !== "error";
  }

  function setLoading(msg) {
    el.loadingText.textContent = msg || "Reading document...";
    show("loading");
  }

  function setError(msg) {
    el.errorText.textContent = msg;
    show("error");
  }

  // ---------------------------------------------------------------------------
  // Bionic rendering (DOM-based, no innerHTML -> no injection risk)
  // ---------------------------------------------------------------------------
  function appendBionicText(parent, text) {
    var tokens = text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu);
    if (!tokens) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (/[\p{L}\p{N}]/u.test(tok)) {
        var parts = bionicSplit ? bionicSplit(tok, intensity) : [tok, ""];
        if (parts[0]) {
          var b = document.createElement("b");
          b.textContent = parts[0];
          parent.appendChild(b);
        }
        if (parts[1]) parent.appendChild(document.createTextNode(parts[1]));
      } else {
        parent.appendChild(document.createTextNode(tok));
      }
    }
  }

  function renderBlocks() {
    var hasText = blocks.some(function (b) {
      return b.type === "para" && b.text && b.text.trim();
    });
    if (!hasText) {
      setError(
        "No selectable text was found in this document. Scanned or image-only " +
          "PDFs have no embedded text to format."
      );
      return;
    }
    el.doc.textContent = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (block.type === "page") {
        var h = document.createElement("h1");
        h.className = "rd-page-sep";
        h.textContent = block.text;
        frag.appendChild(h);
      } else {
        var p = document.createElement("p");
        appendBionicText(p, block.text);
        frag.appendChild(p);
      }
    }
    el.doc.appendChild(frag);
    show("doc");
  }

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------
  function paragraphsFromLines(lines) {
    var paras = [];
    var buf = "";
    for (var i = 0; i < lines.length; i++) {
      var line = (lines[i] || "").trim();
      if (!line) {
        if (buf) {
          paras.push(buf.trim());
          buf = "";
        }
      } else {
        buf += (buf ? " " : "") + line;
      }
    }
    if (buf) paras.push(buf.trim());
    return paras;
  }

  function parsePlainText(text) {
    blocks = [];
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var paras = paragraphsFromLines(lines);
    for (var i = 0; i < paras.length; i++) {
      blocks.push({ type: "para", text: paras[i] });
    }
    if (!blocks.length) blocks.push({ type: "para", text: text });
  }

  function parsePdf(arrayBuffer) {
    return pdfjsLib
      .getDocument({ data: arrayBuffer, isEvalSupported: false })
      .promise.then(function (pdf) {
        blocks = [];
        var pageCount = pdf.numPages;

        function processPage(pageNum) {
          return pdf.getPage(pageNum).then(function (page) {
            return page.getTextContent().then(function (content) {
              var lines = [];
              var lineText = "";
              for (var i = 0; i < content.items.length; i++) {
                var item = content.items[i];
                if (typeof item.str === "string") lineText += item.str;
                if (item.hasEOL) {
                  lines.push(lineText);
                  lineText = "";
                }
              }
              if (lineText) lines.push(lineText);

              if (pageCount > 1) {
                blocks.push({ type: "page", text: "Page " + pageNum });
              }
              var paras = paragraphsFromLines(lines);
              for (var p = 0; p < paras.length; p++) {
                blocks.push({ type: "para", text: paras[p] });
              }
              setLoading("Reading page " + pageNum + " of " + pageCount + "...");
            });
          });
        }

        var chain = Promise.resolve();
        for (var n = 1; n <= pageCount; n++) {
          (function (num) {
            chain = chain.then(function () {
              return processPage(num);
            });
          })(n);
        }
        return chain;
      });
  }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------
  function looksLikePdf(name, type) {
    return (
      /pdf/.test(type || "") || /\.pdf$/i.test(name || "")
    );
  }

  function handleFile(file, presetIntensity) {
    if (!file) return;
    if (typeof presetIntensity === "number") {
      intensity = presetIntensity;
      el.intensity.value = String(intensity);
      el.intensityValue.textContent = Math.round(intensity * 100) + "%";
    }
    el.fileName.textContent = file.name || "document";
    setLoading("Reading document...");

    if (looksLikePdf(file.name, file.type)) {
      if (!pdfjsLib) {
        setError("PDF support failed to load.");
        return;
      }
      file
        .arrayBuffer()
        .then(parsePdf)
        .then(renderBlocks)
        .catch(function (err) {
          setError("Could not read this PDF. " + (err && err.message ? err.message : ""));
        });
    } else {
      file
        .text()
        .then(function (text) {
          parsePlainText(text);
          renderBlocks();
        })
        .catch(function () {
          setError("Could not read this file.");
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  el.intensity.addEventListener("input", function () {
    intensity = parseFloat(el.intensity.value);
    el.intensityValue.textContent = Math.round(intensity * 100) + "%";
    if (blocks.length) renderBlocks();
  });

  function pickFile() {
    el.fileInput.click();
  }
  el.openBtn.addEventListener("click", pickFile);
  el.chooseBtn.addEventListener("click", pickFile);
  el.fileInput.addEventListener("change", function () {
    handleFile(el.fileInput.files && el.fileInput.files[0]);
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
    handleFile(f);
  });
  // Allow dropping anywhere on the page once a doc is open.
  document.addEventListener("dragover", function (e) {
    e.preventDefault();
  });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    if (!el.doc.hidden || !el.empty.hidden) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    }
  });

  // ---------------------------------------------------------------------------
  // Boot: pick up a file handed over by the popup, if any.
  // ---------------------------------------------------------------------------
  function boot() {
    chrome.storage.sync.get({ intensity: 0.5 }, function (s) {
      if (s && typeof s.intensity === "number") {
        intensity = s.intensity;
        el.intensity.value = String(intensity);
        el.intensityValue.textContent = Math.round(intensity * 100) + "%";
      }
      if (!store) {
        show("empty");
        return;
      }
      store
        .takePendingFile()
        .then(function (rec) {
          if (rec && rec.blob) {
            handleFile(rec.blob, rec.intensity);
            el.fileName.textContent = rec.name || "document";
          } else {
            show("empty");
          }
        })
        .catch(function () {
          show("empty");
        });
    });
  }

  boot();
})();
