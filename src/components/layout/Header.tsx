import { useState } from 'react';
import { Download, Menu, Settings, LogOut, Pencil, History, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { useCharacterStore } from '../../stores/characterStore';
import { can } from '../../utils/permissions';
import { Avatar, Button } from '../ui';
import { CharacterEdit } from '../character/CharacterEdit';
import { ChatHistoryPanel } from '../chat/ChatHistoryPanel';
import { PersonaSelector, PersonaManager } from '../persona';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import type { CharacterInfo } from '../../api/client';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuthStore();
  const { selectedCharacter, isGroupChatMode, fetchCharacters } = useCharacterStore();
  const userRole = currentUser?.role;
  const canEdit = can(userRole, 'character:edit');
  const canViewSettings = can(userRole, 'settings:view');
  const { canInstall, install: installPwa } = usePwaInstall();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [convertToPersonaData, setConvertToPersonaData] = useState<
    { name: string; description: string } | null
  >(null);

  const handleConvertToPersona = (character: CharacterInfo) => {
    const desc =
      character.description ||
      character.data?.description ||
      '';
    setConvertToPersonaData({ name: character.name, description: desc });
  };

  const handleDuplicated = async () => {
    // Refresh character list to show the new duplicate
    await fetchCharacters();
  };

  const getAvatarUrl = (avatar: string) => `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;

  return (
    <header className="h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
      {/* Menu Button (Mobile) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onMenuClick}
        className="lg:hidden p-2"
        aria-label="Open menu"
      >
        <Menu size={24} />
      </Button>

      {/* Character Info */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {selectedCharacter ? (
          <>
            <Avatar src={getAvatarUrl(selectedCharacter.avatar)} alt={selectedCharacter.name} size="sm" />
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                {selectedCharacter.name}
              </h1>
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="p-2"
                aria-label="Edit character"
                onClick={() => setShowEditModal(true)}
              >
                <Pencil size={18} />
              </Button>
            )}
          </>
        ) : (
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">
            GoodGirlsBotClub
          </h1>
        )}
      </div>

      {/* User Menu */}
      <div className="flex items-center gap-1">
        {selectedCharacter && !isGroupChatMode && (
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            aria-label="Chat history"
            onClick={() => setShowHistoryPanel(true)}
          >
            <History size={20} />
          </Button>
        )}
        {canInstall && (
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            aria-label="Install app"
            onClick={installPwa}
          >
            <Download size={20} />
          </Button>
        )}
        <PersonaSelector />
        {canViewSettings && (
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            aria-label="Settings"
            onClick={() => useSettingsPanelStore.getState().open()}
          >
            <Settings size={20} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/profile')}
          className="p-2"
          aria-label="Profile"
        >
          <UserCircle size={20} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="p-2"
          aria-label="Logout"
        >
          <LogOut size={20} />
        </Button>
      </div>

      {/* Character Edit Modal */}
      {selectedCharacter && (
        <CharacterEdit
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          character={selectedCharacter}
          onDuplicated={handleDuplicated}
          onConvertToPersona={handleConvertToPersona}
        />
      )}

      {/* Chat History Panel */}
      <ChatHistoryPanel
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
      />

      {/* Persona Manager (opened from convert-to-persona) */}
      {convertToPersonaData && (
        <PersonaManager
          isOpen={!!convertToPersonaData}
          onClose={() => setConvertToPersonaData(null)}
          initialPersona={convertToPersonaData}
        />
      )}
    </header>
  );
}
