import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { showToastGlobal } from '../ui/Toast';
import { useLivePortraitStore } from '../../stores/livePortraitStore';
import {
  LivePortrait,
  type PortraitAnchors,
  DEFAULT_ANCHORS,
} from '../chat/LivePortrait';
import { detectFaceAnchors } from '../../api/faceDetection';

/**
 * LivePortraitSetup — anchor-placement modal for the Live Portrait animator.
 *
 * Three approaches, in order of effort:
 *   1. ✨ Auto-detect — vision LLM finds eyes and mouth, fills all three.
 *   2. Click any anchor tab, then click on the avatar to place / move that
 *      one anchor. Other markers stay put.
 *   3. Click directly on a marker dot to switch the active tab to that anchor.
 *
 * Live preview through the same renderer is always visible so the user can
 * sanity-check that blink/talk lands on the right spots before saving.
 */

interface LivePortraitSetupProps {
  /** Character avatar filename, e.g. "Mina Hope.png". Used as the storage key. */
  avatar: string;
  /** Avatar URL to display in the setup canvas. */
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

type AnchorKey = 'leftEye' | 'rightEye' | 'mouth';

const ANCHOR_KEYS: AnchorKey[] = ['leftEye', 'rightEye', 'mouth'];

const ANCHOR_LABELS: Record<AnchorKey, string> = {
  leftEye: 'Left eye',
  rightEye: 'Right eye',
  mouth: 'Mouth',
};

const ANCHOR_COLORS: Record<AnchorKey, string> = {
  leftEye: '#60a5fa',
  rightEye: '#60a5fa',
  mouth: '#f472b6',
};

/** Default radii sized for typical face proportions. cx/cy come from clicks. */
const DEFAULT_RADII: Record<AnchorKey, { rx: number; ry: number }> = {
  leftEye:  { rx: 0.06, ry: 0.04 },
  rightEye: { rx: 0.06, ry: 0.04 },
  mouth:    { rx: 0.07, ry: 0.04 },
};

/** Initial draft when no anchors have been saved yet — sensible centered guesses. */
function initialDraft(): PortraitAnchors {
  return {
    leftEye:  { cx: 0.42, cy: 0.42, ...DEFAULT_RADII.leftEye },
    rightEye: { cx: 0.58, cy: 0.42, ...DEFAULT_RADII.rightEye },
    mouth:    { cx: 0.50, cy: 0.62, ...DEFAULT_RADII.mouth },
  };
}

export function LivePortraitSetup({ avatar, imageUrl, isOpen, onClose }: LivePortraitSetupProps) {
  const existing = useLivePortraitStore((s) => s.anchorsByAvatar[avatar]);
  const setAnchorsInStore = useLivePortraitStore((s) => s.setAnchors);
  const clearAnchorsInStore = useLivePortraitStore((s) => s.clearAnchors);

  const [draft, setDraft] = useState<PortraitAnchors>(() => existing ?? initialDraft());
  const [activeKey, setActiveKey] = useState<AnchorKey>('leftEye');
  const [isDetecting, setIsDetecting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state whenever the modal is freshly opened.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(existing ?? initialDraft());
    setActiveKey('leftEye');
    setIsDetecting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function placeAnchor(cx: number, cy: number) {
    setDraft((d) => ({
      ...d,
      [activeKey]: { ...d[activeKey], cx, cy },
    }));
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (isDetecting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    placeAnchor(cx, cy);
  }

  function handleMarkerClick(e: React.MouseEvent, key: AnchorKey) {
    e.stopPropagation();
    setActiveKey(key);
  }

  async function handleAutoDetect() {
    setIsDetecting(true);
    try {
      const detected = await detectFaceAnchors(imageUrl);
      setDraft(detected);
      showToastGlobal('Anchors detected — review and save.', 'success');
    } catch (err) {
      showToastGlobal(
        err instanceof Error ? err.message : 'Auto-detection failed',
        'error',
      );
    } finally {
      setIsDetecting(false);
    }
  }

  function handleSave() {
    setAnchorsInStore(avatar, draft);
    showToastGlobal('Live Portrait anchors saved.', 'success');
    onClose();
  }

  function handleClear() {
    clearAnchorsInStore(avatar);
    setDraft(initialDraft());
    setActiveKey('leftEye');
    showToastGlobal('Live Portrait anchors cleared.', 'info');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Live Portrait setup" size="lg">
      <div className="space-y-3">
        {/* Action row: auto-detect + per-anchor tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-[var(--color-border)]">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAutoDetect}
            disabled={isDetecting}
          >
            {isDetecting ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1.5" />
                Detecting…
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" />
                Auto-detect
              </>
            )}
          </Button>

          <div className="flex-1" />

          <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
            {ANCHOR_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setActiveKey(k)}
                disabled={isDetecting}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  activeKey === k
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                  style={{ background: ANCHOR_COLORS[k] }}
                />
                {ANCHOR_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)]">
          Tap <strong>Auto-detect</strong> to have an AI find the anchors for you, or click on the
          image to place the currently-selected anchor (
          <span className="font-medium text-[var(--color-text-primary)]">
            {ANCHOR_LABELS[activeKey].toLowerCase()}
          </span>
          ). Tap a colored dot to switch which anchor you're editing.
        </p>

        <div className="flex flex-wrap gap-6">
          {/* Click target with overlaid markers */}
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="setup"
              onClick={handleImageClick}
              className={`block max-h-[480px] rounded select-none ${
                isDetecting ? 'opacity-60 cursor-progress' : 'cursor-crosshair'
              }`}
              draggable={false}
            />
            {ANCHOR_KEYS.map((k) => {
              const a = draft[k];
              const isActive = activeKey === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-label={`Edit ${ANCHOR_LABELS[k]}`}
                  onClick={(e) => handleMarkerClick(e, k)}
                  className="absolute"
                  style={{
                    left: `${a.cx * 100}%`,
                    top: `${a.cy * 100}%`,
                    width: 18,
                    height: 18,
                    marginLeft: -9,
                    marginTop: -9,
                    borderRadius: '50%',
                    background: ANCHOR_COLORS[k],
                    border: isActive ? '3px solid #fff' : '2px solid rgba(0,0,0,0.6)',
                    boxShadow: isActive
                      ? '0 0 0 3px rgba(255,255,255,0.4), 0 0 8px ' + ANCHOR_COLORS[k]
                      : '0 0 0 2px rgba(0,0,0,0.5)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              );
            })}
          </div>

          {/* Live preview always visible — always animates */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
              live preview
            </p>
            <LivePortrait
              imageUrl={imageUrl}
              size={320}
              anchors={draft}
              isSpeaking={true}
            />
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-1 max-w-[320px]">
              Mouth is forced open here so you can verify mouth placement. In chat it only
              opens during AI replies.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-border)]">
          {existing && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
              Clear saved
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(initialDraft());
              setActiveKey('leftEye');
            }}
          >
            Reset
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Used for the live preview's initial-state fallback if draft isn't yet shaped right.
void DEFAULT_ANCHORS;
