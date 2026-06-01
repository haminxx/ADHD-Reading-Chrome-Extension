// Pure helper for computing the "bionic" split of a single word.
// Loaded before content.js as a plain (non-module) content script, so it
// exposes a single global: window.FocusReaderBionic.
(function (global) {
  "use strict";

  // Characters we treat as part of a word. Letters and digits across common
  // unicode ranges, plus internal apostrophes/hyphens are handled by the caller.
  var WORD_RE = /[\p{L}\p{N}]+/u;

  /**
   * Given a single word and an intensity fraction (0..1), returns the
   * [boldPart, restPart] split.
   *
   * The number of bold characters is ceil(length * fraction), clamped so that
   * at least one character is bold and at most all-but-one for long words.
   *
   *   fraction 0.5 (default): Bionic -> ["Bio", "nic"], reading -> ["READ", "ing"]
   *   fraction 0.4 (lighter): reading -> ["REA", "ding"] (less than half)
   *
   * @param {string} word  A run of word characters (no surrounding spaces).
   * @param {number} fraction  Intensity, defaults to 0.5.
   * @returns {[string, string]}
   */
  function bionicSplit(word, fraction) {
    if (typeof word !== "string" || word.length === 0) {
      return ["", ""];
    }
    var f = typeof fraction === "number" && isFinite(fraction) ? fraction : 0.5;
    if (f < 0) f = 0;
    if (f > 1) f = 1;

    var len = word.length;

    // Single-character words: bold the whole thing so the anchor is visible.
    if (len === 1) {
      return [word, ""];
    }

    var boldCount = Math.ceil(len * f);
    if (boldCount < 1) boldCount = 1;
    if (boldCount >= len) boldCount = len - 1; // keep at least one trailing char

    return [word.slice(0, boldCount), word.slice(boldCount)];
  }

  global.FocusReaderBionic = {
    bionicSplit: bionicSplit,
    WORD_RE: WORD_RE
  };
})(typeof window !== "undefined" ? window : globalThis);
