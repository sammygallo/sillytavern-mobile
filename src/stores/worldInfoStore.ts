import { create } from 'zustand';

// Where a world info entry is injected relative to the character definitions
// and the rest of the prompt. These map 1:1 onto SillyTavern's position codes
// (0-4) for import/export compatibility.
export type WorldInfoPosition =
  | 'before_char' // Before character description (ST position 0)
  | 'after_char' // After character description (ST position 1)
  | 'before_an' // Before author's note / jailbreak (ST position 2)
  | 'after_an' // After author's note / post-history (ST position 3)
  | 'at_depth'; // Injected at a specific depth in the chat (ST position 4)

export interface WorldInfoEntry {
  id: string;
  /** Primary keywords – entry activates when ANY appears in scanned text. */
  keys: string[];
  /** Lore content injected into the prompt. Supports macros. */
  content: string;
  /** User comment, shown in the UI only. */
  comment: string;
  /** When false, the entry is ignored entirely. */
  enabled: boolean;
  /** When true, entry is always injected regardless of keyword scanning. */
  constant: boolean;
  /** When true, keyword matching respects case. */
  caseSensitive: boolean;
  /** Where this entry is injected. */
  position: WorldInfoPosition;
  /** Depth from the END of the chat (for position === 'at_depth'). */
  depth: number;
  /** Insertion order within the same position group. Higher = later. */
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorldInfoBook {
  id: string;
  name: string;
  entries: WorldInfoEntry[];
  createdAt: number;
  updatedAt: number;
}

const BOOKS_KEY = 'sillytavern_worldinfo_books_v1';
const ACTIVE_BOOKS_KEY = 'sillytavern_worldinfo_active_books_v1';
const SCAN_DEPTH_KEY = 'sillytavern_worldinfo_scan_depth_v1';

const DEFAULT_SCAN_DEPTH = 4;

export const DEFAULT_ENTRY: Omit<
  WorldInfoEntry,
  'id' | 'createdAt' | 'updatedAt'
> = {
  keys: [],
  content: '',
  comment: '',
  enabled: true,
  constant: false,
  caseSensitive: false,
  position: 'before_char',
  depth: 4,
  order: 100,
};

function loadBooks(): WorldInfoBook[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    return raw ? (JSON.parse(raw) as WorldInfoBook[]) : [];
  } catch {
    return [];
  }
}

function saveBooks(books: WorldInfoBook[]) {
  try {
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
  } catch {
    // ignore quota/security errors
  }
}

function loadActiveBooks(): string[] {
  try {
    const raw = localStorage.getItem(ACTIVE_BOOKS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveActiveBooks(ids: string[]) {
  try {
    localStorage.setItem(ACTIVE_BOOKS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function loadScanDepth(): number {
  try {
    const raw = localStorage.getItem(SCAN_DEPTH_KEY);
    const n = raw ? parseInt(raw, 10) : DEFAULT_SCAN_DEPTH;
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_SCAN_DEPTH;
  } catch {
    return DEFAULT_SCAN_DEPTH;
  }
}

function saveScanDepth(depth: number) {
  try {
    localStorage.setItem(SCAN_DEPTH_KEY, String(depth));
  } catch {
    // ignore
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- SillyTavern lorebook format interop --------------------------------
//
// ST stores WI as { entries: { "<uid>": { uid, key[], keysecondary[], comment,
// content, constant, selective, order, position, disable, depth, ... } } }.
// position is an integer:  0 = Before Char, 1 = After Char, 2 = Before AN,
// 3 = After AN, 4 = @Depth, 5 = Before Examples, 6 = After Examples.
// We only support 0-4 in Phase 4.1; anything else maps to 'before_char'.

const ST_POS_TO_LOCAL: Record<number, WorldInfoPosition> = {
  0: 'before_char',
  1: 'after_char',
  2: 'before_an',
  3: 'after_an',
  4: 'at_depth',
  5: 'before_char',
  6: 'after_char',
};

const LOCAL_POS_TO_ST: Record<WorldInfoPosition, number> = {
  before_char: 0,
  after_char: 1,
  before_an: 2,
  after_an: 3,
  at_depth: 4,
};

interface StEntry {
  uid?: number;
  key?: string[];
  keysecondary?: string[];
  comment?: string;
  content?: string;
  constant?: boolean;
  vectorized?: boolean;
  selective?: boolean;
  order?: number;
  position?: number;
  disable?: boolean;
  depth?: number;
  displayIndex?: number;
  caseSensitive?: boolean | null;
  addMemo?: boolean;
  name?: string;
}

interface StBook {
  entries?: Record<string, StEntry> | StEntry[];
  name?: string;
}

export function entryFromStFormat(raw: StEntry): WorldInfoEntry {
  const now = Date.now();
  return {
    id: generateId('wi'),
    keys: Array.isArray(raw.key)
      ? raw.key.filter((k): k is string => typeof k === 'string' && !!k.trim())
      : [],
    content: typeof raw.content === 'string' ? raw.content : '',
    comment: typeof raw.comment === 'string' ? raw.comment : '',
    enabled: raw.disable === true ? false : true,
    constant: raw.constant === true,
    caseSensitive: raw.caseSensitive === true,
    position:
      typeof raw.position === 'number'
        ? ST_POS_TO_LOCAL[raw.position] || 'before_char'
        : 'before_char',
    depth: typeof raw.depth === 'number' ? raw.depth : DEFAULT_ENTRY.depth,
    order: typeof raw.order === 'number' ? raw.order : DEFAULT_ENTRY.order,
    createdAt: now,
    updatedAt: now,
  };
}

export function entryToStFormat(
  entry: WorldInfoEntry,
  uid: number
): StEntry {
  return {
    uid,
    key: entry.keys,
    keysecondary: [],
    comment: entry.comment,
    content: entry.content,
    constant: entry.constant,
    vectorized: false,
    selective: true,
    order: entry.order,
    position: LOCAL_POS_TO_ST[entry.position],
    disable: !entry.enabled,
    depth: entry.depth,
    displayIndex: uid,
    caseSensitive: entry.caseSensitive,
    addMemo: !!entry.comment,
  };
}

export function bookFromStFormat(name: string, raw: StBook): WorldInfoBook {
  const rawEntries = raw.entries;
  const list: StEntry[] = [];
  if (Array.isArray(rawEntries)) {
    list.push(...rawEntries);
  } else if (rawEntries && typeof rawEntries === 'object') {
    for (const k of Object.keys(rawEntries)) {
      list.push(rawEntries[k] as StEntry);
    }
  }
  const now = Date.now();
  return {
    id: generateId('wibook'),
    name: raw.name || name || 'Imported Lorebook',
    entries: list.map(entryFromStFormat),
    createdAt: now,
    updatedAt: now,
  };
}

export function bookToStFormat(book: WorldInfoBook): StBook {
  const entries: Record<string, StEntry> = {};
  book.entries.forEach((e, idx) => {
    entries[String(idx)] = entryToStFormat(e, idx);
  });
  return { name: book.name, entries };
}

// ---- Keyword scanning ----------------------------------------------------

export interface MatchedEntry {
  entry: WorldInfoEntry;
  bookId: string;
  bookName: string;
}

function containsKey(haystack: string, key: string, caseSensitive: boolean): boolean {
  if (!key) return false;
  if (caseSensitive) return haystack.includes(key);
  return haystack.toLowerCase().includes(key.toLowerCase());
}

/**
 * Scan the last `scanDepth` messages for keyword matches across the given
 * active books. Returns an ordered list (by position > order > insertion).
 */
export function scanMessagesForEntries(
  books: WorldInfoBook[],
  activeBookIds: string[],
  messages: { content: string; isSystem?: boolean }[],
  scanDepth: number
): MatchedEntry[] {
  const activeBooks = books.filter((b) => activeBookIds.includes(b.id));
  if (activeBooks.length === 0) return [];

  // Build haystack from the last `scanDepth` non-system messages.
  const nonSystem = messages.filter((m) => !m.isSystem);
  const recent = nonSystem.slice(-Math.max(1, scanDepth));
  const haystack = recent.map((m) => m.content || '').join('\n');

  const matches: MatchedEntry[] = [];
  for (const book of activeBooks) {
    for (const entry of book.entries) {
      if (!entry.enabled) continue;
      if (entry.content.trim().length === 0) continue;

      if (entry.constant) {
        matches.push({ entry, bookId: book.id, bookName: book.name });
        continue;
      }

      if (entry.keys.length === 0) continue;

      const matched = entry.keys.some((k) =>
        containsKey(haystack, k, entry.caseSensitive)
      );
      if (matched) {
        matches.push({ entry, bookId: book.id, bookName: book.name });
      }
    }
  }

  // Sort by order (ascending). Position grouping happens at injection time.
  matches.sort((a, b) => a.entry.order - b.entry.order);
  return matches;
}

// ---- Store ---------------------------------------------------------------

interface WorldInfoState {
  books: WorldInfoBook[];
  activeBookIds: string[];
  scanDepth: number;
  error: string | null;

  // Book CRUD
  createBook: (name: string) => WorldInfoBook;
  renameBook: (bookId: string, name: string) => void;
  deleteBook: (bookId: string) => void;
  duplicateBook: (bookId: string) => WorldInfoBook | null;

  // Entry CRUD
  createEntry: (
    bookId: string,
    data?: Partial<Omit<WorldInfoEntry, 'id' | 'createdAt' | 'updatedAt'>>
  ) => WorldInfoEntry | null;
  updateEntry: (
    bookId: string,
    entryId: string,
    data: Partial<Omit<WorldInfoEntry, 'id' | 'createdAt'>>
  ) => void;
  deleteEntry: (bookId: string, entryId: string) => void;

  // Activation
  setBookActive: (bookId: string, active: boolean) => void;
  toggleBookActive: (bookId: string) => void;
  setScanDepth: (depth: number) => void;

  // Import / export
  exportBookJson: (bookId: string) => string | null;
  importBookJson: (json: string, fallbackName?: string) => WorldInfoBook | null;

  clearError: () => void;
}

export const useWorldInfoStore = create<WorldInfoState>((set, get) => ({
  books: loadBooks(),
  activeBookIds: loadActiveBooks(),
  scanDepth: loadScanDepth(),
  error: null,

  createBook: (name) => {
    const trimmed = name.trim() || 'Untitled Lorebook';
    const now = Date.now();
    const book: WorldInfoBook = {
      id: generateId('wibook'),
      name: trimmed,
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
    const next = [...get().books, book];
    saveBooks(next);
    set({ books: next });
    return book;
  },

  renameBook: (bookId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = get().books.map((b) =>
      b.id === bookId ? { ...b, name: trimmed, updatedAt: Date.now() } : b
    );
    saveBooks(next);
    set({ books: next });
  },

  deleteBook: (bookId) => {
    const next = get().books.filter((b) => b.id !== bookId);
    const activeNext = get().activeBookIds.filter((id) => id !== bookId);
    saveBooks(next);
    saveActiveBooks(activeNext);
    set({ books: next, activeBookIds: activeNext });
  },

  duplicateBook: (bookId) => {
    const original = get().books.find((b) => b.id === bookId);
    if (!original) return null;
    const now = Date.now();
    const copy: WorldInfoBook = {
      id: generateId('wibook'),
      name: `${original.name} (Copy)`,
      entries: original.entries.map((e) => ({
        ...e,
        id: generateId('wi'),
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    };
    const next = [...get().books, copy];
    saveBooks(next);
    set({ books: next });
    return copy;
  },

  createEntry: (bookId, data) => {
    const book = get().books.find((b) => b.id === bookId);
    if (!book) {
      set({ error: 'Lorebook not found' });
      return null;
    }
    const now = Date.now();
    const entry: WorldInfoEntry = {
      ...DEFAULT_ENTRY,
      ...(data || {}),
      id: generateId('wi'),
      createdAt: now,
      updatedAt: now,
    };
    const next = get().books.map((b) =>
      b.id === bookId
        ? { ...b, entries: [...b.entries, entry], updatedAt: now }
        : b
    );
    saveBooks(next);
    set({ books: next });
    return entry;
  },

  updateEntry: (bookId, entryId, data) => {
    const now = Date.now();
    const next = get().books.map((b) => {
      if (b.id !== bookId) return b;
      return {
        ...b,
        entries: b.entries.map((e) =>
          e.id === entryId ? { ...e, ...data, updatedAt: now } : e
        ),
        updatedAt: now,
      };
    });
    saveBooks(next);
    set({ books: next });
  },

  deleteEntry: (bookId, entryId) => {
    const now = Date.now();
    const next = get().books.map((b) =>
      b.id === bookId
        ? {
            ...b,
            entries: b.entries.filter((e) => e.id !== entryId),
            updatedAt: now,
          }
        : b
    );
    saveBooks(next);
    set({ books: next });
  },

  setBookActive: (bookId, active) => {
    const cur = get().activeBookIds;
    const has = cur.includes(bookId);
    let next = cur;
    if (active && !has) next = [...cur, bookId];
    else if (!active && has) next = cur.filter((id) => id !== bookId);
    else return;
    saveActiveBooks(next);
    set({ activeBookIds: next });
  },

  toggleBookActive: (bookId) => {
    const cur = get().activeBookIds;
    const next = cur.includes(bookId)
      ? cur.filter((id) => id !== bookId)
      : [...cur, bookId];
    saveActiveBooks(next);
    set({ activeBookIds: next });
  },

  setScanDepth: (depth) => {
    const d = Math.max(1, Math.min(50, Math.floor(depth)));
    saveScanDepth(d);
    set({ scanDepth: d });
  },

  exportBookJson: (bookId) => {
    const book = get().books.find((b) => b.id === bookId);
    if (!book) return null;
    return JSON.stringify(bookToStFormat(book), null, 2);
  },

  importBookJson: (json, fallbackName) => {
    try {
      const parsed = JSON.parse(json) as StBook;
      if (!parsed || typeof parsed !== 'object') {
        set({ error: 'Invalid lorebook JSON' });
        return null;
      }
      // Accept either { entries: ... } (ST format) OR a bare object where
      // the top level is the entries map.
      let book: WorldInfoBook;
      if ('entries' in parsed && parsed.entries) {
        book = bookFromStFormat(fallbackName || 'Imported Lorebook', parsed);
      } else {
        // Treat the whole object as an entries map.
        book = bookFromStFormat(fallbackName || 'Imported Lorebook', {
          entries: parsed as unknown as Record<string, StEntry>,
        });
      }
      const next = [...get().books, book];
      saveBooks(next);
      set({ books: next, error: null });
      return book;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to parse JSON',
      });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));
