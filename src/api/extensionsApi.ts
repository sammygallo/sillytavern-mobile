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
  /**
   * Entry script(s) loaded into the iframe sandbox, relative to the extension folder.
   * String or array. Defaults to "index.js" when omitted.
   */
  js?: string | string[];
  /** Stylesheet(s) loaded into the iframe sandbox, relative to the extension folder. */
  css?: string | string[];
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

  /**
   * Fetch the manifest.json for an installed extension.
   *
   * The upstream SillyTavern backend doesn't expose a JSON API for manifests —
   * it only serves the raw file via its static-files mount at
   * `/scripts/extensions/third-party/{name}/manifest.json`. We fetch that
   * directly. The `global` flag is accepted for forward compatibility but
   * unused: both local and global third-party extensions are served from the
   * same URL prefix on the backend.
   */
  async getManifest(extensionName: string, _global?: boolean): Promise<ExtensionManifestData> {
    const url = `/scripts/extensions/third-party/${extensionName}/manifest.json`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`manifest.json not found (HTTP ${response.status})`);
    }
    return response.json();
  },
};
