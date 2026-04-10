/**
 * Theme system — light/dark/auto mode with accent color presets.
 *
 * Theme = mode (light | dark | auto) + preset (purple | blue | green | red | amber).
 * Each combination maps to 8 CSS variable values applied to <html>.
 *
 * `applyTheme()` must be called synchronously before React renders
 * (in main.tsx) to avoid a flash of wrong colors.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ThemePreset = 'purple' | 'blue' | 'green' | 'red' | 'amber' | 'cyberpunk';

interface ThemeColors {
  primary: string;
  primaryHover: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const DARK_THEMES: Record<ThemePreset, ThemeColors> = {
  purple: {
    primary: '#8b5cf6', primaryHover: '#7c3aed',
    bgPrimary: '#0f0f0f', bgSecondary: '#1a1a1a', bgTertiary: '#262626',
    textPrimary: '#ffffff', textSecondary: '#a1a1aa', border: '#3f3f46',
  },
  blue: {
    primary: '#3b82f6', primaryHover: '#2563eb',
    bgPrimary: '#0f0f0f', bgSecondary: '#1a1a1a', bgTertiary: '#262626',
    textPrimary: '#ffffff', textSecondary: '#a1a1aa', border: '#3f3f46',
  },
  green: {
    primary: '#22c55e', primaryHover: '#16a34a',
    bgPrimary: '#0f0f0f', bgSecondary: '#1a1a1a', bgTertiary: '#262626',
    textPrimary: '#ffffff', textSecondary: '#a1a1aa', border: '#3f3f46',
  },
  red: {
    primary: '#ef4444', primaryHover: '#dc2626',
    bgPrimary: '#0f0f0f', bgSecondary: '#1a1a1a', bgTertiary: '#262626',
    textPrimary: '#ffffff', textSecondary: '#a1a1aa', border: '#3f3f46',
  },
  amber: {
    primary: '#f59e0b', primaryHover: '#d97706',
    bgPrimary: '#0f0f0f', bgSecondary: '#1a1a1a', bgTertiary: '#262626',
    textPrimary: '#ffffff', textSecondary: '#a1a1aa', border: '#3f3f46',
  },
  cyberpunk: {
    primary: '#e040fb', primaryHover: '#ea80fc',
    bgPrimary: '#0a0a0f', bgSecondary: '#12121a', bgTertiary: '#1a1a28',
    textPrimary: '#f0e6ff', textSecondary: '#9a8fad', border: '#2a2540',
  },
};

const LIGHT_THEMES: Record<ThemePreset, ThemeColors> = {
  purple: {
    primary: '#7c3aed', primaryHover: '#6d28d9',
    bgPrimary: '#ffffff', bgSecondary: '#f4f4f5', bgTertiary: '#e4e4e7',
    textPrimary: '#18181b', textSecondary: '#71717a', border: '#d4d4d8',
  },
  blue: {
    primary: '#2563eb', primaryHover: '#1d4ed8',
    bgPrimary: '#ffffff', bgSecondary: '#f4f4f5', bgTertiary: '#e4e4e7',
    textPrimary: '#18181b', textSecondary: '#71717a', border: '#d4d4d8',
  },
  green: {
    primary: '#16a34a', primaryHover: '#15803d',
    bgPrimary: '#ffffff', bgSecondary: '#f4f4f5', bgTertiary: '#e4e4e7',
    textPrimary: '#18181b', textSecondary: '#71717a', border: '#d4d4d8',
  },
  red: {
    primary: '#dc2626', primaryHover: '#b91c1c',
    bgPrimary: '#ffffff', bgSecondary: '#f4f4f5', bgTertiary: '#e4e4e7',
    textPrimary: '#18181b', textSecondary: '#71717a', border: '#d4d4d8',
  },
  amber: {
    primary: '#d97706', primaryHover: '#b45309',
    bgPrimary: '#ffffff', bgSecondary: '#f4f4f5', bgTertiary: '#e4e4e7',
    textPrimary: '#18181b', textSecondary: '#71717a', border: '#d4d4d8',
  },
  cyberpunk: {
    // Light mode still uses the neon palette but softened for readability.
    primary: '#c026d3', primaryHover: '#a21caf',
    bgPrimary: '#faf5ff', bgSecondary: '#f3e8ff', bgTertiary: '#e9d5ff',
    textPrimary: '#1a0a2e', textSecondary: '#6b21a8', border: '#d8b4fe',
  },
};

/** Accent swatch colors shown in the settings picker (always the dark variant). */
export const PRESET_SWATCHES: Record<ThemePreset, string> = {
  purple: '#8b5cf6',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  cyberpunk: 'conic-gradient(#8b5cf6, #3b82f6, #22c55e, #ef4444, #f59e0b, #8b5cf6)',
};

export const THEME_PRESETS: ThemePreset[] = ['purple', 'blue', 'green', 'red', 'amber', 'cyberpunk'];

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const MODE_KEY = 'stm:theme-mode';
const PRESET_KEY = 'stm:theme-preset';

const VALID_MODES: ThemeMode[] = ['light', 'dark', 'auto'];
const VALID_PRESETS: ThemePreset[] = THEME_PRESETS;

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v && VALID_MODES.includes(v as ThemeMode)) return v as ThemeMode;
  } catch { /* ignore */ }
  return 'dark';
}

export function setThemeMode(mode: ThemeMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
}

export function getThemePreset(): ThemePreset {
  try {
    const v = localStorage.getItem(PRESET_KEY);
    if (v && VALID_PRESETS.includes(v as ThemePreset)) return v as ThemePreset;
  } catch { /* ignore */ }
  return 'purple';
}

export function setThemePreset(preset: ThemePreset): void {
  try { localStorage.setItem(PRESET_KEY, preset); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------

/** Resolve 'auto' to an actual mode based on OS preference. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'auto') return mode;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Read saved preferences, resolve the active mode, and set all 8 CSS
 * variables on `<html>`. Also updates `<meta name="theme-color">` and
 * the `color-scheme` CSS property for native form controls.
 *
 * Call this synchronously before `createRoot()` in main.tsx and again
 * whenever the user changes theme settings.
 */
export function applyTheme(): void {
  const mode = getThemeMode();
  const preset = getThemePreset();
  const resolved = resolveMode(mode);

  const colors = resolved === 'light' ? LIGHT_THEMES[preset] : DARK_THEMES[preset];
  const root = document.documentElement;

  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-primary-hover', colors.primaryHover);
  root.style.setProperty('--color-bg-primary', colors.bgPrimary);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--color-text-primary', colors.textPrimary);
  root.style.setProperty('--color-text-secondary', colors.textSecondary);
  root.style.setProperty('--color-border', colors.border);

  // Cyberpunk preset: set a data attribute so CSS can target special effects.
  // Also inject the rainbow gradient as a CSS variable for borders/glows.
  if (preset === 'cyberpunk') {
    root.setAttribute('data-theme', 'cyberpunk');
    root.style.setProperty(
      '--rainbow-gradient',
      'linear-gradient(135deg, #8b5cf6, #3b82f6, #22c55e, #f59e0b, #ef4444, #e040fb, #8b5cf6)'
    );
  } else {
    root.removeAttribute('data-theme');
    root.style.removeProperty('--rainbow-gradient');
  }

  // Native form controls and scrollbars respect color-scheme
  root.style.colorScheme = resolved;

  // Update mobile status bar color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors.bgPrimary);
}
