import { useState, useEffect } from 'react';
import { Download, FileImage, FileJson, Copy, UserCircle, Globe, Lock, Loader2 } from 'lucide-react';
import { useCharacterStore } from '../../stores/characterStore';
import { useCharacterOwnershipStore } from '../../stores/characterOwnershipStore';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../utils/permissions';
import { spritesApi, type CharacterInfo } from '../../api/client';
import { Modal, Button, Input, TextArea, ImageUpload, ExpressionUpload, TagInput } from '../ui';
import { AlternateGreetingsEditor } from './AlternateGreetingsEditor';
import { CharacterLorebookSection } from './CharacterLorebookSection';

interface CharacterEditProps {
  isOpen: boolean;
  onClose: () => void;
  character: CharacterInfo;
  onSaved?: () => void;
  onDuplicated?: (newAvatarUrl: string) => void;
  onConvertToPersona?: (character: CharacterInfo) => void;
}

export function CharacterEdit({
  isOpen,
  onClose,
  character,
  onSaved,
  onDuplicated,
  onConvertToPersona,
}: CharacterEditProps) {
  const {
    updateCharacter,
    duplicateCharacter,
    isEditing,
    isExporting,
    isDuplicating,
    error,
    clearError,
    exportCharacterAsPNG,
    exportCharacterAsJSON,
    getLinkedBookIds,
    setLinkedBookIds,
    getAllTags,
  } = useCharacterStore();
  const ownershipStore = useCharacterOwnershipStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const canSetGlobal = hasPermission(currentUser, 'character:set_global');
  const visibility = ownershipStore.getVisibility(character.avatar);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [expressionFiles, setExpressionFiles] = useState<Map<string, File>>(new Map());
  const [isUploadingExpressions, setIsUploadingExpressions] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    personality: string;
    firstMessage: string;
    scenario: string;
    exampleMessages: string;
    creatorNotes: string;
    creator: string;
    tags: string[];
  }>({
    name: '',
    description: '',
    personality: '',
    firstMessage: '',
    scenario: '',
    exampleMessages: '',
    creatorNotes: '',
    creator: '',
    tags: [],
  });

  // Phase 2: Advanced character fields
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>([]);
  const [characterVersion, setCharacterVersion] = useState('');
  const [depthPromptPrompt, setDepthPromptPrompt] = useState('');
  const [depthPromptDepth, setDepthPromptDepth] = useState(4);
  const [depthPromptRole, setDepthPromptRole] = useState<'system' | 'user' | 'assistant'>('system');
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [postHistoryInstructions, setPostHistoryInstructions] = useState('');
  const [talkativeness, setTalkativeness] = useState('0.5');
  // Phase 4.3: extra linked lorebooks (staged, committed on Save)
  const [linkedBookIds, setLinkedBookIdsLocal] = useState<string[]>([]);

  const getAvatarUrl = (avatar: string) => `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;

  // Populate form when character changes or modal opens
  useEffect(() => {
    if (isOpen && character) {
      setAvatarFile(null); // Reset file selection
      setShowExportMenu(false); // Reset export menu
      setFormData({
        name: character.name || '',
        description: character.description || character.data?.description || '',
        personality: character.personality || character.data?.personality || '',
        firstMessage: character.first_mes || character.data?.first_mes || '',
        scenario: character.scenario || character.data?.scenario || '',
        exampleMessages: character.mes_example || character.data?.mes_example || '',
        creatorNotes: character.creator_notes || character.data?.creator_notes || '',
        creator: character.creator || character.data?.creator || '',
        tags: character.tags || character.data?.tags || [],
      });

      // Populate advanced fields
      setAlternateGreetings(
        character.alternate_greetings || character.data?.alternate_greetings || []
      );
      setCharacterVersion(
        character.character_version || character.data?.character_version || ''
      );
      setSystemPromptOverride(
        character.system_prompt || character.data?.system_prompt || ''
      );
      setPostHistoryInstructions(
        character.post_history_instructions || character.data?.post_history_instructions || ''
      );

      const depthPrompt = character.data?.extensions?.depth_prompt;
      setDepthPromptPrompt(depthPrompt?.prompt || '');
      setDepthPromptDepth(depthPrompt?.depth ?? 4);
      setDepthPromptRole(
        (depthPrompt?.role as 'system' | 'user' | 'assistant') || 'system'
      );

      const charTalkativeness = character.data?.extensions?.talkativeness;
      setTalkativeness(typeof charTalkativeness === 'string' ? charTalkativeness : '0.5');

      // Phase 4.3: hydrate linked lorebook ids for this character
      setLinkedBookIdsLocal(getLinkedBookIds(character.avatar));
    }
  }, [isOpen, character, getLinkedBookIds]);

  const handleExportPNG = async () => {
    setShowExportMenu(false);
    await exportCharacterAsPNG(character);
  };

  const handleExportJSON = () => {
    setShowExportMenu(false);
    exportCharacterAsJSON(character);
  };

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (error) clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      return;
    }

    const success = await updateCharacter(
      {
        avatar_url: character.avatar,
        ch_name: formData.name.trim(),
        description: formData.description.trim(),
        personality: formData.personality.trim(),
        first_mes: formData.firstMessage.trim(),
        scenario: formData.scenario.trim(),
        mes_example: formData.exampleMessages.trim(),
        creator_notes: formData.creatorNotes.trim(),
        creator: formData.creator.trim(),
        tags: formData.tags.join(', '),
        chat: character.create_date, // Preserve existing
        create_date: character.create_date, // Preserve existing
        // Advanced fields
        alternate_greetings: alternateGreetings.filter((g) => g.trim()),
        system_prompt: systemPromptOverride.trim() || undefined,
        post_history_instructions: postHistoryInstructions.trim() || undefined,
        character_version: characterVersion.trim() || undefined,
        depth_prompt_prompt: depthPromptPrompt.trim() || undefined,
        depth_prompt_depth: depthPromptPrompt.trim() ? depthPromptDepth : undefined,
        depth_prompt_role: depthPromptPrompt.trim() ? depthPromptRole : undefined,
        talkativeness: talkativeness || undefined,
      },
      avatarFile || undefined
    );

    if (success) {
      // Persist linked lorebook selections (client-side only)
      setLinkedBookIds(character.avatar, linkedBookIds);

      // Upload expression images if any
      if (expressionFiles.size > 0) {
        setIsUploadingExpressions(true);
        try {
          const characterName = character.name;
          console.log('[CharacterEdit] Uploading expressions for:', characterName);
          const results = await Promise.allSettled(
            Array.from(expressionFiles.entries()).map(([emotion, file]) =>
              spritesApi.uploadSprite(characterName, emotion, file)
            )
          );
          // Log any failures
          const failures = results.filter((r) => r.status === 'rejected');
          if (failures.length > 0) {
            console.error('[CharacterEdit] Some expression uploads failed:', failures);
          }
        } catch (err) {
          console.error('[CharacterEdit] Failed to upload expressions:', err);
        } finally {
          setIsUploadingExpressions(false);
        }
      }

      onClose();
      onSaved?.();
    }
  };

  const handleClose = () => {
    clearError();
    onClose();
  };

  const handleDuplicate = async () => {
    const newAvatar = await duplicateCharacter(character.avatar);
    if (newAvatar) {
      onClose();
      onDuplicated?.(newAvatar);
    }
  };

  const handleConvertToPersona = () => {
    onClose();
    onConvertToPersona?.(character);
  };

  const handleToggleVisibility = async () => {
    const next = visibility === 'global' ? 'personal' : 'global';
    setIsTogglingVisibility(true);
    try {
      await ownershipStore.setVisibility(character.avatar, next);
      // Server physically moved the file between directories — refresh the
      // character list so subsequent API calls target the right scope.
      await useCharacterStore.getState().fetchCharacters();
    } catch (err) {
      console.error('Failed to change character visibility', err);
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Edit ${character.name}`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Avatar Upload */}
        <ImageUpload
          currentImage={getAvatarUrl(character.avatar)}
          onImageSelect={setAvatarFile}
          label="Avatar"
        />

        {/* Character Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDuplicate}
            isLoading={isDuplicating}
            title="Create a copy of this character"
          >
            <Copy size={16} className="mr-1.5" />
            Duplicate
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleConvertToPersona}
            title="Create a new persona using this character's data"
          >
            <UserCircle size={16} className="mr-1.5" />
            To Persona
          </Button>
          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-1.5" />
                  Exporting
                </>
              ) : (
                <>
                  <Download size={16} className="mr-1.5" />
                  Export
                </>
              )}
            </Button>

            {showExportMenu && (
              <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg z-10 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  onClick={handleExportPNG}
                >
                  <FileImage size={18} className="text-[var(--color-primary)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">PNG Card</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">Card with embedded data</p>
                  </div>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-tertiary)] transition-colors border-t border-[var(--color-border)]"
                  onClick={handleExportJSON}
                >
                  <FileJson size={18} className="text-[var(--color-primary)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">JSON</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">V2 card as JSON</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Visibility (global vs personal) — gated on character:set_global */}
        {canSetGlobal && (
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Visibility: {visibility === 'global' ? 'Global' : 'Personal'}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {visibility === 'global'
                  ? 'Shared with all users on this server.'
                  : 'Only visible to you.'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleToggleVisibility}
              disabled={isTogglingVisibility}
              className="shrink-0"
            >
              {isTogglingVisibility ? (
                <Loader2 size={14} className="animate-spin mr-1.5" />
              ) : visibility === 'global' ? (
                <Lock size={14} className="mr-1.5" />
              ) : (
                <Globe size={14} className="mr-1.5" />
              )}
              {visibility === 'global' ? 'Make Personal' : 'Make Global'}
            </Button>
          </div>
        )}

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

        {/* Alternate Greetings */}
        <AlternateGreetingsEditor
          greetings={alternateGreetings}
          onChange={setAlternateGreetings}
        />

        {/* Scenario */}
        <TextArea
          label="Scenario"
          placeholder="The setting or context for conversations..."
          value={formData.scenario}
          onChange={handleChange('scenario')}
          rows={2}
        />

        {/* Expression Images */}
        <ExpressionUpload
          characterName={character.name}
          onExpressionsChange={setExpressionFiles}
        />

        {/* Phase 4.3: Character lorebooks */}
        <CharacterLorebookSection
          avatar={character.avatar}
          characterName={formData.name || character.name}
          linkedBookIds={linkedBookIds}
          onLinkedBookIdsChange={setLinkedBookIdsLocal}
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

            {/* Character's Note (Depth Prompt) */}
            <div className="space-y-2">
              <TextArea
                label="Character's Note"
                placeholder="Injected at a configurable depth in the chat to reinforce behavior..."
                value={depthPromptPrompt}
                onChange={(e) => setDepthPromptPrompt(e.target.value)}
                rows={2}
              />
              {depthPromptPrompt && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Injection Depth
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={depthPromptDepth}
                      onChange={(e) => setDepthPromptDepth(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Role
                    </label>
                    <select
                      value={depthPromptRole}
                      onChange={(e) =>
                        setDepthPromptRole(e.target.value as 'system' | 'user' | 'assistant')
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    >
                      <option value="system">System</option>
                      <option value="user">User</option>
                      <option value="assistant">Assistant</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* System Prompt Override */}
            <TextArea
              label="System Prompt Override"
              placeholder="Overrides the main system prompt for this character..."
              value={systemPromptOverride}
              onChange={(e) => setSystemPromptOverride(e.target.value)}
              rows={3}
            />

            {/* Post-History Instructions */}
            <TextArea
              label="Post-History Instructions"
              placeholder="Instructions appended after the chat history..."
              value={postHistoryInstructions}
              onChange={(e) => setPostHistoryInstructions(e.target.value)}
              rows={2}
            />

            {/* Talkativeness */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
                Talkativeness ({talkativeness})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={talkativeness}
                onChange={(e) => setTalkativeness(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Used in group chats to control how often this character speaks.
              </p>
            </div>

            {/* Character Version */}
            <Input
              label="Character Version"
              placeholder="e.g., 1.0"
              value={characterVersion}
              onChange={(e) => setCharacterVersion(e.target.value)}
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
            <TagInput
              label="Tags"
              value={formData.tags}
              onChange={(tags) => setFormData((prev) => ({ ...prev, tags }))}
              suggestions={getAllTags()}
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
            isLoading={isEditing || isUploadingExpressions}
            disabled={!formData.name.trim()}
            className="flex-1"
          >
            {isUploadingExpressions ? 'Uploading Expressions...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
