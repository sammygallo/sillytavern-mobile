// Upstream-compat shim — served at /scripts/utils.js for ES-module-style
// upstream extensions whose imports resolve to this path. Backed by the
// iframe-window helpers from extensionShim.ts (loadFileToDocument and the
// trim utilities ported from upstream public/scripts/utils.js).
const w = window;

export const loadFileToDocument = w.loadFileToDocument;
export const trimToEndSentence = w.trimToEndSentence;
export const trimToStartSentence = w.trimToStartSentence;
