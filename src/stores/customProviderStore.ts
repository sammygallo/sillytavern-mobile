// Custom (user-added) provider store.
//
// User providers are stored under oai_settings.stm_custom_providers on the
// backend and route through chat_completion_source: 'custom' on send.
//
// Key storage note: the backend masks secrets on read, which means we can't
// round-trip a per-provider key into the single api_key_custom slot the
// backend actually reads. To keep things simple and avoid a second backend
// endpoint, v1 uses the single api_key_custom slot: the currently "active"
// user provider's key lives there. Switching user providers requires the
// user to re-enter the key — this matches today's Custom / Local behavior
// and is surfaced clearly in the UI.

import { create } from 'zustand';
import { settingsApi } from '../api/client';
import type { UserProvider } from '../api/providerCatalog';

interface CustomProviderState {
  list: UserProvider[];
  activeId: string | null;
  isLoading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  /**
   * Add or replace a user provider. If apiKey is supplied, also writes
   * api_key_custom and sets this provider active. createdAt is stamped here
   * so callers don't need to touch Date.now() from render-adjacent code.
   */
  addOrUpdate: (
    provider: Omit<UserProvider, 'createdAt'> & { createdAt?: number },
    apiKey?: string,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Make this user provider the active one. Writes custom_url/custom_model
   * and flips chat_completion_source to 'custom'. Does NOT touch the shared
   * api_key_custom slot — caller must supply apiKey via addOrUpdate.
   */
  activate: (id: string) => Promise<void>;
  /** Re-save the API key for a user provider (writes to api_key_custom). */
  setApiKey: (id: string, apiKey: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Settings round-trip helpers
// ---------------------------------------------------------------------------

async function readOaiSettings(): Promise<Record<string, unknown>> {
  const response = await settingsApi.getSettings();
  let settings: Record<string, unknown> = {};
  if (typeof response.settings === 'string') {
    try {
      settings = JSON.parse(response.settings);
    } catch {
      settings = {};
    }
  } else if (response.settings) {
    settings = response.settings as Record<string, unknown>;
  }
  return settings;
}

function parseCustomProviderList(settings: Record<string, unknown>): UserProvider[] {
  const oai = (settings.oai_settings as Record<string, unknown>) || {};
  const raw = oai.stm_custom_providers;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidUserProvider);
}

function isValidUserProvider(x: unknown): x is UserProvider {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.baseUrl === 'string' &&
    p.nativeRouted === false
  );
}

function parseActiveId(settings: Record<string, unknown>): string | null {
  const oai = (settings.oai_settings as Record<string, unknown>) || {};
  const v = oai.stm_active_custom_provider;
  return typeof v === 'string' ? v : null;
}

async function writeOaiPatch(
  patch: (oai: Record<string, unknown>) => void,
): Promise<void> {
  const settings = await readOaiSettings();
  const oai = (settings.oai_settings as Record<string, unknown>) || {};
  patch(oai);
  settings.oai_settings = oai;
  await settingsApi.saveSettings(settings);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCustomProviderStore = create<CustomProviderState>((set, get) => ({
  list: [],
  activeId: null,
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await readOaiSettings();
      set({
        list: parseCustomProviderList(settings),
        activeId: parseActiveId(settings),
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load custom providers',
      });
    }
  },

  addOrUpdate: async (provider, apiKey) => {
    set({ error: null });
    try {
      // Dedupe by id — replace if present. Always stamp createdAt here so UI
      // callers don't need to reach for Date.now() (which upsets the
      // react-hooks/purity lint rule when it's near render code).
      const existing = get().list.find((p) => p.id === provider.id);
      const stamped: UserProvider = {
        ...provider,
        createdAt: existing?.createdAt ?? Date.now(),
      };
      const next: UserProvider[] = [
        ...get().list.filter((p) => p.id !== provider.id),
        stamped,
      ];

      await writeOaiPatch((oai) => {
        oai.stm_custom_providers = next;
      });

      if (apiKey && apiKey.trim()) {
        await get().setApiKey(provider.id, apiKey.trim());
      }

      set({ list: next });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save provider' });
      throw error;
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      const next = get().list.filter((p) => p.id !== id);
      const wasActive = get().activeId === id;

      await writeOaiPatch((oai) => {
        oai.stm_custom_providers = next;
        if (wasActive) {
          oai.stm_active_custom_provider = null;
        }
      });

      set({ list: next, activeId: wasActive ? null : get().activeId });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to remove provider' });
      throw error;
    }
  },

  setApiKey: async (id, apiKey) => {
    set({ error: null });
    try {
      const provider = get().list.find((p) => p.id === id);
      if (!provider) throw new Error('Provider not found');

      // Drop any existing entries in api_key_custom first.
      try {
        const secrets = await settingsApi.getSecrets();
        const existing = secrets['api_key_custom'];
        if (Array.isArray(existing)) {
          for (const s of existing) {
            try {
              await settingsApi.deleteSecret('api_key_custom', s.id);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }

      await settingsApi.writeSecret('api_key_custom', apiKey.trim(), provider.name);

      // Mark this provider as the one whose key is in the shared slot.
      await writeOaiPatch((oai) => {
        oai.stm_active_custom_provider = id;
      });

      set({ activeId: id });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save API key' });
      throw error;
    }
  },

  activate: async (id) => {
    set({ error: null });
    try {
      const provider = get().list.find((p) => p.id === id);
      if (!provider) throw new Error('Provider not found');

      await writeOaiPatch((oai) => {
        oai.chat_completion_source = 'custom';
        oai.custom_url = provider.baseUrl;
        if (provider.defaultModels.length > 0 && !oai.custom_model) {
          oai.custom_model = provider.defaultModels[0];
        }
        oai.stm_active_custom_provider = id;
      });

      set({ activeId: id });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to activate provider' });
      throw error;
    }
  },
}));
