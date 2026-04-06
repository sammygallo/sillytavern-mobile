import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Download,
  Upload,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Trash2,
  Copy,
  Replace,
} from 'lucide-react';
import { useRegexScriptStore, type RegexScript } from '../../stores/regexScriptStore';
import { RegexScriptEditor } from './RegexScriptEditor';

const SCOPE_LABELS: Record<string, string> = {
  ai_output: 'AI Output',
  user_input: 'User Input',
  both: 'Both',
};

export function RegexScriptPage() {
  const navigate = useNavigate();
  const scripts = useRegexScriptStore((s) => s.scripts);
  const {
    createScript,
    updateScript,
    deleteScript,
    duplicateScript,
    toggleScript,
    importScripts,
    exportScripts,
  } = useRegexScriptStore();

  const [editingScript, setEditingScript] = useState<RegexScript | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = [...scripts].sort((a, b) => a.order - b.order);

  const handleCreate = () => {
    setEditingScript(null);
    setIsCreating(true);
  };

  const handleEdit = (script: RegexScript) => {
    setEditingScript(script);
    setIsCreating(true);
  };

  const handleSave = (data: Partial<RegexScript>) => {
    if (editingScript) {
      updateScript(editingScript.id, data);
    } else {
      createScript(data);
    }
    setIsCreating(false);
    setEditingScript(null);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingScript(null);
  };

  const handleExport = () => {
    const json = exportScripts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regex_scripts.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const count = importScripts(reader.result as string);
      if (count === 0) {
        alert('No valid scripts found in file.');
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
        <button
          onClick={() => navigate('/settings')}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex-1">
          Regex Scripts
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={handleImport}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
            title="Import"
          >
            <Upload size={18} />
          </button>
          <button
            onClick={handleExport}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
            title="Export"
            disabled={scripts.length === 0}
          >
            <Download size={18} />
          </button>
          <button
            onClick={handleCreate}
            className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90"
            title="New Script"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Script List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <Replace size={48} className="text-[var(--color-text-secondary)] mb-4" />
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              No Regex Scripts
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-4">
              Create find/replace patterns to automatically transform AI output or user input.
            </p>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              <Plus size={16} />
              Create Script
            </button>
          </div>
        ) : (
          sorted.map((script) => (
            <div
              key={script.id}
              className={`p-3 rounded-lg border transition-colors ${
                script.enabled
                  ? 'bg-[var(--color-bg-secondary)] border-[var(--color-border)]'
                  : 'bg-[var(--color-bg-secondary)]/40 border-[var(--color-border)]/40 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {script.name}
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                      {SCOPE_LABELS[script.scope]}
                    </span>
                    {script.displayOnly && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-yellow-500/15 text-yellow-400">
                        Display
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[var(--color-text-secondary)] truncate">
                    /{script.pattern}/{script.flags}
                  </p>
                  {script.replacement && (
                    <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                      <span className="opacity-60">Replace:</span> {script.replacement}
                    </p>
                  )}
                  {script.characterScope.length > 0 && (
                    <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                      Scoped to {script.characterScope.length} character(s)
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => toggleScript(script.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    title={script.enabled ? 'Disable' : 'Enable'}
                  >
                    {script.enabled ? (
                      <ToggleRight size={18} className="text-[var(--color-primary)]" />
                    ) : (
                      <ToggleLeft size={18} className="text-[var(--color-text-secondary)]" />
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(script)}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => duplicateScript(script.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                    title="Duplicate"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => deleteScript(script.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Editor modal */}
      {isCreating && (
        <RegexScriptEditor
          script={editingScript}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
