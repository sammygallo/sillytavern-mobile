import { useState } from 'react';
import { ArrowLeft, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useImageGenStore, type GalleryEntry } from '../../stores/imageGenStore';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function backendLabel(backend: string): string {
  switch (backend) {
    case 'pollinations': return 'Pollinations';
    case 'sdwebui': return 'SD WebUI';
    case 'dalle': return 'DALL-E';
    default: return backend;
  }
}

function Lightbox({ entry, onClose }: { entry: GalleryEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3">
        <img
          src={entry.dataUrl}
          alt={entry.prompt}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        <p className="text-sm text-zinc-300 text-center max-w-lg px-4 line-clamp-3">
          {entry.prompt}
        </p>
      </div>
    </div>
  );
}

export function GalleryPage() {
  const navigate = useNavigate();
  const gallery = useImageGenStore((s) => s.gallery);
  const removeFromGallery = useImageGenStore((s) => s.removeFromGallery);
  const clearGallery = useImageGenStore((s) => s.clearGallery);
  const [selectedEntry, setSelectedEntry] = useState<GalleryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-2 -ml-2 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} className="text-[var(--color-text-primary)]" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Image Gallery</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {gallery.length} image{gallery.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        {gallery.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirmClear) {
                clearGallery();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
              }
            }}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              confirmClear
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
            }`}
          >
            {confirmClear ? 'Tap to confirm' : 'Clear all'}
          </button>
        )}
      </div>

      {gallery.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No images generated yet. Use the image generation button in chat to create images.
          </p>
        </div>
      ) : (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {gallery.map((entry) => (
            <div
              key={entry.id}
              className="bg-[var(--color-bg-secondary)] rounded-xl overflow-hidden border border-[var(--color-border)] group"
            >
              {/* Thumbnail */}
              <button
                type="button"
                onClick={() => setSelectedEntry(entry)}
                className="block w-full aspect-square overflow-hidden"
              >
                <img
                  src={entry.dataUrl}
                  alt={entry.prompt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  loading="lazy"
                />
              </button>

              {/* Info */}
              <div className="p-2">
                <p className="text-xs text-[var(--color-text-primary)] line-clamp-2 leading-tight mb-1.5">
                  {entry.prompt}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/15 text-[var(--color-primary)] font-medium">
                      {backendLabel(entry.backend)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromGallery(entry.id)}
                    className="p-1 rounded text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Delete image"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedEntry && (
        <Lightbox entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
