/** Phase 8.6: Chat Branching & Checkpoints
 *
 * A "branch" (checkpoint) is a named snapshot of the conversation up to a
 * specific message. Branches are stored in localStorage keyed by chat file.
 * Loading a branch replaces the in-memory message array without touching disk.
 */
import { create } from 'zustand';
import type { ChatMessage } from './chatStore';

export interface Branch {
  id: string;
  name: string;
  chatFile: string;
  createdAt: number;
  /** ID of the message this checkpoint was captured after. */
  checkpointMessageId: string;
  /** Number of messages included in the snapshot. */
  messageCount: number;
  /** Full message snapshot at the time of creation. */
  messages: ChatMessage[];
}

const BRANCHES_KEY = 'sillytavern_branches';

function loadAllFromStorage(): Record<string, Branch[]> {
  try {
    const stored = localStorage.getItem(BRANCHES_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, Branch[]>;
  } catch {
    return {};
  }
}

function saveAllToStorage(data: Record<string, Branch[]>) {
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(data));
}

interface BranchState {
  /** Branches for the currently open chat file. */
  branches: Branch[];
  /** Which branch is currently loaded (null = "main" / original file). */
  activeBranchId: string | null;

  /** Call when the active chat file changes to swap in the right branches. */
  loadBranchesForChat(chatFile: string): void;
  /** Snapshot messages up to (and including) messageId under a user-given name. */
  createBranch(params: {
    chatFile: string;
    messageId: string;
    name: string;
    messages: ChatMessage[];
  }): void;
  deleteBranch(id: string, chatFile: string): void;
  renameBranch(id: string, chatFile: string, name: string): void;
  setActiveBranch(id: string | null): void;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  activeBranchId: null,

  loadBranchesForChat(chatFile) {
    const all = loadAllFromStorage();
    set({ branches: all[chatFile] ?? [], activeBranchId: null });
  },

  createBranch({ chatFile, messageId, name, messages }) {
    const idx = messages.findIndex((m) => m.id === messageId);
    const snapshot = idx >= 0 ? messages.slice(0, idx + 1) : [...messages];

    const branch: Branch = {
      id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `Checkpoint ${new Date().toLocaleTimeString()}`,
      chatFile,
      createdAt: Date.now(),
      checkpointMessageId: messageId,
      messageCount: snapshot.length,
      messages: snapshot,
    };

    const all = loadAllFromStorage();
    all[chatFile] = [branch, ...(all[chatFile] ?? [])];
    saveAllToStorage(all);
    set({ branches: all[chatFile] });
  },

  deleteBranch(id, chatFile) {
    const all = loadAllFromStorage();
    all[chatFile] = (all[chatFile] ?? []).filter((b) => b.id !== id);
    saveAllToStorage(all);
    set({
      branches: all[chatFile],
      activeBranchId: get().activeBranchId === id ? null : get().activeBranchId,
    });
  },

  renameBranch(id, chatFile, name) {
    const all = loadAllFromStorage();
    all[chatFile] = (all[chatFile] ?? []).map((b) =>
      b.id === id ? { ...b, name: name.trim() || b.name } : b
    );
    saveAllToStorage(all);
    set({ branches: all[chatFile] });
  },

  setActiveBranch(id) {
    set({ activeBranchId: id });
  },
}));
