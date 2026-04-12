import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { Button, Input, ConfirmDialog } from '../ui';

/**
 * Phase 9.2 — Prompt Templates & Presets.
 *
 * Lets users save the current generation-store state as a named template,
 * load it back, rename, delete, and import/export as JSON. Mirrors the
 * regex-script page import/export pattern.
 */
export function PromptTemplatesPage(_props?: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const {
    templates,
    activeTemplateId,
    saveTemplate,
    loadTemplate,
    deleteTemplate,
    renameTemplate,
    importTemplates,
    exportTemplates,
  } = usePromptTemplateStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [includeSampler, setIncludeSampler] = useState(false);
  const [justLoadedId, setJustLoadedId] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTemplate(trimmed, includeSampler);
    setName('');
    setIncludeSampler(false);
  };

  const handleLoad = (id: string) => {
    loadTemplate(id);
    setJustLoadedId(id);
    setTimeout(() => setJustLoadedId((curr) => (curr === id ? null : curr)), 1500);
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameDraft(currentName);
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      renameTemplate(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleExport = () => {
    const json = exportTemplates();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt_templates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importTemplates(reader.result as string);
      if (result.imported === 0) {
        alert('No valid templates found in file.');
      } else if (result.errors > 0) {
        alert(`Imported ${result.imported} templates (${result.errors} skipped).`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const templateToDelete = deletingId
    ? templates.find((t) => t.id === deletingId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <header className="h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => goBack()}
          className="p-2"
          aria-label="Back"
        >
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex-1">
          Prompt Templates
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleImportClick}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
            title="Import templates"
            aria-label="Import templates"
          >
            <Upload size={18} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={templates.length === 0}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] disabled:opacity-40"
            title="Export templates"
            aria-label="Export templates"
          >
            <Download size={18} />
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Save current */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Save Current Setup
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Captures your current main prompt, jailbreak, post-history instructions,
            context size, instruct mode, and prompt order. Samplers are optional.
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            aria-label="Template name"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
            <input
              type="checkbox"
              checked={includeSampler}
              onChange={(e) => setIncludeSampler(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            Include sampler parameters (temperature, topP, etc.)
          </label>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!name.trim()}
            className="w-full"
          >
            <Plus size={16} className="mr-1" />
            Save as Template
          </Button>
        </section>

        {/* Template list */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
            Saved Templates {templates.length > 0 && `(${templates.length})`}
          </h2>

          {templates.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-6">
              No templates yet. Save one above or import from a JSON file.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((template) => {
                const isActive = activeTemplateId === template.id;
                const isRenaming = renamingId === template.id;
                const justLoaded = justLoadedId === template.id;
                return (
                  <li
                    key={template.id}
                    className={`
                      p-3 rounded-lg border
                      ${
                        isActive
                          ? 'bg-[var(--color-bg-tertiary)] border-[var(--color-primary)]'
                          : 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)]'
                      }
                    `}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') {
                              setRenamingId(null);
                              setRenameDraft('');
                            }
                          }}
                          className="flex-1"
                          aria-label="Rename template"
                        />
                        <button
                          type="button"
                          onClick={commitRename}
                          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-primary)] text-[var(--color-primary)]"
                          aria-label="Confirm rename"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(null);
                            setRenameDraft('');
                          }}
                          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]"
                          aria-label="Cancel rename"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                              {template.name}
                            </h3>
                            {template.sampler && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                                +sampler
                              </span>
                            )}
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                                active
                              </span>
                            )}
                            {justLoaded && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                                loaded
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                            Saved {new Date(template.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleLoad(template.id)}
                            className="text-xs"
                          >
                            Load
                          </Button>
                          <button
                            type="button"
                            onClick={() => startRename(template.id, template.name)}
                            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]"
                            aria-label={`Rename ${template.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(template.id)}
                            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-primary)] text-red-400"
                            aria-label={`Delete ${template.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={deletingId !== null}
        title="Delete template?"
        message={
          templateToDelete
            ? `"${templateToDelete.name}" will be removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deletingId) deleteTemplate(deletingId);
        }}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
