// Tiny IndexedDB helper shared by every extension page (popup + reader).
// All pages of an extension share the same origin (chrome-extension://<id>),
// so IndexedDB is a safe, large-capacity channel for handing an imported file
// from the popup to the reader tab without hitting messaging size limits.
(function (global) {
  "use strict";

  var DB_NAME = "focusReaderDB";
  var STORE = "files";
  var PENDING_KEY = "pendingFile";

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function put(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function get(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () {
          db.close();
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function del(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // Store a File/Blob plus metadata for the reader to pick up.
  function savePendingFile(fileRecord) {
    return put(PENDING_KEY, fileRecord);
  }

  function takePendingFile() {
    return get(PENDING_KEY).then(function (rec) {
      if (!rec) return null;
      return del(PENDING_KEY).then(function () {
        return rec;
      });
    });
  }

  global.FocusReaderStore = {
    savePendingFile: savePendingFile,
    takePendingFile: takePendingFile
  };
})(typeof window !== "undefined" ? window : globalThis);
