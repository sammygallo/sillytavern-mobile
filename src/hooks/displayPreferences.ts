/**
 * Persistent chat display preferences backed by localStorage.
 *
 * Follows the same pattern as speechLanguage.ts — plain getter/setter
 * functions with `stm:` key prefix, no reactive store needed since the
 * chat view remounts when navigating back from settings.
 */

export type ChatLayoutMode = 'bubbles' | 'flat' | 'document';
export type AvatarShape = 'circle' | 'square' | 'rounded-square';

const LAYOUT_MODE_KEY = 'stm:chat-layout-mode';
const AVATAR_SHAPE_KEY = 'stm:avatar-shape';
const FONT_SIZE_KEY = 'stm:chat-font-size';
const CHAT_WIDTH_KEY = 'stm:chat-max-width';

const VALID_LAYOUTS: ChatLayoutMode[] = ['bubbles', 'flat', 'document'];
const VALID_SHAPES: AvatarShape[] = ['circle', 'square', 'rounded-square'];

// ---- Layout Mode ----------------------------------------------------

export function getChatLayoutMode(): ChatLayoutMode {
  try {
    const v = localStorage.getItem(LAYOUT_MODE_KEY);
    if (v && VALID_LAYOUTS.includes(v as ChatLayoutMode)) return v as ChatLayoutMode;
  } catch { /* ignore */ }
  return 'bubbles';
}

export function setChatLayoutMode(mode: ChatLayoutMode): void {
  try { localStorage.setItem(LAYOUT_MODE_KEY, mode); } catch { /* ignore */ }
}

// ---- Avatar Shape ---------------------------------------------------

export function getAvatarShape(): AvatarShape {
  try {
    const v = localStorage.getItem(AVATAR_SHAPE_KEY);
    if (v && VALID_SHAPES.includes(v as AvatarShape)) return v as AvatarShape;
  } catch { /* ignore */ }
  return 'circle';
}

export function setAvatarShape(shape: AvatarShape): void {
  try { localStorage.setItem(AVATAR_SHAPE_KEY, shape); } catch { /* ignore */ }
}

// ---- Font Size (px) -------------------------------------------------

export function getChatFontSize(): number {
  try {
    const v = localStorage.getItem(FONT_SIZE_KEY);
    if (v) {
      const n = Number(v);
      if (n >= 12 && n <= 20) return n;
    }
  } catch { /* ignore */ }
  return 14;
}

export function setChatFontSize(px: number): void {
  const clamped = Math.max(12, Math.min(20, Math.round(px)));
  try { localStorage.setItem(FONT_SIZE_KEY, String(clamped)); } catch { /* ignore */ }
}

// ---- Chat Max Width (%) ---------------------------------------------

export function getChatMaxWidth(): number {
  try {
    const v = localStorage.getItem(CHAT_WIDTH_KEY);
    if (v) {
      const n = Number(v);
      if (n >= 60 && n <= 100) return n;
    }
  } catch { /* ignore */ }
  return 80;
}

export function setChatMaxWidth(pct: number): void {
  const clamped = Math.max(60, Math.min(100, Math.round(pct)));
  try { localStorage.setItem(CHAT_WIDTH_KEY, String(clamped)); } catch { /* ignore */ }
}
