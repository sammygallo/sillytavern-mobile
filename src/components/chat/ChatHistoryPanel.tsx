import { useState, useEffect } from 'react';
import { Plus, Trash2, MessageSquare, Download } from 'lucide-react';
import { Modal, ConfirmDialog } from '../ui';
import { useChatStore } from '../../stores/chatStore';
import { useCharacterStore } from '../../stores/characterStore';

interface ChatHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatHistoryPanel({ isOpen, onClose }: ChatHistoryPanelProps) {
  const { selectedCharacter } = useCharacterStore();
  const { chatFiles, currentChatFile, fetchChatFiles, loadChat, startNewChat, deleteChat } =
    useChatStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && selectedCharacter) {
      fetchChatFiles(selectedCharacter.avatar);
    }
  }, [isOpen, selectedCharacter, fetchChatFiles]);

  const handleLoadChat = async (fileName: string) => {
    if (!selectedCharacter) return;
    await loadChat(selectedCharacter.avatar, fileName);
    onClose();
  };

  const handleNewChat = async () => {
    if (!selectedCharacter) return;
    await startNewChat(selectedCharacter);
    onClose();
  };

  const handleDeleteChat = async (fileName: string) => {
    if (!selectedCharacter) return;
    await deleteChat(selectedCharacter.avatar, fileName);
  };

  const handleExportChat = async (fileName: string) => {
    if (!selectedCharacter) return;
    try {
      const response = await fetch('/api/chats/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          file_name: fileName,
          avatar_url: selectedCharacter.avatar,
        }),
      });
      const data = await response.json();
      const jsonl = Array.isArray(data)
        ? data.map((entry) => JSON.stringify(entry)).join('\n')
        : '';
      const blob = new Blob([jsonl], { type: 'application/jsonl' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export] Failed:', err);
    }
  };

  if (!selectedCharacter) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Chat History" size="md">
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={18} />
            <span className="font-medium">New Chat</span>
          </button>

          {chatFiles.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--color-text-secondary)]">
              No saved chats yet
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
              {chatFiles.map((chat) => {
                const isActive = chat.fileName === currentChatFile;
                return (
                  <div
                    key={chat.fileName}
                    className={`
                      group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
                      ${isActive
                        ? 'bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/40'
                        : 'hover:bg-[var(--color-bg-tertiary)]'}
                    `}
                  >
                    <button
                      onClick={() => handleLoadChat(chat.fileName)}
                      className="flex-1 flex items-center gap-3 min-w-0 text-left"
                    >
                      <MessageSquare
                        size={16}
                        className="text-[var(--color-text-secondary)] flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {chat.fileName}
                        </div>
                        {chat.lastMessage && (
                          <div className="text-xs text-[var(--color-text-secondary)] truncate">
                            {chat.lastMessage}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleExportChat(chat.fileName)}
                        className="p-1.5 rounded hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        title="Export as JSONL"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(chat.fileName)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-[var(--color-text-secondary)] hover:text-red-400"
                        title="Delete chat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteChat(confirmDelete)}
        title="Delete Chat"
        message={`Delete "${confirmDelete}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </>
  );
}
