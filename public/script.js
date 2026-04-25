// Upstream-compat shim — served at /script.js for ES-module-style upstream
// extensions whose imports resolve to this path (e.g.
// `import { eventSource } from '../../../../script.js'`). Backed by the
// iframe-window globals injected by extensionShim.ts.
//
// This file is loaded ONLY inside the sandboxed extension iframe, where the
// shim has already populated `window.eventSource`, `window.event_types`, etc.
// before any module is fetched. Outside the iframe (i.e. if a parent-page
// script were to import this), the exports would be undefined, which is
// expected — nothing in the mobile app should reach for these.
const w = window;

export const eventSource = w.eventSource;
export const event_types = w.event_types;
export const getCharacters = w.getCharacters;
export const saveSettingsDebounced = w.saveSettingsDebounced;
export const saveSettings = w.saveSettings;
export const getRequestHeaders = w.getRequestHeaders;
export const callPopup = w.callPopup;
export const callGenericPopup = w.callGenericPopup;
export const sendMessageAsUser = w.sendMessageAsUser;

// Legacy direct-name globals some extensions read instead of getCharacters().
export const characters = w.characters;
export const name1 = w.name1;
export const name2 = w.name2;
export const this_chid = w.this_chid;
export const chat = w.chat;
