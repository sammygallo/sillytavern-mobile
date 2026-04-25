// Upstream-compat shim — served at /scripts/slash-commands.js for
// ES-module-style upstream extensions whose imports resolve to this path.
// Backed by the iframe-window registerSlashCommand helper from extensionShim.ts.
const w = window;

export const registerSlashCommand = w.registerSlashCommand;
