import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, Copy, Download, RotateCcw, Save, Sparkles, Upload } from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { Button } from '../ui';
import {
  type ThemeColors,
  type CustomTheme,
  type CustomThemeExport,
  type ThemePreset,
  applyColors,
  applyRainbowEffects,
  applyTheme,
  fillThemeDefaults,
  getPresetColors,
  generateThemeId,
  isValidThemeColors,
  resolveMode,
  THEME_PRESETS,
} from '../../hooks/themePreferences';
import { useThemeStore } from '../../stores/themeStore';

// ---------------------------------------------------------------------------
// CSS variable label mapping
// ---------------------------------------------------------------------------

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint?: string }[] = [
  { key: 'primary', label: 'Primary / Accent' },
  { key: 'primaryHover', label: 'Primary Hover' },
  { key: 'bgPrimary', label: 'Background' },
  { key: 'bgSecondary', label: 'Surface' },
  { key: 'bgTertiary', label: 'Input / Hover' },
  { key: 'textPrimary', label: 'Text' },
  { key: 'textSecondary', label: 'Muted Text' },
  { key: 'border', label: 'Border' },
  { key: 'textBold', label: 'Bold Text', hint: '**bold** segments in messages' },
  { key: 'textItalic', label: 'Italic Text', hint: 'plain *italic* segments outside roleplay' },
  { key: 'textQuote', label: 'Quote Text', hint: '> blockquoted lines' },
  {
    key: 'textAction',
    label: 'Roleplay Action / Thought',
    hint: 'Italicized *…* and _…_ segments — the model often uses these for actions, but many also use them for internal monologue.',
  },
  {
    key: 'textThought',
    label: 'Inner Thought ({{…}})',
    hint: '{{double-brace}} segments explicitly tagged as thoughts.',
  },
  { key: 'textDialogue', label: 'Character Dialogue', hint: '"quoted" speech (when standardize formatting is on)' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThemeEditorPage({ params: pageParams }: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const { mode: themeMode, saveCustomTheme, setPreset: setActivePreset } = useThemeStore();

  const editId = pageParams?.id ?? null;
  const fromPreset = (pageParams?.from ?? null) as ThemePreset | null;
  const resolved = resolveMode(themeMode);

  // Load initial colors
  const [themeId] = useState(() => editId ?? generateThemeId());
  const [themeName, setThemeName] = useState(() => {
    if (editId) {
      const existing = useThemeStore.getState().customThemes.find(t => t.id === editId);
      if (existing) return existing.name;
    }
    if (fromPreset) return `${fromPreset.charAt(0).toUpperCase() + fromPreset.slice(1)} (custom)`;
    return 'My Theme';
  });

  const getInitialColors = useCallback((): { dark: ThemeColors; light: ThemeColors } => {
    if (editId) {
      const existing = useThemeStore.getState().customThemes.find(t => t.id === editId);
      if (existing) return {
        dark: fillThemeDefaults({ ...existing.dark }),
        light: fillThemeDefaults({ ...existing.light }),
      };
    }
    const base = fromPreset && THEME_PRESETS.includes(fromPreset) ? fromPreset : 'purple';
    return {
      dark: { ...getPresetColors(base, 'dark') },
      light: { ...getPresetColors(base, 'light') },
    };
  }, [editId, fromPreset]);

  const [darkColors, setDarkColors] = useState<ThemeColors>(() => getInitialColors().dark);
  const [lightColors, setLightColors] = useState<ThemeColors>(() => getInitialColors().light);
  const [editingMode, setEditingMode] = useState<'dark' | 'light'>(resolved);
  const [rainbowEffects, setRainbowEffectsState] = useState<boolean>(() => {
    if (editId) {
      const existing = useThemeStore.getState().customThemes.find(t => t.id === editId);
      return existing?.rainbowEffects === true;
    }
    return fromPreset === 'cyberpunk';
  });

  // Live preview: sync the rainbow toggle to the document root while editing.
  useEffect(() => {
    applyRainbowEffects(rainbowEffects);
  }, [rainbowEffects]);

  const activeColors = editingMode === 'dark' ? darkColors : lightColors;
  const setActiveColors = editingMode === 'dark' ? setDarkColors : setLightColors;

  // Live preview: update CSS vars as user edits
  const updateColor = (key: keyof ThemeColors, value: string) => {
    setActiveColors(prev => {
      const next = { ...prev, [key]: value };
      // Apply immediately for live preview
      applyColors(next);
      return next;
    });
  };

  // Reset current mode to base preset
  const resetToPreset = () => {
    const base = fromPreset && THEME_PRESETS.includes(fromPreset) ? fromPreset : 'purple';
    const colors = getPresetColors(base, editingMode);
    if (editingMode === 'dark') setDarkColors({ ...colors });
    else setLightColors({ ...colors });
    applyColors(colors);
  };

  // Save and go back
  const handleSave = () => {
    const theme: CustomTheme = {
      id: themeId,
      name: themeName.trim() || 'Untitled',
      dark: darkColors,
      light: lightColors,
      rainbowEffects,
    };
    saveCustomTheme(theme);
    setActivePreset(`custom:${themeId}`);
    goBack();
  };

  // Cancel — restore original theme
  const handleBack = () => {
    applyTheme();
    goBack();
  };

  // Export as JSON
  const handleExport = () => {
    const data: CustomThemeExport = { name: themeName, version: 1, dark: darkColors, light: lightColors, rainbowEffects };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${themeName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const data: CustomThemeExport = { name: themeName, version: 1, dark: darkColors, light: lightColors, rainbowEffects };
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  // Import from file
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data && isValidThemeColors(data.dark) && isValidThemeColors(data.light)) {
          const dark = fillThemeDefaults({ ...data.dark });
          const light = fillThemeDefaults({ ...data.light });
          setDarkColors(dark);
          setLightColors(light);
          if (data.name) setThemeName(data.name);
          if (typeof data.rainbowEffects === 'boolean') setRainbowEffectsState(data.rainbowEffects);
          applyColors(editingMode === 'dark' ? dark : light);
        }
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Theme Editor</h1>
        </div>
        <Button size="sm" onClick={handleSave}>
          <Save size={14} />
          Save
        </Button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Theme Name */}
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Theme Name</label>
          <input
            type="text"
            value={themeName}
            onChange={e => setThemeName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border)] text-sm"
            placeholder="My Theme"
          />
        </div>

        {/* Dark/Light mode toggle for editing */}
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Editing Colors For</label>
          <div className="grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map(m => (
              <button
                key={m}
                onClick={() => {
                  setEditingMode(m);
                  applyColors(m === 'dark' ? darkColors : lightColors);
                }}
                className={`p-2.5 rounded-lg text-center text-xs font-medium transition-all ${
                  editingMode === m
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Rainbow effects toggle (cyberpunk borders + neon glow) */}
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={16} className="text-[var(--color-text-secondary)] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-[var(--color-text-primary)]">Rainbow Effects</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] truncate">
                Animated borders + neon glow (Cyberpunk style)
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={rainbowEffects}
            onClick={() => setRainbowEffectsState(v => !v)}
            className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${
              rainbowEffects ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                rainbowEffects ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Color pickers */}
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-[var(--color-text-secondary)]">Colors</label>
            <button
              onClick={resetToPreset}
              className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>
          <div className="space-y-3">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="flex items-center gap-3">
                <label
                  className="relative w-8 h-8 rounded-lg border border-[var(--color-border)] cursor-pointer overflow-hidden shrink-0"
                  style={{ backgroundColor: activeColors[key] }}
                >
                  <input
                    type="color"
                    value={activeColors[key]}
                    onChange={e => updateColor(key, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--color-text-primary)]">{label}</div>
                  {hint && (
                    <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
                      {hint}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={activeColors[key]}
                  onChange={e => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) updateColor(key, v);
                    else setActiveColors(prev => ({ ...prev, [key]: v }));
                  }}
                  onBlur={() => {
                    // Revert to valid hex if user typed something invalid
                    if (!/^#[0-9a-fA-F]{6}$/.test(activeColors[key])) {
                      const initial = getInitialColors();
                      const fallback = editingMode === 'dark' ? initial.dark[key] : initial.light[key];
                      updateColor(key, fallback);
                    }
                  }}
                  className="w-20 px-2 py-1 rounded text-xs font-mono bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border)] text-center"
                  maxLength={7}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Import / Export */}
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-text-secondary)] mb-3">Import / Export</label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleExport}>
              <Download size={14} />
              Export JSON
            </Button>
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              <Copy size={14} />
              Copy JSON
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              Import JSON
            </Button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}
