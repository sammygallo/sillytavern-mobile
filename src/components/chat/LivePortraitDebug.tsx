import { useState } from 'react';
import { LivePortrait, DEFAULT_ANCHORS, type PortraitAnchors } from './LivePortrait';

/**
 * POC debug page for the LivePortrait animator. Not linked from the main app
 * navigation — visit `/debug/live-portrait` directly.
 *
 * Shows a single character avatar through the live mesh-warp pipeline next to
 * a static <img> reference for comparison, plus on/off switches for the talk
 * driver and live anchor sliders so the breath/blink baseline can be felt out
 * before we wire MediaPipe or the click-to-place setup UI.
 */
export function LivePortraitDebug() {
  const [character, setCharacter] = useState('Mina Hope.png');
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Anchors hand-tuned to Mina Hope's avatar — face is right-of-center, head
  // ~30% from the top. Off-the-shelf DEFAULT_ANCHORS still available below.
  const [anchors, setAnchors] = useState<PortraitAnchors>({
    leftEye:  { cx: 0.42, cy: 0.30, rx: 0.05, ry: 0.025 },
    rightEye: { cx: 0.55, cy: 0.30, rx: 0.05, ry: 0.025 },
    mouth:    { cx: 0.46, cy: 0.42, rx: 0.06, ry: 0.025 },
  });
  void DEFAULT_ANCHORS;

  // Use the full character avatar (not the thumbnail) so the live mesh isn't
  // up-rezzing a 96x144 source.
  const imageUrl = `/characters/${encodeURIComponent(character)}`;

  return (
    <div className="min-h-screen p-6 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <h1 className="text-xl font-semibold mb-1">LivePortrait — POC</h1>
      <p className="text-xs text-[var(--color-text-secondary)] mb-4">
        Single-image AI-driven character animator. Mesh-warp via Pixi v8.
      </p>

      <div className="flex gap-6 items-start flex-wrap">
        <div>
          <p className="text-xs font-mono mb-1">live (animated mesh)</p>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-2">
            <LivePortrait imageUrl={imageUrl} size={384} isSpeaking={isSpeaking} anchors={anchors} />
          </div>
        </div>

        <div>
          <p className="text-xs font-mono mb-1">static (reference)</p>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-2">
            <img src={imageUrl} width={384} height={384} alt="static reference" className="block" />
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-[260px]">
          <label className="text-xs">
            character file
            <input
              type="text"
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              className="block w-full mt-1 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
            />
          </label>

          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSpeaking}
              onChange={(e) => setIsSpeaking(e.target.checked)}
            />
            isSpeaking (drives mouth)
          </label>

          {(['leftEye', 'rightEye', 'mouth'] as const).map((key) => (
            <fieldset key={key} className="border border-[var(--color-border)] rounded p-2">
              <legend className="text-xs font-mono">{key}</legend>
              {(['cx', 'cy', 'rx', 'ry'] as const).map((field) => (
                <label key={field} className="text-[10px] block">
                  {field}: {anchors[key][field].toFixed(3)}
                  <input
                    type="range"
                    min={0}
                    max={field === 'cx' || field === 'cy' ? 1 : 0.25}
                    step={0.005}
                    value={anchors[key][field]}
                    onChange={(e) =>
                      setAnchors((a) => ({
                        ...a,
                        [key]: { ...a[key], [field]: Number(e.target.value) },
                      }))
                    }
                    className="block w-full"
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
