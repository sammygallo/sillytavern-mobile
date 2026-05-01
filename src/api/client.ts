// API Client for SillyTavern backend

let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;

  const response = await fetch('/csrf-token');
  const data = await response.json();
  csrfToken = data.token;
  return csrfToken!;
}

/** Call after logout so the next request fetches a fresh token from the new session. */
export function clearCsrfToken(): void {
  csrfToken = null;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getCsrfToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
    ...options.headers,
  };

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from ${endpoint}`);
  }
}

/** Like apiRequest but returns the raw response body as a string (for plain-text endpoints). */
export async function apiRequestText(
  endpoint: string,
  options: RequestInit = {}
): Promise<string> {
  const token = await getCsrfToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
    ...options.headers,
  };
  const response = await fetch(endpoint, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }
  return response.text();
}

/**
 * Append character-create/edit fields to a multipart FormData body.
 *
 * Arrays are appended as repeated same-key entries (which Express parses
 * back into an array), NOT as a JSON-stringified blob — the backend's
 * getAlternateGreetings() treats a string as a single-element array, so
 * stringifying would collapse N alternates into one giant JSON string.
 */
function appendCharacterFields(
  formData: FormData,
  data: object
): void {
  Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      // Skip entirely when empty — form-data can't express an empty array
      // and the backend treats a missing field as [].
      if (value.length === 0) return;
      for (const item of value) {
        formData.append(key, typeof item === 'string' ? item : JSON.stringify(item));
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      formData.append(key, String(value));
    } else {
      formData.append(key, String(value));
    }
  });
}

export interface UserInfo {
  handle: string;
  name: string;
  avatar: string;
  password: boolean; // true if user has a password set
  created?: number;
}

export type CharacterVisibility = 'global' | 'personal';

export interface CharacterMetadataEntry {
  ownerHandle: string;
  visibility: CharacterVisibility;
  claimedAt: number;
}

export type CharacterMetadataMap = Record<string, CharacterMetadataEntry>;

export interface UserHandleSummary {
  handle: string;
  name: string;
}

export interface CharacterInfo {
  name: string;
  avatar: string; // filename like "CharacterName.png"
  description?: string;
  personality?: string;
  first_mes?: string;
  scenario?: string;
  mes_example?: string;
  create_date?: string;
  date_added?: number;
  date_last_chat?: number;
  chat_size?: number;
  fav?: boolean;
  tags?: string[];
  // Global character sharing (populated by the server; may be absent on older
  // backends, in which case callers treat as 'personal' / null).
  visibility?: CharacterVisibility;
  owner_handle?: string | null;
  // Advanced Character Card V2 fields
  alternate_greetings?: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  character_version?: string;
  creator_notes?: string;
  creator?: string;
  data?: {
    name?: string;
    description?: string;
    personality?: string;
    first_mes?: string;
    scenario?: string;
    mes_example?: string;
    creator_notes?: string;
    creator?: string;
    tags?: string[];
    alternate_greetings?: string[];
    system_prompt?: string;
    post_history_instructions?: string;
    character_version?: string;
    extensions?: {
      depth_prompt?: {
        prompt?: string;
        depth?: number;
        role?: string;
      };
      talkativeness?: string;
      fav?: boolean;
      [key: string]: unknown;
    };
  };
}

export interface CharacterCreateData {
  ch_name: string;
  description?: string;
  personality?: string;
  first_mes?: string;
  scenario?: string;
  mes_example?: string;
  creator_notes?: string;
  creator?: string;
  tags?: string;
  // Advanced fields - sent via data object JSON string
  alternate_greetings?: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  character_version?: string;
  depth_prompt_prompt?: string;
  depth_prompt_depth?: number;
  depth_prompt_role?: string;
  talkativeness?: string;
  fav?: boolean;
}

export interface CharacterEditData extends CharacterCreateData {
  avatar_url: string;
  chat?: string;
  create_date?: string;
}

// Generation sampler options passed through to the backend.
// Most fields are optional and only sent when set to non-default values.
export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  stopStrings?: string[];
}

/** Phase 6.1 — image attachment sent with generateMessage. `base64` is
 *  the raw payload (NO `data:...;base64,` prefix); the API client folds
 *  these into OpenAI-style content parts before POST. */
export interface GenerationImage {
  mimeType: string;
  base64: string;
}

export const api = {
  // Auth endpoints
  async getUsers(): Promise<UserInfo[]> {
    const response = await apiRequest<UserInfo[] | undefined>('/api/users/list', {
      method: 'POST',
    });
    // Returns array directly, or empty array if 204 (discreet login).
    // Must use Array.isArray — a 204 causes apiRequest to return {} which
    // is truthy, so `response || []` would incorrectly return {} instead of [].
    return Array.isArray(response) ? response : [];
  },

  async login(handle: string, password?: string): Promise<{ handle: string }> {
    return apiRequest('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ handle, password }),
    });
  },

  async logout(): Promise<void> {
    await apiRequest('/api/users/logout', { method: 'POST' });
  },

  async getCurrentUser(): Promise<{
    handle: string;
    name: string;
    role: import('../types').UserRole;
    avatar?: string;
    groupId?: string;
    permissions?: import('../types').Permission[];
  } | null> {
    try {
      const user = await apiRequest<{
        handle: string;
        name: string;
        admin: boolean;
        role?: string;
        avatar?: string;
        groupId?: string;
        permissions?: string[];
      }>('/api/users/me');
      // Derive role: backend may return role directly (Phase 1 backend),
      // or fall back to admin boolean for older servers.
      const role = (user.role as import('../types').UserRole) ||
        (user.admin ? 'admin' : 'end_user');
      return {
        handle: user.handle,
        name: user.name,
        role,
        avatar: user.avatar,
        groupId: user.groupId,
        permissions: user.permissions,
      };
    } catch {
      return null;
    }
  },

  async changeName(handle: string, name: string): Promise<void> {
    await apiRequest('/api/users/change-name', {
      method: 'POST',
      body: JSON.stringify({ handle, name }),
    });
  },

  async changePassword(handle: string, oldPassword: string, newPassword: string): Promise<void> {
    await apiRequest('/api/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ handle, oldPassword, newPassword }),
    });
  },

  async changeAvatar(handle: string, avatar: string): Promise<void> {
    await apiRequest('/api/users/change-avatar', {
      method: 'POST',
      body: JSON.stringify({ handle, avatar }),
    });
  },

  async register(handle: string, name: string, password?: string): Promise<{ handle: string }> {
    // Registration requires admin. For first-time setup, we need to:
    // 1. Login as default-user (auto-created, no password, is admin)
    // 2. Create the new user as owner (first real user gets full ownership)
    // 3. Return success

    // First, try to login as default-user to get admin access
    try {
      await apiRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ handle: 'default-user', password: '' }),
      });
    } catch {
      // If default-user login fails, we can't bootstrap
      throw new Error('Cannot register: Please login as an admin user first');
    }

    // Now create the new user (we're logged in as default-user/admin)
    // First registrant gets the Owner group; the backend also accepts the
    // legacy { admin, role } shape during the transition window, but we send
    // the new shape to avoid the deprecation warning.
    const result = await apiRequest<{ handle: string }>('/api/users/create', {
      method: 'POST',
      body: JSON.stringify({ handle, name, password, groupId: 'owner-default' }),
    });

    // Logout default-user
    try {
      await apiRequest('/api/users/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    }

    return result;
  },

  async checkCanRegister(): Promise<{ canRegister: boolean; requiresAdmin: boolean }> {
    try {
      // Check if there are existing users
      const users = await this.getUsers();
      // Only the default-user exists (auto-created) = allow registration as first "real" user
      const onlyDefaultUser = users.length === 1 && users[0].handle === 'default-user';
      const noUsers = users.length === 0;
      return {
        canRegister: noUsers || onlyDefaultUser,
        requiresAdmin: !noUsers && !onlyDefaultUser
      };
    } catch {
      // If we can't fetch users, assume registration requires admin
      return { canRegister: false, requiresAdmin: true };
    }
  },

  // Character endpoints
  async getCharacters(): Promise<CharacterInfo[]> {
    // Returns array of character objects directly
    const response = await apiRequest<CharacterInfo[]>('/api/characters/all', {
      method: 'POST',
    });
    return response || [];
  },

  async getCharacter(avatarUrl: string): Promise<CharacterInfo> {
    return apiRequest('/api/characters/get', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
  },

  async createCharacter(data: CharacterCreateData, avatarFile?: File): Promise<string> {
    // Returns avatar filename like "CharacterName.png" as plain text
    const token = await getCsrfToken();

    let response: Response;

    if (avatarFile) {
      // Use multipart form data when uploading an image
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      appendCharacterFields(formData, data);

      response = await fetch('/api/characters/create', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': token,
        },
        credentials: 'include',
        body: formData,
      });
    } else {
      // JSON body when no image
      response = await fetch('/api/characters/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create character' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    // Backend returns plain text (avatar filename), not JSON
    return response.text();
  },

  async deleteCharacter(avatarUrl: string, deleteChats: boolean = true): Promise<void> {
    // Server responds with a plain-text body (e.g. "OK"), not JSON.
    // Use apiRequestText so a non-JSON success body isn't treated as a failure.
    await apiRequestText('/api/characters/delete', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl, delete_chats: deleteChats }),
    });
  },

  async editCharacter(data: CharacterEditData, avatarFile?: File): Promise<void> {
    // Backend returns plain text "OK", not JSON
    const token = await getCsrfToken();

    let response: Response;

    if (avatarFile) {
      // Use multipart form data when uploading an image
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      appendCharacterFields(formData, data);

      response = await fetch('/api/characters/edit', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': token,
        },
        credentials: 'include',
        body: formData,
      });
    } else {
      response = await fetch('/api/characters/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }
  },

  // Duplicate a character (server-side)
  async duplicateCharacter(avatarUrl: string): Promise<string> {
    const token = await getCsrfToken();
    const response = await fetch('/api/characters/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      credentials: 'include',
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Failed to duplicate');
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    // Backend returns JSON { path: 'newavatar.png' } or plain text
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data.path || data.file_name || text;
    } catch {
      return text;
    }
  },

  // --- Global character sharing ---

  /**
   * Fetches the character ownership/visibility map from the server.
   * Returns {} on older backends that don't yet expose the endpoint, so
   * callers can treat every character as personal/unowned.
   */
  async getCharacterMetadata(): Promise<CharacterMetadataMap> {
    try {
      const response = await apiRequest<CharacterMetadataMap>('/api/characters/metadata', {
        method: 'POST',
      });
      return response || {};
    } catch {
      return {};
    }
  },

  /**
   * Moves a character between global and personal scope. OWNER-only on the
   * server. On success, the caller should refetch characters + metadata —
   * the file has physically moved directories.
   */
  async setCharacterVisibility(avatarUrl: string, visibility: CharacterVisibility): Promise<void> {
    await apiRequest('/api/characters/set-visibility', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl, visibility }),
    });
  },

  /**
   * Transfers ownership of a global character to another user. The current
   * owner must be the requester; metadata-only update on the server.
   */
  async transferCharacterOwnership(avatarUrl: string, newOwnerHandle: string): Promise<void> {
    await apiRequest('/api/characters/transfer-ownership', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl, new_owner_handle: newOwnerHandle }),
    });
  },

  /**
   * Returns enabled users' handles + display names (excluding the caller),
   * for recipient pickers. Authenticated request, no special permission.
   */
  async listUserHandles(): Promise<UserHandleSummary[]> {
    const result = await apiRequest<UserHandleSummary[]>('/api/users/handles', {
      method: 'POST',
    });
    return Array.isArray(result) ? result : [];
  },

  // Chat endpoints - use avatar filename directly for consistency
  async getChats(avatarUrl: string): Promise<{ file_name: string; file_size: number; last_mes: string }[]> {
    const result = await apiRequest('/api/characters/chats', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
    // Backend returns { error: true } if no chats, otherwise returns array
    return Array.isArray(result) ? result : [];
  },

  async getChatMessages(avatarUrl: string, fileName: string): Promise<ChatMessage[]> {
    const response = await apiRequest<ChatMessage[]>('/api/chats/get', {
      method: 'POST',
      body: JSON.stringify({
        file_name: fileName,
        avatar_url: avatarUrl,
      }),
    });
    // Backend returns array directly, skip first element (header)
    return Array.isArray(response) ? response.slice(1) : [];
  },

  // Generate message with full context
  async generateMessage(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    _characterName: string,
    provider?: string,
    model?: string,
    signal?: AbortSignal,
    generationOptions?: GenerationOptions,
    images?: GenerationImage[],
    /** Phase 10.3: when true, send as text completion (single prompt string). */
    textCompletionMode?: boolean,
  ): Promise<ReadableStream<Uint8Array> | null> {
    const token = await getCsrfToken();

    // Phase 6.1: when the caller passed images, fold them into the LAST
    // user message as OpenAI-style content parts. The SillyTavern backend
    // at /api/backends/chat-completions/generate translates these to
    // each provider's native multimodal format (Claude: base64 source,
    // Gemini: inline_data parts), so we only need to emit one shape here.
    let messagesToSend: unknown[] = messages;
    if (images && images.length > 0) {
      const lastUserIdx = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') return i;
        }
        return -1;
      })();
      if (lastUserIdx >= 0) {
        const target = messages[lastUserIdx];
        const parts: Array<Record<string, unknown>> = [];
        if (target.content) {
          parts.push({ type: 'text', text: target.content });
        }
        for (const img of images) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
            },
          });
        }
        messagesToSend = messages.map((m, i) =>
          i === lastUserIdx ? { role: m.role, content: parts } : m
        );
      }
    }

    // Build request body with optional sampler params.
    // Unknown fields are ignored by most providers.
    const body: Record<string, unknown> = {
      stream: true,
      max_tokens: generationOptions?.maxTokens ?? 1024,
      temperature: generationOptions?.temperature ?? 0.9,
      model: model || 'gpt-4o',
    };

    // Phase 10.3: text completion mode sends a single prompt string
    // to a separate backend endpoint.
    let endpoint: string;
    if (textCompletionMode) {
      // In text-completion mode, instruct mode has already flattened
      // messages into a single user message containing the full prompt.
      const prompt = messages.length === 1
        ? messages[0].content
        : messages.map(m => m.content).join('\n');
      body.prompt = prompt;
      endpoint = '/api/backends/text-completions/generate';
    } else {
      body.messages = messagesToSend;
      body.chat_completion_source = provider || 'openai';
      endpoint = '/api/backends/chat-completions/generate';
    }

    if (generationOptions) {
      if (generationOptions.topP !== undefined) body.top_p = generationOptions.topP;
      if (generationOptions.topK !== undefined && generationOptions.topK > 0) {
        body.top_k = generationOptions.topK;
      }
      if (generationOptions.minP !== undefined && generationOptions.minP > 0) {
        body.min_p = generationOptions.minP;
      }
      if (generationOptions.frequencyPenalty !== undefined) {
        body.frequency_penalty = generationOptions.frequencyPenalty;
      }
      if (generationOptions.presencePenalty !== undefined) {
        body.presence_penalty = generationOptions.presencePenalty;
      }
      if (generationOptions.repetitionPenalty !== undefined && generationOptions.repetitionPenalty !== 1.0) {
        body.repetition_penalty = generationOptions.repetitionPenalty;
      }
      if (generationOptions.stopStrings && generationOptions.stopStrings.length > 0) {
        body.stop = generationOptions.stopStrings;
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      credentials: 'include',
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Generation failed' }));
      // Handle various SillyTavern error formats
      const errorMessage =
        typeof errorData.error === 'string'
          ? errorData.error
          : errorData.message ||
            errorData.error?.message ||
            (errorData.error === true ? 'AI generation failed - check API key configuration' : `HTTP ${response.status}`);
      throw new Error(errorMessage);
    }

    return response.body;
  },

  // Save chat to backend
  async saveChat(
    avatarUrl: string,
    fileName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chatData: any[]
  ): Promise<void> {
    // First, call get to ensure the chat directory exists (backend creates it if not)
    await apiRequest('/api/chats/get', {
      method: 'POST',
      body: JSON.stringify({
        file_name: '__ensure_dir__',
        avatar_url: avatarUrl,
      }),
    }).catch(() => {
      // Ignore errors - we just want to ensure directory exists
    });

    // Now save the chat
    const result = await apiRequest<{ result?: string; message?: string; error?: string }>('/api/chats/save', {
      method: 'POST',
      body: JSON.stringify({
        avatar_url: avatarUrl,
        file_name: fileName,
        chat: chatData,
        force: true, // Bypass integrity check
      }),
    });

    console.log('[API] Save result:', result);

    // Check if save actually succeeded
    if (result && typeof result === 'object' && ('message' in result || 'error' in result)) {
      throw new Error(result.message || result.error || 'Save failed');
    }
  },

  // Create a new chat file name (without .jsonl extension - backend adds it)
  async createChat(characterName: string): Promise<string> {
    const timestamp = Date.now();
    const fileName = `${characterName} - ${new Date(timestamp).toISOString().split('T')[0]}@${timestamp}`;
    return fileName;
  },

  async deleteChat(avatarUrl: string, fileName: string): Promise<void> {
    await apiRequest('/api/chats/delete', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl, chatfile: fileName }),
    });
  },

  async renameChat(avatarUrl: string, originalFile: string, renamedFile: string): Promise<string> {
    const result = await apiRequest<{ ok: boolean; sanitizedFileName: string }>('/api/chats/rename', {
      method: 'POST',
      body: JSON.stringify({
        avatar_url: avatarUrl,
        original_file: originalFile,
        renamed_file: renamedFile,
      }),
    });
    return result.sanitizedFileName;
  },

  async importChat(
    avatarUrl: string,
    characterName: string,
    file: File,
    userName = 'User'
  ): Promise<string[]> {
    const formData = new FormData();
    formData.append('avatar_url', avatarUrl);
    formData.append('character_name', characterName);
    formData.append('user_name', userName);
    formData.append('file_type', file.name.endsWith('.json') ? 'json' : 'jsonl');
    formData.append('file', file);

    const response = await fetch('/api/chats/import', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) throw new Error('Import failed');
    const data = await response.json();
    if (data.error) throw new Error('Import failed: invalid format');
    return data.fileNames ?? [];
  },
};

interface ChatMessage {
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  send_date: number;
  character_avatar?: string; // For group chats
}

// Admin user management types
export interface AdminUserInfo {
  handle: string;
  name: string;
  avatar: string;
  /** @deprecated Shim derived from groupId. Use `permissions` instead. */
  admin: boolean;
  /** @deprecated Shim derived from groupId. Use `permissions` instead. */
  role: import('../types').UserRole;
  /** Current permission group id. */
  groupId: string | null;
  /** Resolved permission list. */
  permissions?: import('../types').Permission[];
  enabled: boolean;
  created?: number;
  password: boolean;
}

export const adminApi = {
  async getUsers(): Promise<AdminUserInfo[]> {
    return apiRequest('/api/users/get', { method: 'POST' });
  },

  /**
   * @deprecated Use `setUserGroup` instead. Kept so older UI code that still
   *   reads the role dropdown keeps working while the UI is being migrated.
   */
  async setRole(handle: string, role: import('../types').UserRole): Promise<void> {
    await apiRequest('/api/users/set-role', {
      method: 'POST',
      body: JSON.stringify({ handle, role }),
    });
  },

  /** Assigns `handle` to a permission group. */
  async setUserGroup(handle: string, groupId: string): Promise<void> {
    await apiRequest('/api/users/set-group', {
      method: 'POST',
      body: JSON.stringify({ handle, groupId }),
    });
  },

  async enableUser(handle: string): Promise<void> {
    await apiRequest('/api/users/enable', {
      method: 'POST',
      body: JSON.stringify({ handle }),
    });
  },

  async disableUser(handle: string): Promise<void> {
    await apiRequest('/api/users/disable', {
      method: 'POST',
      body: JSON.stringify({ handle }),
    });
  },

  async deleteUser(handle: string, purge = false): Promise<void> {
    await apiRequest('/api/users/delete', {
      method: 'POST',
      body: JSON.stringify({ handle, purge }),
    });
  },
};

// Permission groups API
export const permissionGroupsApi = {
  /** List every permission group (id, name, perms, etc.). */
  async list(): Promise<import('../types').PermissionGroup[]> {
    return apiRequest('/api/permission-groups', { method: 'GET' });
  },

  /** Fetch the master permission vocabulary, grouped by category. */
  async getVocabulary(): Promise<{
    permissions: import('../types').Permission[];
    categories: Record<string, import('../types').Permission[]>;
  }> {
    return apiRequest('/api/permissions', { method: 'GET' });
  },

  async create(input: {
    name: string;
    description: string;
    permissions: import('../types').Permission[];
  }): Promise<import('../types').PermissionGroup> {
    return apiRequest('/api/permission-groups/create', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async update(
    id: string,
    patch: {
      name?: string;
      description?: string;
      permissions?: import('../types').Permission[];
    },
  ): Promise<import('../types').PermissionGroup> {
    return apiRequest('/api/permission-groups/update', {
      method: 'POST',
      body: JSON.stringify({ id, ...patch }),
    });
  },

  async delete(id: string): Promise<void> {
    await apiRequest('/api/permission-groups/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

// Invitation types
export interface Invitation {
  id: string;
  token: string;
  /** Permission group id to assign on accept. */
  groupId: string;
  /** @deprecated Shim derived from groupId. */
  role?: import('../types').UserRole;
  label: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  usedBy: string | null;
  usedAt: number | null;
  status: 'pending' | 'accepted' | 'revoked';
}

export const invitationsApi = {
  async create(groupId: string, label?: string, expiresIn?: number): Promise<Invitation> {
    return apiRequest('/api/invitations/create', {
      method: 'POST',
      body: JSON.stringify({ groupId, label: label ?? '', expiresIn }),
    });
  },

  async list(): Promise<Invitation[]> {
    return apiRequest('/api/invitations/list', { method: 'POST' });
  },

  async revoke(id: string): Promise<Invitation> {
    return apiRequest('/api/invitations/revoke', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  async delete(id: string): Promise<void> {
    return apiRequest('/api/invitations/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  async validate(token: string): Promise<{
    valid: boolean;
    groupId?: string;
    groupName?: string;
    role?: string;
    label?: string;
    error?: string;
  }> {
    return apiRequest(`/api/invitations/validate/${encodeURIComponent(token)}`);
  },

  async accept(token: string, handle: string, name: string, password?: string): Promise<{ handle: string }> {
    return apiRequest('/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, handle, name, password }),
    });
  },
};

// Settings types
export interface SecretState {
  id: string;
  label: string;
  active: boolean;
  // value is masked - only last 3 chars shown
}

export interface SecretsResponse {
  [key: string]: SecretState[] | boolean;
}

export const SECRET_KEYS = {
  OPENAI: 'api_key_openai',
  CLAUDE: 'api_key_claude',
  GOOGLE: 'api_key_makersuite',
  MISTRAL: 'api_key_mistralai',
  GROQ: 'api_key_groq',
  OPENROUTER: 'api_key_openrouter',
  // Phase 10.2
  COHERE: 'api_key_cohere',
  DEEPSEEK: 'api_key_deepseek',
  PERPLEXITY: 'api_key_perplexity',
  // Phase 10.4 — additional native-routed providers added via the provider catalog.
  XAI: 'api_key_xai',
  AI21: 'api_key_ai21',
  VERTEXAI: 'api_key_vertexai',
  ZEROONEAI: 'api_key_01ai',
  MOONSHOT: 'api_key_moonshot',
  ZHIPU: 'api_key_zhipu',
  NANOGPT: 'api_key_nanogpt',
  BLOCKENTROPY: 'api_key_blockentropy',
  POLLINATIONS: 'api_key_pollinations',
  AIMLAPI: 'api_key_aimlapi',
  ELECTRONHUB: 'api_key_electronhub',
  // Used by the 'custom' chat_completion_source when a user-added provider is active.
  CUSTOM: 'api_key_custom',
} as const;

// PROVIDERS is kept as a getter re-exported from providerCatalog so call sites
// that iterate over `PROVIDERS` (e.g. the global-keys section in
// AISettingsPage) see the full list of native-routed providers without
// caring about the user-added ones. The `custom` entry is appended so the
// existing "Custom / Local" selection path keeps working.
//
// For the full merged list (built-in catalog + user providers), import
// BUILTIN_CATALOG from providerCatalog directly.
import { NATIVE_PROVIDERS as CATALOG_NATIVE_PROVIDERS } from './providerCatalog';

export const PROVIDERS = [
  ...CATALOG_NATIVE_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    secretKey: p.secretKey,
    models: p.defaultModels as readonly string[],
  })),
  // Custom / local: no secret key required; URL and model are stored directly in oai_settings.
  { id: 'custom', name: 'Custom / Local', secretKey: '', models: [] as readonly string[] },
] as const;

export const settingsApi = {
  // Get current secrets state (masked)
  async getSecrets(): Promise<SecretsResponse> {
    return apiRequest('/api/secrets/read', { method: 'POST' });
  },

  // Write/update a secret
  async writeSecret(key: string, value: string, label?: string): Promise<void> {
    await apiRequest('/api/secrets/write', {
      method: 'POST',
      body: JSON.stringify({ key, value, label }),
    });
  },

  // Delete a secret
  async deleteSecret(key: string, id?: string): Promise<void> {
    await apiRequest('/api/secrets/delete', {
      method: 'POST',
      body: JSON.stringify({ key, id }),
    });
  },

  // Get user settings
  async getSettings(): Promise<{ settings: Record<string, unknown> }> {
    return apiRequest('/api/settings/get', { method: 'POST' });
  },

  // Save user settings
  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    await apiRequest('/api/settings/save', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },

  // --- Global secrets (owner-managed, shared with all users) ---

  async getGlobalSecrets(): Promise<SecretsResponse> {
    try {
      return await apiRequest('/api/secrets/global/read', { method: 'POST' });
    } catch {
      return {};
    }
  },

  async writeGlobalSecret(key: string, value: string, label?: string): Promise<void> {
    await apiRequest('/api/secrets/global/write', {
      method: 'POST',
      body: JSON.stringify({ key, value, label }),
    });
  },

  async deleteGlobalSecret(key: string, id?: string): Promise<void> {
    await apiRequest('/api/secrets/global/delete', {
      method: 'POST',
      body: JSON.stringify({ key, id }),
    });
  },

  async getGlobalSharingStatus(): Promise<{ enabled: boolean }> {
    try {
      return await apiRequest('/api/secrets/global/status', { method: 'POST' });
    } catch {
      return { enabled: false };
    }
  },

  async setGlobalSharing(enabled: boolean): Promise<void> {
    await apiRequest('/api/secrets/global/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },

  // ---------------------------------------------------------------------
  // Provider catalog — backend helper for docs-URL extraction (Phase 10.4).
  //
  // The backend endpoint is served from the sammygallo/sillytavern fork.
  // On backends that don't have the route yet, this throws a 404 and the
  // caller should feature-detect and hide the AI mode in the UI.
  // ---------------------------------------------------------------------

  async extractProviderFromUrl(
    url: string,
  ): Promise<{ ok: true; provider: ExtractedProvider } | { ok: false; error: string }> {
    try {
      const response = await apiRequest<{ ok?: boolean; provider?: ExtractedProvider; error?: string }>(
        '/api/providers/extract',
        {
          method: 'POST',
          body: JSON.stringify({ url }),
        },
      );
      if (response.ok && response.provider) {
        return { ok: true, provider: response.provider };
      }
      return { ok: false, error: response.error || 'Extraction failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  },

  /** Probe whether the /api/providers/extract helper endpoint exists. */
  async providerExtractorSupported(): Promise<boolean> {
    try {
      // Cheap GET-style probe: a HEAD request against the POST route returns
      // 405 (Method Not Allowed) if the route exists, 404 if it doesn't.
      const token = await getCsrfToken();
      const res = await fetch('/api/providers/extract', {
        method: 'OPTIONS',
        headers: { 'X-CSRF-Token': token },
        credentials: 'include',
      });
      return res.status !== 404;
    } catch {
      return false;
    }
  },
};

/** Shape returned by /api/providers/extract. Mirror of UserProvider from providerCatalog. */
export interface ExtractedProvider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModels: string[];
  modelListEndpoint?: string;
  docsUrl?: string;
  description?: string;
}

// Sprites/Expressions API
export interface SpriteInfo {
  label: string;
  path: string;
}

export const spritesApi = {
  // Get all sprites for a character
  async getSprites(characterName: string): Promise<SpriteInfo[]> {
    return apiRequest(`/api/sprites/get?name=${encodeURIComponent(characterName)}`, {
      method: 'GET',
    });
  },

  // Upload a single sprite
  async uploadSprite(characterName: string, label: string, file: File): Promise<{ ok: boolean }> {
    const token = await getCsrfToken();
    const formData = new FormData();
    // Field names must match what SillyTavern server expects:
    // - 'name': character/folder name
    // - 'label': expression label (e.g., 'joy', 'sadness')
    // - 'avatar': the image file (NOT 'file')
    formData.append('name', characterName);
    formData.append('label', label);
    formData.append('avatar', file);

    console.log('[Sprites] Uploading:', { characterName, label, fileName: file.name });

    const response = await fetch('/api/sprites/upload', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': token,
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sprites] Upload failed:', { status: response.status, error: errorText });
      throw new Error(`Failed to upload sprite: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[Sprites] Upload success:', result);
    return result;
  },

  // Delete a sprite
  async deleteSprite(characterName: string, label: string): Promise<void> {
    await apiRequest('/api/sprites/delete', {
      method: 'POST',
      body: JSON.stringify({ name: characterName, label }),
    });
  },
};
