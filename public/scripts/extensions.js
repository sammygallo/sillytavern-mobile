// Upstream-compat shim — served at /scripts/extensions.js for ES-module-style
// upstream extensions whose imports resolve to this path. Backed by globals
// injected into the iframe by extensionShim.ts.
const w = window;

export const extension_settings = w.extension_settings;
export const ModuleWorkerWrapper = w.ModuleWorkerWrapper;
export const renderExtensionTemplate = w.renderExtensionTemplate;
export const renderExtensionTemplateAsync = w.renderExtensionTemplateAsync;

// Extras (the python sidecar) is not implemented on mobile — extensions that
// rely on doExtrasFetch/getApiUrl will get clear runtime errors when they try.
export const getApiUrl = w.getApiUrl;
export const doExtrasFetch = w.doExtrasFetch;
export const modules = w.modules;

// getContext is a function (not a snapshot) — re-export the live binding so
// each call returns the iframe's current context.
export function getContext() {
  return w.SillyTavern.getContext();
}
