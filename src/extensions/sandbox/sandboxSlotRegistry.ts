/**
 * Sandbox Slot Registry
 *
 * Tracks UI slot items contributed by extensions (message action buttons,
 * chat input extras). Each item is owned by one extension frame; unmounting
 * the frame removes its items.
 *
 * Flow:
 *   1. Extension calls SillyTavern.registerSlotItem('messageActions', {...}).
 *   2. Shim posts ST_REGISTER_SLOT → ExtensionFrame.register().
 *   3. React consumers read items via useSlotItems(slot).
 *   4. User taps a rendered slot button → invoke(frameId, itemId, payload).
 *   5. Registry calls the iframe-scoped invoker that posts ST_SLOT_INVOKE
 *      back into the originating iframe.
 */

import { create } from 'zustand';

export const SLOT_KINDS = ['messageActions', 'chatInputExtras'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export interface SlotItem {
  frameId: string;
  extensionName: string;
  itemId: string;
  label: string;
  icon?: string;
  tooltip?: string;
}

interface SlotRegistryState {
  messageActions: SlotItem[];
  chatInputExtras: SlotItem[];
  register: (
    frameId: string,
    extensionName: string,
    slot: SlotKind,
    item: { id: string; label: string; icon?: string; tooltip?: string },
  ) => void;
  unregister: (frameId: string, slot: SlotKind, itemId: string) => void;
  unregisterFrame: (frameId: string) => void;
}

export const useSandboxSlotStore = create<SlotRegistryState>((set) => ({
  messageActions: [],
  chatInputExtras: [],

  register(frameId, extensionName, slot, item) {
    set((s) => {
      const existing = s[slot];
      // Upsert by (frameId, itemId) so re-registrations replace in place.
      const filtered = existing.filter(
        (i) => !(i.frameId === frameId && i.itemId === item.id),
      );
      const next: SlotItem = {
        frameId,
        extensionName,
        itemId: item.id,
        label: String(item.label ?? item.id),
        icon: typeof item.icon === 'string' ? item.icon : undefined,
        tooltip: typeof item.tooltip === 'string' ? item.tooltip : undefined,
      };
      return { [slot]: [...filtered, next] } as Partial<SlotRegistryState>;
    });
  },

  unregister(frameId, slot, itemId) {
    set((s) => ({
      [slot]: s[slot].filter(
        (i) => !(i.frameId === frameId && i.itemId === itemId),
      ),
    }) as Partial<SlotRegistryState>);
  },

  unregisterFrame(frameId) {
    set((s) => ({
      messageActions: s.messageActions.filter((i) => i.frameId !== frameId),
      chatInputExtras: s.chatInputExtras.filter((i) => i.frameId !== frameId),
    }));
  },
}));

// ── Invoker registry (module-level; not React state) ────────────────────────
// Maps frameId → function that posts ST_SLOT_INVOKE into that iframe.

type Invoker = (itemId: string, payload: unknown) => void;
const frameInvokers = new Map<string, Invoker>();

export function setFrameInvoker(frameId: string, invoker: Invoker): void {
  frameInvokers.set(frameId, invoker);
}

export function clearFrameInvoker(frameId: string): void {
  frameInvokers.delete(frameId);
}

export function invokeSlotItem(
  frameId: string,
  itemId: string,
  payload: unknown,
): void {
  const fn = frameInvokers.get(frameId);
  if (!fn) return; // frame unmounted between click and invoke — drop silently
  try {
    fn(itemId, payload);
  } catch {
    // ignore
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSlotItems(slot: SlotKind): SlotItem[] {
  return useSandboxSlotStore((s) => s[slot]);
}
