import { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Trash2,
  RefreshCw,
  Search,
  Loader2,
  Package,
  ExternalLink,
  Link,
  Check,
  Info,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useServerExtensionStore } from '../../stores/serverExtensionStore';
import { useAuthStore } from '../../stores/authStore';
import { hasMinRole } from '../../utils/permissions';
import { showToastGlobal } from '../ui/Toast';
import { InstallFromUrlModal } from './InstallFromUrlModal';
import type { RegistryExtension } from '../../api/extensionsApi';
import type { InstalledExtensionInfo } from '../../stores/serverExtensionStore';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InstalledCard({ ext, isAdmin }: { ext: InstalledExtensionInfo; isAdmin: boolean }) {
  const operationInProgress = useServerExtensionStore((s) => s.operationInProgress);
  const updateExtension = useServerExtensionStore((s) => s.updateExtension);
  const deleteExtension = useServerExtensionStore((s) => s.deleteExtension);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const op = operationInProgress[ext.name];
  const displayName = ext.name.replace(/^third-party\//, '');
  const commitShort = ext.version?.currentCommitHash?.slice(0, 7);
  const isGlobal = ext.type === 'global';

  async function handleUpdate() {
    const success = await updateExtension(ext.name, isGlobal);
    if (success) {
      showToastGlobal('Extension updated', 'success');
    } else {
      showToastGlobal('Update failed', 'error');
    }
  }

  async function handleDelete() {
    const success = await deleteExtension(ext.name, isGlobal);
    if (success) {
      showToastGlobal('Extension deleted', 'success');
    } else {
      showToastGlobal('Delete failed', 'error');
    }
  }

  return (
    <>
      <div className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
        <div className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
            <Package size={20} className="text-[var(--color-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {displayName}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {commitShort && (
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                  {commitShort}
                </span>
              )}
              {ext.version && !ext.version.isUpToDate && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-yellow-500/15 text-yellow-400">
                  Update available
                </span>
              )}
              {isGlobal && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/15 text-blue-400">
                  Global
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={handleUpdate}
                disabled={!!op}
                className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Update"
              >
                {op === 'updating' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!!op}
                className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Delete"
              >
                {op === 'deleting' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Extension"
        message={`Are you sure you want to delete "${displayName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

function AvailableCard({
  ext,
  isInstalled,
  isAdmin,
}: {
  ext: RegistryExtension;
  isInstalled: boolean;
  isAdmin: boolean;
}) {
  const operationInProgress = useServerExtensionStore((s) => s.operationInProgress);
  const installExtension = useServerExtensionStore((s) => s.installExtension);
  const op = operationInProgress[ext.url];

  async function handleInstall() {
    const success = await installExtension(ext.url);
    if (success) {
      showToastGlobal(`Installed ${ext.name}`, 'success');
    } else {
      showToastGlobal(`Failed to install ${ext.name}`, 'error');
    }
  }

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Package size={20} className="text-[var(--color-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {ext.name}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">
            {ext.description}
          </p>
          <a
            href={ext.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline mt-1"
          >
            <ExternalLink size={10} />
            GitHub
          </a>
        </div>

        <div className="flex-shrink-0">
          {isInstalled ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-green-500/15 text-green-400">
              <Check size={12} />
              Installed
            </span>
          ) : isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleInstall}
              disabled={!!op}
              isLoading={op === 'installing'}
              className="text-xs"
            >
              <Download size={14} className={op ? 'hidden' : 'mr-1'} />
              Install
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Tab = 'installed' | 'available';

export function ServerExtensionsSection() {
  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [registryFetched, setRegistryFetched] = useState(false);

  const userRole = useAuthStore((s) => s.currentUser?.role);
  const isAdmin = hasMinRole(userRole, 'admin');

  const {
    registry,
    installed,
    isLoadingRegistry,
    isLoadingInstalled,
    error,
    fetchRegistry,
    fetchInstalled,
    clearError,
  } = useServerExtensionStore();

  // Fetch installed list on mount
  useEffect(() => {
    fetchInstalled();
  }, [fetchInstalled]);

  // Fetch registry on first switch to "available" tab
  useEffect(() => {
    if (activeTab === 'available' && !registryFetched) {
      fetchRegistry();
      setRegistryFetched(true);
    }
  }, [activeTab, registryFetched, fetchRegistry]);

  // Set of installed extension repo URLs for cross-referencing
  const installedUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const ext of installed) {
      if (ext.version?.remoteUrl) {
        // Normalize: strip trailing .git and lowercase
        const normalized = ext.version.remoteUrl
          .replace(/\.git$/, '')
          .toLowerCase();
        urls.add(normalized);
      }
    }
    return urls;
  }, [installed]);

  // Filter available extensions by search
  const filteredRegistry = useMemo(() => {
    if (!searchQuery.trim()) return registry;
    const q = searchQuery.toLowerCase();
    return registry.filter(
      (ext) =>
        ext.name.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q),
    );
  }, [registry, searchQuery]);

  function isExtensionInstalled(ext: RegistryExtension): boolean {
    const normalized = ext.url.replace(/\.git$/, '').toLowerCase();
    return installedUrls.has(normalized);
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Server Extensions
        </h2>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-400">
          Server extensions run on the backend and affect prompt processing, slash commands, and
          server features. UI integration is not yet available in this app.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-xs text-red-400 hover:text-red-300 underline flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
        <button
          type="button"
          onClick={() => setActiveTab('installed')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'installed'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Installed{installed.length > 0 ? ` (${installed.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('available')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'available'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Available
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'installed' && (
        <div className="space-y-2">
          {isLoadingInstalled ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
            </div>
          ) : installed.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <Package size={40} className="text-[var(--color-text-secondary)] opacity-40 mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                No server extensions installed
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-xs mb-3">
                Browse the Available tab to find and install extensions.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('available')}>
                Browse Available
              </Button>
            </div>
          ) : (
            <>
              {!isAdmin && (
                <p className="text-xs text-[var(--color-text-secondary)] italic">
                  Contact an admin to manage server extensions.
                </p>
              )}
              {installed.map((ext) => (
                <InstalledCard key={ext.name} ext={ext} isAdmin={isAdmin} />
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'available' && (
        <div className="space-y-2">
          {/* Search input */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search extensions..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {isLoadingRegistry ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
            </div>
          ) : filteredRegistry.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10">
              <Search size={32} className="text-[var(--color-text-secondary)] opacity-40 mb-3" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                {searchQuery ? 'No extensions match your search.' : 'No extensions available.'}
              </p>
            </div>
          ) : (
            <>
              {!isAdmin && (
                <p className="text-xs text-[var(--color-text-secondary)] italic">
                  Contact an admin to install extensions.
                </p>
              )}
              {filteredRegistry.map((ext) => (
                <AvailableCard
                  key={ext.id}
                  ext={ext}
                  isInstalled={isExtensionInstalled(ext)}
                  isAdmin={isAdmin}
                />
              ))}
            </>
          )}

          {/* Install from URL */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              <Link size={16} />
              Install from URL
            </button>
          )}
        </div>
      )}

      <InstallFromUrlModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  );
}
