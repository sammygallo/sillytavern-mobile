// Probe an OpenAI-compatible endpoint for its model list.
//
// Used by:
//   - The Custom / Local section of AISettingsPage ("Test" button).
//   - The Install from URL modal (Probe mode) in ProviderCatalogPage.
//   - The customProviderStore "Refresh models" action on a user provider card.

export type ProbeResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

/**
 * Hit `${url}/models` and return the id list.
 *
 * Note: this runs in the browser, so the target endpoint must permit CORS.
 * Most hosted OpenAI-compat providers do; some local servers (Ollama, LM
 * Studio, KoboldCpp) expose permissive CORS by default.
 */
export async function probeProviderModels(
  url: string,
  apiKey?: string,
  modelListPath: string = '/models',
): Promise<ProbeResult> {
  const normalized = url.replace(/\/+$/, '');
  const fullUrl = `${normalized}${modelListPath.startsWith('/') ? '' : '/'}${modelListPath}`;

  try {
    const headers: HeadersInit = { Accept: 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(fullUrl, { method: 'GET', headers });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          ok: false,
          error: "Endpoint returned 404. Did you include '/v1' at the end of the URL?",
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: `Endpoint returned ${res.status}. ${apiKey ? 'Check your API key.' : 'An API key is required.'}`,
        };
      }
      return { ok: false, error: `Endpoint returned HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => null)) as
      | { data?: Array<{ id?: string }> }
      | Array<{ id?: string }>
      | null;

    // OpenAI shape: { data: [{id}] }. Some servers return a bare array.
    const list = Array.isArray(data) ? data : data?.data;
    const models = Array.isArray(list)
      ? list.map((m) => m.id).filter((x): x is string => typeof x === 'string')
      : [];

    return { ok: true, models };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Couldn't reach the endpoint (${msg}). Is the server running? CORS may also block browser access.`,
    };
  }
}
