import { apiRequest, apiRequestText } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A slash command declared in an extension manifest.json. */
export interface SlashCommandDeclaration {
  name: string;
  description?: string;
  aliases?: string[];
  named_args?: { name: string; description: string }[];
}

/** Shape of an extension's manifest.json, as returned by the ST backend. */
export interface ExtensionManifestData {
  display_name?: string;
  version?: string;
  author?: string;
  homePage?: string;
  description?: string;
  tags?: string[];
  keywords?: string[];
  requires?: string[];
  /** Slash commands this extension exposes to the mobile STscript engine. */
  slash_commands?: SlashCommandDeclaration[];
  /** When true, the extension exposes a POST /api/plugins/<name>/generate-interceptors endpoint. */
  generate_interceptor?: boolean;
}

/** Entry shape from the SillyTavern-Content extensions.json registry. */
export interface RegistryExtension {
  id: string;
  type: string;
  name: string;
  description: string;
  url: string;
  tool?: boolean;
}

/** Shape returned by GET /api/extensions/discover for each installed extension. */
export interface DiscoveredExtension {
  type: 'system' | 'local' | 'global';
  name: string;
}

/** Response from POST /api/extensions/install. */
export interface InstallResult {
  version: string;
  author: string;
  display_name: string;
  extensionPath: string;
  folderName: string;
}

/** Response from POST /api/extensions/version. */
export interface ExtensionVersionInfo {
  currentBranchName: string;
  currentCommitHash: string;
  isUpToDate: boolean;
  remoteUrl: string;
}

/** Response from POST /api/extensions/update. */
export interface UpdateResult {
  shortCommitHash: string;
  extensionPath: string;
  isUpToDate: boolean;
  remoteUrl: string;
}

// ---------------------------------------------------------------------------
// Registry URL
// ---------------------------------------------------------------------------

const REGISTRY_URL =
  'https://raw.githubusercontent.com/SillyTavern/SillyTavern-Content/main/extensions.json';

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const extensionsApi = {
  /** Fetch the official SillyTavern extension registry from GitHub. */
  async fetchRegistry(): Promise<RegistryExtension[]> {
    const response = await fetch(REGISTRY_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch extension registry (HTTP ${response.status})`);
    }
    const data: RegistryExtension[] = await response.json();
    return data.filter((e) => e.type === 'extension');
  },

  /** List extensions installed on the backend (system, local, global). */
  async getInstalled(): Promise<DiscoveredExtension[]> {
    return apiRequest<DiscoveredExtension[]>('/api/extensions/discover');
  },

  /** Install an extension by git URL. */
  async install(url: string, global?: boolean): Promise<InstallResult> {
    return apiRequest<InstallResult>('/api/extensions/install', {
      method: 'POST',
      body: JSON.stringify({ url, global }),
    });
  },

  /** Update an installed extension (git pull). */
  async update(extensionName: string, global?: boolean): Promise<UpdateResult> {
    return apiRequest<UpdateResult>('/api/extensions/update', {
      method: 'POST',
      body: JSON.stringify({ extensionName, global }),
    });
  },

  /** Delete an installed extension. */
  async remove(extensionName: string, global?: boolean): Promise<string> {
    return apiRequestText('/api/extensions/delete', {
      method: 'POST',
      body: JSON.stringify({ extensionName, global }),
    });
  },

  /** Check version / update availability for an installed extension. */
  async checkVersion(extensionName: string, global?: boolean): Promise<ExtensionVersionInfo> {
    return apiRequest<ExtensionVersionInfo>('/api/extensions/version', {
      method: 'POST',
      body: JSON.stringify({ extensionName, global }),
    });
  },

  /** Fetch the manifest.json for an installed extension. */
  async getManifest(extensionName: string, global?: boolean): Promise<ExtensionManifestData> {
    const params = new URLSearchParams({ extensionName });
    if (global) params.set('global', 'true');
    return apiRequest<ExtensionManifestData>(`/api/extensions/manifest?${params}`);
  },
};
