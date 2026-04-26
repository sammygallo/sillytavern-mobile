import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { showToastGlobal } from '../ui/Toast';
import { useLivePortraitStore } from '../../stores/livePortraitStore';
import {
  LivePortrait,
  type PortraitAnchors,
  DEFAULT_ANCHORS,
} from '../chat/LivePortrait';

/**
 * LivePortraitSetup — guided click-to-place modal for marking a character's
 * left eye, right eye, and mouth on their avatar. Three clicks, sensible
 * default radii, instant preview through the live mesh-warp pipeline so the
 * user can sanity-check that blink/talk lands on the right spots.
 *
 * MediaPipe-driven auto-detection is a future iteration; manual placement
 * works for any art style (anime/illustrated avatars are the dominant case
 * in this app and don't auto-landmark well).
 */

interface LivePortraitSetupProps {
  /** Character avatar filename, e.g. "Mina Hope.png". Used as the storage key. */
  avatar: string;
  /** Avatar URL to display in the setup canvas. */
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'leftEye' | 'rightEye' | 'mouth' | 'preview';

const STEP_LABELS: Record<Exclude<Step, 'preview'>, string> = {
  leftEye: 'Click the center of the LEFT eye',
  rightEye: 'Click the center of the RIGHT eye',
  mouth: 'Click the center of the mouth',
};

const STEP_ORDER: Step[] = ['leftEye', 'rightEye', 'mouth', 'preview'];

/** Default radii sized for typical face proportions. cx/cy come from clicks. */
const DEFAULT_RADII = {
  leftEye:  { rx: 0.05, ry: 0.025 },
  rightEye: { rx: 0.05, ry: 0.025 },
  mouth:    { rx: 0.06, ry: 0.025 },
};

export function LivePortraitSetup({ avatar, imageUrl, isOpen, onClose }: LivePortraitSetupProps) {
  const existing = useLivePortraitStore((s) => s.anchorsByAvatar[avatar]);
  const setAnchorsInStore = useLivePortraitStore((s) => s.setAnchors);
  const clearAnchorsInStore = useLivePortraitStore((s) => s.clearAnchors);

  const [step, setStep] = useState<Step>(existing ? 'preview' : 'leftEye');
  const [draft, setDraft] = useState<Partial<PortraitAnchors>>(() =>
    existing ? { ...existing } : {},
  );
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state whenever the modal is freshly opened (in case the user closed
  // mid-setup last time and wants a clean run).
  useEffect(() => {
    if (!isOpen) return;
    setStep(existing ? 'preview' : 'leftEye');
    setDraft(existing ? { ...existing } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (step === 'preview') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    const radii = DEFAULT_RADII[step];
    setDraft((d) => ({
      ...d,
      [step]: { cx, cy, rx: radii.rx, ry: radii.ry },
    }));
    // Advance to next step
    const i = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[i + 1]);
  }

  function handleSave() {
    if (!draft.leftEye || !draft.rightEye || !draft.mouth) {
      showToastGlobal('Click all three points before saving.', 'error');
      return;
    }
    setAnchorsInStore(avatar, draft as PortraitAnchors);
    showToastGlobal('Live Portrait anchors saved.', 'success');
    onClose();
  }

  function handleClear() {
    clearAnchorsInStore(avatar);
    setDraft({});
    setStep('leftEye');
    showToastGlobal('Live Portrait anchors cleared.', 'info');
  }

  function handleRestart() {
    setDraft({});
    setStep('leftEye');
  }

  // Markers overlaid on the image to show which clicks have landed.
  const markers: { key: string; cx: number; cy: number; color: string }[] = [];
  if (draft.leftEye) markers.push({ key: 'L', cx: draft.leftEye.cx, cy: draft.leftEye.cy, color: '#60a5fa' });
  if (draft.rightEye) markers.push({ key: 'R', cx: draft.rightEye.cx, cy: draft.rightEye.cy, color: '#60a5fa' });
  if (draft.mouth) markers.push({ key: 'M', cx: draft.mouth.cx, cy: draft.mouth.cy, color: '#f472b6' });

  const previewAnchors: PortraitAnchors = {
    leftEye:  draft.leftEye  ?? DEFAULT_ANCHORS.leftEye,
    rightEye: draft.rightEye ?? DEFAULT_ANCHORS.rightEye,
    mouth:    draft.mouth    ?? DEFAULT_ANCHORS.mouth,
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Live Portrait setup" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-[var(--color-text-secondary)]">
          {step === 'preview'
            ? 'Preview — the avatar should breathe, blink, and open its mouth on the toggle below. Re-do or save when ready.'
            : STEP_LABELS[step]}
        </p>

        <div className="flex flex-wrap gap-6">
          {/* Click target / static reference */}
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="setup"
              onClick={handleImageClick}
              className={`block max-h-[480px] rounded ${step === 'preview' ? '' : 'cursor-crosshair'}`}
              draggable={false}
            />
            {markers.map((m) => (
              <div
                key={m.key}
                className="absolute pointer-events-none"
                style={{
                  left: `${m.cx * 100}%`,
                  top: `${m.cy * 100}%`,
                  width: 14,
                  height: 14,
                  marginLeft: -7,
                  marginTop: -7,
                  borderRadius: '50%',
                  background: m.color,
                  boxShadow: '0 0 0 2px rgba(0,0,0,0.5)',
                }}
              />
            ))}
          </div>

          {/* Live preview only after all three points exist */}
          {draft.leftEye && draft.rightEye && draft.mouth && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
                live preview
              </p>
              <LivePortrait
                imageUrl={imageUrl}
                size={320}
                anchors={previewAnchors}
                isSpeaking={step === 'preview'}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-border)]">
          <Button variant="ghost" size="sm" onClick={handleRestart}>
            Restart
          </Button>
          {existing && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear saved
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!draft.leftEye || !draft.rightEye || !draft.mouth}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
