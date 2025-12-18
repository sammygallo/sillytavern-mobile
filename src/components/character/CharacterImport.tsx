import { useState, useRef } from 'react';
import { Upload, FileImage, FileJson, X } from 'lucide-react';
import { useCharacterStore } from '../../stores/characterStore';
import { Modal, Button, Input, TextArea, ImageUpload } from '../ui';
import type { CharacterInfo } from '../../api/client';

interface CharacterImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (avatarUrl: string) => void;
}

export function CharacterImport({ isOpen, onClose, onImported }: CharacterImportProps) {
  const {
    importCharacter,
    createCharacter,
    isImporting,
    isCreating,
    error,
    clearError,
  } = useCharacterStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedData, setImportedData] = useState<Partial<CharacterInfo> | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    personality: '',
    firstMessage: '',
    scenario: '',
    exampleMessages: '',
    creatorNotes: '',
    creator: '',
    tags: '',
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearError();
    const result = await importCharacter(file);

    if (result) {
      setImportedData(result.data);
      if (result.avatarFile) {
        setAvatarFile(result.avatarFile);
        // Create preview URL
        const previewUrl = URL.createObjectURL(result.avatarFile);
        setAvatarPreview(previewUrl);
      }

      // Populate form with imported data
      setFormData({
        name: result.data.name || '',
        description: result.data.description || result.data.data?.description || '',
        personality: result.data.personality || result.data.data?.personality || '',
        firstMessage: result.data.first_mes || result.data.data?.first_mes || '',
        scenario: result.data.scenario || result.data.data?.scenario || '',
        exampleMessages: result.data.mes_example || '',
        creatorNotes: result.data.data?.creator_notes || '',
        creator: result.data.data?.creator || '',
        tags: result.data.tags?.join(', ') || '',
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (error) clearError();
  };

  const handleAvatarChange = (file: File | null) => {
    setAvatarFile(file);
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
    } else {
      setAvatarPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      return;
    }

    const avatarUrl = await createCharacter(
      {
        ch_name: formData.name.trim(),
        description: formData.description.trim(),
        personality: formData.personality.trim(),
        first_mes: formData.firstMessage.trim(),
        scenario: formData.scenario.trim(),
        mes_example: formData.exampleMessages.trim(),
        creator_notes: formData.creatorNotes.trim(),
        creator: formData.creator.trim(),
        tags: formData.tags.trim(),
      },
      avatarFile || undefined
    );

    if (avatarUrl) {
      handleClose();
      onImported?.(avatarUrl);
    }
  };

  const handleClose = () => {
    // Clean up preview URL
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setImportedData(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setFormData({
      name: '',
      description: '',
      personality: '',
      firstMessage: '',
      scenario: '',
      exampleMessages: '',
      creatorNotes: '',
      creator: '',
      tags: '',
    });
    clearError();
    onClose();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Check file type
    const isPNG = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    const isJSON = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');

    if (!isPNG && !isJSON) {
      return;
    }

    clearError();
    const result = await importCharacter(file);

    if (result) {
      setImportedData(result.data);
      if (result.avatarFile) {
        setAvatarFile(result.avatarFile);
        const previewUrl = URL.createObjectURL(result.avatarFile);
        setAvatarPreview(previewUrl);
      }

      setFormData({
        name: result.data.name || '',
        description: result.data.description || result.data.data?.description || '',
        personality: result.data.personality || result.data.data?.personality || '',
        firstMessage: result.data.first_mes || result.data.data?.first_mes || '',
        scenario: result.data.scenario || result.data.data?.scenario || '',
        exampleMessages: result.data.mes_example || '',
        creatorNotes: result.data.data?.creator_notes || '',
        creator: result.data.data?.creator || '',
        tags: result.data.tags?.join(', ') || '',
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Character" size="lg">
      {!importedData ? (
        /* File Selection View */
        <div className="space-y-4">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 text-center hover:border-[var(--color-primary)] transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={48} className="mx-auto text-[var(--color-text-secondary)] mb-4" />
            <p className="text-[var(--color-text-primary)] font-medium mb-2">
              Drop a character file here
            </p>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              or click to browse
            </p>
            <div className="flex justify-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1">
                <FileImage size={14} />
                PNG (Character Card)
              </span>
              <span className="flex items-center gap-1">
                <FileJson size={14} />
                JSON
              </span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.json,image/png,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Loading State */}
          {isImporting && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--color-primary)]" />
              <span className="ml-2 text-[var(--color-text-secondary)]">
                Reading character file...
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Cancel Button */}
          <div className="flex justify-end pt-4 border-t border-[var(--color-border)]">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* Character Edit Form */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Success Message */}
          <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-sm flex items-center justify-between">
            <span>Character data loaded successfully!</span>
            <button
              type="button"
              onClick={() => {
                setImportedData(null);
                setAvatarFile(null);
                if (avatarPreview) {
                  URL.revokeObjectURL(avatarPreview);
                }
                setAvatarPreview(null);
              }}
              className="p-1 hover:bg-green-500/20 rounded"
            >
              <X size={16} />
            </button>
          </div>

          {/* Avatar */}
          <ImageUpload
            currentImage={avatarPreview || undefined}
            onImageSelect={handleAvatarChange}
            label="Avatar"
          />

          {/* Name - Required */}
          <Input
            label="Name *"
            placeholder="Character's name"
            value={formData.name}
            onChange={handleChange('name')}
            required
            autoFocus
          />

          {/* Description */}
          <TextArea
            label="Description"
            placeholder="Describe the character's appearance, background, and other details..."
            value={formData.description}
            onChange={handleChange('description')}
            rows={3}
          />

          {/* Personality */}
          <TextArea
            label="Personality"
            placeholder="Character's personality traits, mannerisms, speech patterns..."
            value={formData.personality}
            onChange={handleChange('personality')}
            rows={3}
          />

          {/* First Message */}
          <TextArea
            label="First Message"
            placeholder="The character's opening message when starting a new chat..."
            value={formData.firstMessage}
            onChange={handleChange('firstMessage')}
            rows={4}
          />

          {/* Scenario */}
          <TextArea
            label="Scenario"
            placeholder="The setting or context for conversations..."
            value={formData.scenario}
            onChange={handleChange('scenario')}
            rows={2}
          />

          {/* Collapsible Advanced Section */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] py-2">
              Advanced Options
            </summary>

            <div className="space-y-4 mt-2 pl-2 border-l-2 border-[var(--color-border)]">
              {/* Example Messages */}
              <TextArea
                label="Example Messages"
                placeholder="Example dialogue to help the AI understand the character's voice..."
                value={formData.exampleMessages}
                onChange={handleChange('exampleMessages')}
                rows={4}
              />

              {/* Creator Notes */}
              <TextArea
                label="Creator Notes"
                placeholder="Notes about the character for other users..."
                value={formData.creatorNotes}
                onChange={handleChange('creatorNotes')}
                rows={2}
              />

              {/* Creator */}
              <Input
                label="Creator"
                placeholder="Your name or handle"
                value={formData.creator}
                onChange={handleChange('creator')}
              />

              {/* Tags */}
              <Input
                label="Tags"
                placeholder="Comma-separated tags (e.g., fantasy, friendly, assistant)"
                value={formData.tags}
                onChange={handleChange('tags')}
              />
            </div>
          </details>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isCreating}
              disabled={!formData.name.trim()}
              className="flex-1"
            >
              Import Character
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
