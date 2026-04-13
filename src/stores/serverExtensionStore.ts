import { create } from 'zustand';
import {
  extensionsApi,
  type RegistryExtension,
  type DiscoveredExtension,
  type ExtensionVersionInfo,
} from '../api/extensionsApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstalledExtensionInfo extends DiscoveredExtension {
  version?: ExtensionVersionInfo;
}

type OperationType = 'installing' | 'updating' | 'deleting';

interface ServerExtensionState {
  // Data
  registry: RegistryExtension[];
  installed: InstalledExtensionInfo[];

  // Loading / error states
  isLoadingRegistry: boolean;
  isLoadingInstalled: boolean;
  error: string | null;

  // Per-extension operation tracking (keyed by extension name or URL)
  operationInProgress: Record<string, OperationType>;

  // Actions
  fetchRegistry: () => Promise<void>;
  fetchInstalled: () => Promise<void>;
  installExtension: (url: string) => Promise<boolean>;
  updateExtension: (name: string, global?: boolean) => Promise<boolean>;
  deleteExtension: (name: string, global?: boolean) => Promise<boolean>;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip the "third-party/" prefix that the backend adds to local/global extensions. */
function baseName(name: string): string {
  return name.replace(/^third-party\//, '');
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useServerExtensionStore = create<ServerExtensionState>((set, get) => ({
  registry: [],
  installed: [],
  isLoadingRegistry: false,
  isLoadingInstalled: false,
  error: null,
  operationInProgress: {},

  async fetchRegistry() {
    set({ isLoadingRegistry: true, error: null });
    try {
      const registry = await extensionsApi.fetchRegistry();
      set({ registry, isLoadingRegistry: false });
    } catch (err) {
      set({
        isLoadingRegistry: false,
        error: err instanceof Error ? err.message : 'Failed to fetch registry',
      });
    }
  },

  async fetchInstalled() {
    set({ isLoadingInstalled: true, error: null });
    try {
      const discovered = await extensionsApi.getInstalled();
      // Only show local/global (third-party) extensions, not system built-ins
      const thirdParty = discovered.filter((e) => e.type !== 'system');

      // Fetch version info for each installed extension in parallel
      const withVersions: InstalledExtensionInfo[] = await Promise.all(
        thirdParty.map(async (ext) => {
          try {
            const version = await extensionsApi.checkVersion(
              baseName(ext.name),
              ext.type === 'global',
            );
            return { ...ext, version };
          } catch {
            return ext;
          }
        }),
      );

      set({ installed: withVersions, isLoadingInstalled: false });
    } catch (err) {
      set({
        isLoadingInstalled: false,
        error: err instanceof Error ? err.message : 'Failed to fetch installed extensions',
      });
    }
  },

  async installExtension(url: string) {
    const key = url;
    set((s) => ({
      operationInProgress: { ...s.operationInProgress, [key]: 'installing' },
      error: null,
    }));
    try {
      await extensionsApi.install(url);
      set((s) => {
        const { [key]: _, ...rest } = s.operationInProgress;
        return { operationInProgress: rest };
      });
      // Refresh installed list
      await get().fetchInstalled();
      return true;
    } catch (err) {
      set((s) => {
        const { [key]: _, ...rest } = s.operationInProgress;
        return {
          operationInProgress: rest,
          error: err instanceof Error ? err.message : 'Install failed',
        };
      });
      return false;
    }
  },

  async updateExtension(name: string, global?: boolean) {
    const key = name;
    set((s) => ({
      operationInProgress: { ...s.operationInProgress, [key]: 'updating' },
      error: null,
    }));
    try {
      await extensionsApi.update(baseName(name), global);
      set((s) => {
        const { [key]: _, ...rest } = s.operationInProgress;
        return { operationInProgress: rest };
      });
      // Refresh installed list
      await get().fetchInstalled();
      return true;
    } catch (err) {
      set((s) => {
        const { [key]: _, ...rest } = s.operationInProgress;
        return {
          operationInProgress: rest,
          error: err instanceof Error ? err.message : 'Update failed',
        };
      });
      return false;
    }
  },

  async deleteExtension(name: string, global?: boolean) {
    const key = name;
    set((s) => ({
      operationInProgress: { ...s.operationInProgress, [key]: 'deleting' },
      error: null,
    }));
    try {
      await extensionsApi.remove(baseName(name), global);
      set((s) => {
        const { [key]: _, ...rest } = s.operationInProgress;
        return { operationInProgress: rest };
      });
      // Refresh installed list
      await get().fetchInstalled();
      return true;
    } catch (err) {
      set((s) => {
        const { [key]: _, ...rest } = s.operationInProgress;
        return {
          operationInProgress: rest,
          error: err instanceof Error ? err.message : 'Delete failed',
        };
      });
      return false;
    }
  },

  clearError() {
    set({ error: null });
  },
}));
