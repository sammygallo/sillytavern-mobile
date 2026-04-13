import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useServerExtensionStore } from '../../stores/serverExtensionStore';
import { showToastGlobal } from '../ui/Toast';

interface InstallFromUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallFromUrlModal({ isOpen, onClose }: InstallFromUrlModalProps) {
  const [url, setUrl] = useState('');
  const installExtension = useServerExtensionStore((s) => s.installExtension);
  const operationInProgress = useServerExtensionStore((s) => s.operationInProgress);
  const isInstalling = !!operationInProgress[url];

  const isValidUrl = /^https?:\/\/.+\/.+/.test(url.trim());

  async function handleInstall() {
    const trimmed = url.trim();
    if (!trimmed) return;

    const success = await installExtension(trimmed);
    if (success) {
      showToastGlobal('Extension installed successfully', 'success');
      setUrl('');
      onClose();
    } else {
      showToastGlobal('Failed to install extension', 'error');
    }
  }

  function handleClose() {
    if (!isInstalling) {
      setUrl('');
      onClose();
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Install from URL" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Git Repository URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/extension-repo"
            disabled={isInstalling}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
          />
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-400">
            Only install extensions from sources you trust. Extensions have full access to the server.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isInstalling}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleInstall}
            disabled={!isValidUrl}
            isLoading={isInstalling}
          >
            Install
          </Button>
        </div>
      </div>
    </Modal>
  );
}
