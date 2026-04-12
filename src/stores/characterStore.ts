import { create } from 'zustand';
import { api, type CharacterInfo, type CharacterCreateData, type CharacterEditData } from '../api/client';
import {
  extractCharacterFromPNG,
  extractCharacterBook,
  parseCharacterFromJSON,
  cardToCharacterInfo,
  embedCharacterInPNG,
  exportCharacterAsJSON,
  downloadFile,
  fetchImageAsBlob,
  type CharacterBookV2,
  type CharacterCardV2,
  type CharacterExportData,
} from '../utils/characterCard';
import {
  useWorldInfoStore,
  bookToCharacterBookV2,
} from './worldInfoStore';
import { useCharacterOwnershipStore } from './characterOwnershipStore';
import { useAuthStore } from './authStore';

const FAVORITES_KEY = 'sillytavern_character_favorites';
const LINKED_BOOKS_KEY = 'sillytavern_character_linked_books_v1';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr: string[] = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
}

function loadLinkedBooks(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(LINKED_BOOKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string[]>;
    }
    return {};
  } catch {
    return {};
  }
}

function saveLinkedBooks(map: Record<string, string[]>) {
  try {
    localStorage.setItem(LINKED_BOOKS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/security errors
  }
}

export type CharacterSortMode = 'name' | 'date_added' | 'date_last_chat' | 'recent_chat';

interface CharacterState {
  characters: CharacterInfo[];
  selectedCharacter: CharacterInfo | null;
  // Group chat support
  groupChatCharacters: CharacterInfo[];
  isGroupChatMode: boolean;
  isLoading: boolean;
  isCreating: boolean;
  isEditing: boolean;
  isImporting: boolean;
  isExporting: boolean;
  isDuplicating: boolean;
  error: string | null;
  // Organization state
  favorites: Set<string>;
  searchQuery: string;
  selectedTags: Set<string>;
  showFavoritesOnly: boolean;
  sortMode: CharacterSortMode;
  // Per-character extra lorebooks to auto-activate (avatar → book ids).
  // The embedded book (if any) is tracked on the WI book itself via
  // `ownerCharacterAvatar` and is NOT duplicated here.
  linkedBookIdsByAvatar: Record<string, string[]>;

  // Actions
  fetchCharacters: () => Promise<void>;
  selectCharacter: (avatar: string) => Promise<void>;
  createCharacter: (data: CharacterCreateData, avatarFile?: File) => Promise<string | null>;
  updateCharacter: (data: CharacterEditData, avatarFile?: File) => Promise<boolean>;
  deleteCharacter: (avatar: string) => Promise<boolean>;
  duplicateCharacter: (avatar: string) => Promise<string | null>;
  clearSelection: () => void;
  clearError: () => void;
  // Group chat actions
  toggleGroupChatCharacter: (avatar: string) => Promise<void>;
  startGroupChat: () => void;
  exitGroupChat: () => void;
  isCharacterInGroup: (avatar: string) => boolean;
  setGroupChatCharacters: (avatars: string[]) => Promise<void>;
  /** Reorder the in-memory group roster without hitting the API. */
  reorderGroupChatCharacters: (avatars: string[]) => void;
  // Import/Export actions
  importCharacter: (
    file: File
  ) => Promise<{
    data: Partial<CharacterInfo>;
    avatarFile?: File;
    characterBook?: CharacterBookV2;
  } | null>;
  exportCharacterAsPNG: (character: CharacterInfo) => Promise<void>;
  exportCharacterAsJSON: (character: CharacterInfo) => void;
  // Character-embedded lorebook actions
  registerEmbeddedBookFromCard: (
    avatar: string,
    characterBook: CharacterBookV2,
    fallbackName: string
  ) => void;
  getLinkedBookIds: (avatar: string) => string[];
  setLinkedBookIds: (avatar: string, ids: string[]) => void;
  /** Ids to merge with the globally-active ids during scan. */
  getActiveBookIdsForCharacter: (avatar: string) => string[];
  // Organization actions
  toggleFavorite: (avatar: string) => void;
  isFavorite: (avatar: string) => boolean;
  setSearchQuery: (q: string) => void;
  toggleTagFilter: (tag: string) => void;
  clearTagFilters: () => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setSortMode: (mode: CharacterSortMode) => void;
  getAllTags: () => string[];
  getFilteredCharacters: () => CharacterInfo[];
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  selectedCharacter: null,
  groupChatCharacters: [],
  isGroupChatMode: false,
  isLoading: false,
  isCreating: false,
  isEditing: false,
  isImporting: false,
  isExporting: false,
  isDuplicating: false,
  error: null,
  favorites: loadFavorites(),
  searchQuery: '',
  selectedTags: new Set<string>(),
  showFavoritesOnly: false,
  sortMode: 'name' as CharacterSortMode,
  linkedBookIdsByAvatar: loadLinkedBooks(),

  fetchCharacters: async () => {
    set({ isLoading: true, error: null });
    try {
      const characters = await api.getCharacters();
      set({ characters, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch characters',
      });
    }
  },

  selectCharacter: async (avatar: string) => {
    const { characters } = get();
    let character = characters.find((c) => c.avatar === avatar);

    if (!character) {
      set({ error: 'Character not found' });
      return;
    }

    // If we don't have full data, fetch it
    if (!character.first_mes) {
      try {
        set({ isLoading: true });
        const fullCharacter = await api.getCharacter(avatar);
        character = { ...character, ...fullCharacter };

        // Update in the list
        set({
          characters: characters.map((c) => (c.avatar === avatar ? character! : c)),
          isLoading: false,
        });
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load character',
        });
        return;
      }
    }

    set({ selectedCharacter: character, isGroupChatMode: false, groupChatCharacters: [] });
  },

  clearSelection: () => set({ selectedCharacter: null }),

  createCharacter: async (data: CharacterCreateData, avatarFile?: File) => {
    set({ isCreating: true, error: null });
    try {
      const avatarUrl = await api.createCharacter(data, avatarFile);
      // Record ownership for the creating user
      if (avatarUrl) {
        const currentUser = useAuthStore.getState().currentUser;
        if (currentUser) {
          useCharacterOwnershipStore.getState().setOwner(avatarUrl, currentUser.handle);
        }
      }
      // Refresh the character list
      await get().fetchCharacters();
      set({ isCreating: false });
      return avatarUrl;
    } catch (error) {
      set({
        isCreating: false,
        error: error instanceof Error ? error.message : 'Failed to create character',
      });
      return null;
    }
  },

  updateCharacter: async (data: CharacterEditData, avatarFile?: File) => {
    set({ isEditing: true, error: null });
    try {
      await api.editCharacter(data, avatarFile);
      // Refresh the character list and selected character
      await get().fetchCharacters();
      // Re-select to get updated data
      const { selectedCharacter } = get();
      if (selectedCharacter?.avatar === data.avatar_url) {
        const updatedCharacter = await api.getCharacter(data.avatar_url);
        set({ selectedCharacter: updatedCharacter });
      }
      set({ isEditing: false });
      return true;
    } catch (error) {
      set({
        isEditing: false,
        error: error instanceof Error ? error.message : 'Failed to update character',
      });
      return false;
    }
  },

  deleteCharacter: async (avatar: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteCharacter(avatar);
      // Clear selection if deleting the selected character
      const { selectedCharacter, favorites, linkedBookIdsByAvatar } = get();
      if (selectedCharacter?.avatar === avatar) {
        set({ selectedCharacter: null });
      }
      // Also remove from favorites
      if (favorites.has(avatar)) {
        const newFavorites = new Set(favorites);
        newFavorites.delete(avatar);
        saveFavorites(newFavorites);
        set({ favorites: newFavorites });
      }
      // Clean up ownership data
      useCharacterOwnershipStore.getState().removeOwnership(avatar);
      // Clean up character-embedded lorebook and linked-book references
      useWorldInfoStore.getState().deleteCharacterBook(avatar);
      if (linkedBookIdsByAvatar[avatar]) {
        const nextLinks = { ...linkedBookIdsByAvatar };
        delete nextLinks[avatar];
        saveLinkedBooks(nextLinks);
        set({ linkedBookIdsByAvatar: nextLinks });
      }
      // Refresh the character list
      await get().fetchCharacters();
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to delete character',
      });
      return false;
    }
  },

  duplicateCharacter: async (avatar: string) => {
    set({ isDuplicating: true, error: null });
    try {
      const newAvatar = await api.duplicateCharacter(avatar);
      // Record the duplicating user as owner of the new copy
      if (newAvatar) {
        const currentUser = useAuthStore.getState().currentUser;
        if (currentUser) {
          const ownershipStore = useCharacterOwnershipStore.getState();
          const originalVisibility = ownershipStore.getVisibility(avatar);
          ownershipStore.setOwner(newAvatar, currentUser.handle);
          ownershipStore.setVisibility(newAvatar, originalVisibility);
        }
      }
      // Refresh list to show the new character
      await get().fetchCharacters();
      set({ isDuplicating: false });
      return newAvatar;
    } catch (error) {
      set({
        isDuplicating: false,
        error: error instanceof Error ? error.message : 'Failed to duplicate character',
      });
      return null;
    }
  },

  clearError: () => set({ error: null }),

  // ---- Organization actions ----
  toggleFavorite: (avatar: string) => {
    const { favorites } = get();
    const newFavorites = new Set(favorites);
    if (newFavorites.has(avatar)) {
      newFavorites.delete(avatar);
    } else {
      newFavorites.add(avatar);
    }
    saveFavorites(newFavorites);
    set({ favorites: newFavorites });
  },

  isFavorite: (avatar: string) => get().favorites.has(avatar),

  setSearchQuery: (q: string) => set({ searchQuery: q }),

  toggleTagFilter: (tag: string) => {
    const { selectedTags } = get();
    const newTags = new Set(selectedTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    set({ selectedTags: newTags });
  },

  clearTagFilters: () => set({ selectedTags: new Set<string>() }),

  setShowFavoritesOnly: (show: boolean) => set({ showFavoritesOnly: show }),

  setSortMode: (mode: CharacterSortMode) => set({ sortMode: mode }),

  getAllTags: () => {
    const { characters } = get();
    const tagSet = new Set<string>();
    for (const char of characters) {
      const tags = char.tags || char.data?.tags || [];
      for (const tag of tags) {
        if (tag && typeof tag === 'string') {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  },

  getFilteredCharacters: () => {
    const {
      characters,
      searchQuery,
      selectedTags,
      showFavoritesOnly,
      favorites,
      sortMode,
    } = get();

    const query = searchQuery.trim().toLowerCase();

    const filtered = characters.filter((char) => {
      // Favorites filter
      if (showFavoritesOnly && !favorites.has(char.avatar)) {
        return false;
      }

      // Tag filter (AND logic: must match all selected tags)
      if (selectedTags.size > 0) {
        const charTags = (char.tags || char.data?.tags || []).map((t) => t.toLowerCase());
        for (const tag of selectedTags) {
          if (!charTags.includes(tag.toLowerCase())) {
            return false;
          }
        }
      }

      // Search filter
      if (query) {
        const name = (char.name || '').toLowerCase();
        const desc = (char.description || char.data?.description || '').toLowerCase();
        const personality = (char.personality || char.data?.personality || '').toLowerCase();
        const creator = (char.creator || char.data?.creator || '').toLowerCase();
        if (
          !name.includes(query) &&
          !desc.includes(query) &&
          !personality.includes(query) &&
          !creator.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      // Favorites always bubble to the top
      const aFav = favorites.has(a.avatar);
      const bFav = favorites.has(b.avatar);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;

      switch (sortMode) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'date_added':
          return (b.date_added || 0) - (a.date_added || 0);
        case 'date_last_chat':
        case 'recent_chat':
          return (b.date_last_chat || 0) - (a.date_last_chat || 0);
        default:
          return 0;
      }
    });

    return sorted;
  },

  // Group chat actions
  toggleGroupChatCharacter: async (avatar: string) => {
    const { characters, groupChatCharacters } = get();
    const isInGroup = groupChatCharacters.some((c) => c.avatar === avatar);

    if (isInGroup) {
      // Remove from group
      set({
        groupChatCharacters: groupChatCharacters.filter((c) => c.avatar !== avatar),
      });
    } else {
      // Add to group - fetch full character data if needed
      let character = characters.find((c) => c.avatar === avatar);
      if (!character) return;

      if (!character.first_mes) {
        try {
          const fullCharacter = await api.getCharacter(avatar);
          character = { ...character, ...fullCharacter };
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to load character' });
          return;
        }
      }

      set({
        groupChatCharacters: [...groupChatCharacters, character],
      });
    }
  },

  startGroupChat: () => {
    const { groupChatCharacters } = get();
    if (groupChatCharacters.length < 2) {
      set({ error: 'Select at least 2 characters for group chat' });
      return;
    }
    set({
      isGroupChatMode: true,
      selectedCharacter: null, // Clear single character selection
    });
  },

  exitGroupChat: () => {
    set({
      isGroupChatMode: false,
      groupChatCharacters: [],
    });
  },

  isCharacterInGroup: (avatar: string) => {
    return get().groupChatCharacters.some((c) => c.avatar === avatar);
  },

  setGroupChatCharacters: async (avatars: string[]) => {
    const { characters } = get();
    const groupCharacters: CharacterInfo[] = [];

    for (const avatar of avatars) {
      let character = characters.find((c) => c.avatar === avatar);
      if (character) {
        // Fetch full data if needed
        if (!character.first_mes) {
          try {
            const fullCharacter = await api.getCharacter(avatar);
            character = { ...character, ...fullCharacter };
          } catch {
            // Use what we have
          }
        }
        groupCharacters.push(character);
      }
    }

    set({
      groupChatCharacters: groupCharacters,
      isGroupChatMode: true,
      selectedCharacter: null,
    });
  },

  reorderGroupChatCharacters: (avatars: string[]) => {
    const { groupChatCharacters } = get();
    const byAvatar = new Map(groupChatCharacters.map((c) => [c.avatar, c]));
    const reordered: CharacterInfo[] = [];
    for (const a of avatars) {
      const c = byAvatar.get(a);
      if (c) reordered.push(c);
    }
    // Append any members not included in the incoming list so we never lose
    // a participant to a stale payload.
    for (const c of groupChatCharacters) {
      if (!avatars.includes(c.avatar)) reordered.push(c);
    }
    set({ groupChatCharacters: reordered });
  },

  // Import/Export actions
  importCharacter: async (file: File) => {
    set({ isImporting: true, error: null });
    try {
      let characterData: CharacterCardV2 | CharacterExportData | null = null;
      let avatarFile: File | undefined;

      const isPNG = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
      const isJSON = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');

      if (isPNG) {
        // Extract character data from PNG
        characterData = await extractCharacterFromPNG(file);
        if (!characterData) {
          throw new Error('No character data found in PNG file');
        }
        // Use the PNG as the avatar
        avatarFile = file;
      } else if (isJSON) {
        // Parse JSON file
        characterData = await parseCharacterFromJSON(file);
      } else {
        throw new Error('Unsupported file format. Please use PNG or JSON files.');
      }

      const info = cardToCharacterInfo(characterData);
      const characterBook = extractCharacterBook(characterData) || undefined;
      set({ isImporting: false });
      return { data: info, avatarFile, characterBook };
    } catch (error) {
      set({
        isImporting: false,
        error: error instanceof Error ? error.message : 'Failed to import character',
      });
      return null;
    }
  },

  exportCharacterAsPNG: async (character: CharacterInfo) => {
    set({ isExporting: true, error: null });
    try {
      // Fetch the character's avatar image
      const avatarUrl = `/characters/${encodeURIComponent(character.avatar)}`;
      const imageBlob = await fetchImageAsBlob(avatarUrl);

      // Include the character's embedded lorebook when exporting
      const embedded = useWorldInfoStore.getState().getCharacterBook(character.avatar);
      const characterBook = embedded ? bookToCharacterBookV2(embedded) : undefined;

      // Embed character data in the PNG
      const pngBlob = await embedCharacterInPNG(imageBlob, character, characterBook);

      // Download the file
      const filename = `${character.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      downloadFile(pngBlob, filename);

      set({ isExporting: false });
    } catch (error) {
      set({
        isExporting: false,
        error: error instanceof Error ? error.message : 'Failed to export character',
      });
    }
  },

  exportCharacterAsJSON: (character: CharacterInfo) => {
    try {
      const embedded = useWorldInfoStore.getState().getCharacterBook(character.avatar);
      const characterBook = embedded ? bookToCharacterBookV2(embedded) : undefined;
      const jsonBlob = exportCharacterAsJSON(character, characterBook);
      const filename = `${character.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      downloadFile(jsonBlob, filename);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to export character',
      });
    }
  },

  // ---- Character-embedded lorebook actions ----
  registerEmbeddedBookFromCard: (avatar, characterBook, fallbackName) => {
    useWorldInfoStore
      .getState()
      .upsertCharacterBook(avatar, characterBook, fallbackName);
  },

  getLinkedBookIds: (avatar) => {
    return get().linkedBookIdsByAvatar[avatar] || [];
  },

  setLinkedBookIds: (avatar, ids) => {
    // Drop missing books + character-owned books belonging to a different
    // character. A user linking a book for character A should not be able
    // to scope-activate character B's embedded book.
    const allBooks = useWorldInfoStore.getState().books;
    const valid = ids.filter((id) => {
      const book = allBooks.find((b) => b.id === id);
      if (!book) return false;
      if (book.ownerCharacterAvatar && book.ownerCharacterAvatar !== avatar) {
        return false;
      }
      return true;
    });
    const deduped = Array.from(new Set(valid));
    const next = { ...get().linkedBookIdsByAvatar, [avatar]: deduped };
    if (deduped.length === 0) {
      delete next[avatar];
    }
    saveLinkedBooks(next);
    set({ linkedBookIdsByAvatar: next });
  },

  getActiveBookIdsForCharacter: (avatar) => {
    if (!avatar) return [];
    const ids: string[] = [];
    const embedded = useWorldInfoStore.getState().getCharacterBook(avatar);
    if (embedded) ids.push(embedded.id);
    const linked = get().linkedBookIdsByAvatar[avatar] || [];
    const allBooks = useWorldInfoStore.getState().books;
    for (const linkedId of linked) {
      if (ids.includes(linkedId)) continue; // avoid double-adding the embedded id
      const book = allBooks.find((b) => b.id === linkedId);
      if (!book) continue;
      if (book.ownerCharacterAvatar && book.ownerCharacterAvatar !== avatar) {
        continue;
      }
      ids.push(linkedId);
    }
    return ids;
  },
}));
