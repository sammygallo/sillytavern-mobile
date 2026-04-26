import { useEffect, useRef, useState } from 'react';
import { Application, MeshPlane, Texture } from 'pixi.js';

/**
 * LivePortrait — POC of a single-image AI-driven character animator.
 *
 * Renders the character avatar through a Pixi.js mesh plane and warps a
 * triangulated grid every frame to fake breathing, blinking and talking
 * without any per-character rigging. Anchors are expressed as ellipses in
 * normalized image space (0..1), so the same defaults work-ish for any
 * roughly-centered portrait. In a future phase these would be detected by
 * MediaPipe (photoreal) or hand-placed in a setup dialog (anime art).
 *
 * NOT YET wired into ChatMessage — this component lives behind a debug route
 * for POC evaluation.
 */

/** A region of interest on the avatar, in normalized 0..1 coordinates. */
export interface AnchorRegion {
  /** Center-x in [0, 1] across the image width. */
  cx: number;
  /** Center-y in [0, 1] across the image height. */
  cy: number;
  /** Horizontal half-width of the elliptical region. */
  rx: number;
  /** Vertical half-height of the elliptical region. */
  ry: number;
}

/** All anchors a portrait needs to drive idle / talk animation. */
export interface PortraitAnchors {
  leftEye: AnchorRegion;
  rightEye: AnchorRegion;
  mouth: AnchorRegion;
}

/** Sensible defaults for a face-centered, camera-facing portrait. */
export const DEFAULT_ANCHORS: PortraitAnchors = {
  leftEye:  { cx: 0.40, cy: 0.42, rx: 0.06, ry: 0.04 },
  rightEye: { cx: 0.60, cy: 0.42, rx: 0.06, ry: 0.04 },
  mouth:    { cx: 0.50, cy: 0.62, rx: 0.08, ry: 0.04 },
};

export interface LivePortraitProps {
  /** URL of the source avatar image. Loaded via Pixi Assets. */
  imageUrl: string;
  /**
   * Longest-side display dimension in CSS pixels. The shorter side is
   * derived from the source image's natural aspect ratio so portraits aren't
   * squashed into a square. Defaults to 256.
   */
  size?: number;
  /** Whether the character is "speaking" — drives mouth opening. */
  isSpeaking?: boolean;
  /** Anchor configuration. Defaults to face-centered presets. */
  anchors?: PortraitAnchors;
  /** Optional class on the wrapper div. */
  className?: string;
}

// 48×48 mesh (2304 verts) so small anchor regions still contain multiple
// vertices to warp. 24×24 was too sparse — eye/mouth ellipses with
// ry≈0.025 could land entirely between vertex rows and produce no visible
// warp at all, while breath (which displaces every vertex globally) was
// the only thing users could see.
const VERTICES_PER_AXIS = 48;

export function LivePortrait({
  imageUrl,
  size = 256,
  isSpeaking = false,
  anchors = DEFAULT_ANCHORS,
  className,
}: LivePortraitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(isSpeaking);
  speakingRef.current = isSpeaking;
  // Track the actual rendered dimensions so the wrapper div sizes to the
  // image's natural aspect ratio rather than a forced square.
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let plane: MeshPlane | null = null;
    let restPositions: Float32Array | null = null;
    let cancelled = false;
    let raf = 0;
    // First blink fires ~700 ms after mount so users see *something* happen
    // immediately. Subsequent blinks use the human-ish 3.5–6 s schedule.
    let blinkPhase = 700;
    let blinkElapsed = 0;
    const startTime = performance.now();

    function randomBlinkInterval() {
      // Real eyes blink every 4–6 s. Add jitter so it doesn't feel mechanical.
      return 3500 + Math.random() * 2500;
    }

    /** Compute closed-amount in [0, 1] given how far into the blink we are. */
    function blinkAmount(elapsedSinceTrigger: number): number {
      // Total blink: 80ms close + 40ms hold + 100ms open
      const close = 80;
      const hold = 40;
      const open = 100;
      const t = elapsedSinceTrigger;
      if (t < close) return t / close;
      if (t < close + hold) return 1;
      if (t < close + hold + open) return 1 - (t - close - hold) / open;
      return 0;
    }

    // Track init through a single promise so cleanup can wait for init to
    // finish before destroying — calling Application.destroy() before init()
    // resolves throws "this._cancelResize is not a function" because
    // _cancelResize is assigned inside init().
    const initPromise: Promise<Application | null> = (async () => {
      // Load the source image FIRST so we can size the Pixi app to the
      // image's natural aspect ratio. Otherwise a portrait avatar gets
      // stretched into a square.
      //
      // Pixi's Assets.load swallows non-extension URLs (the ST thumbnail
      // endpoint uses a query-string for the file name and returns null
      // without throwing). Loading via HTMLImageElement → Texture.from is
      // reliable regardless of URL shape and gives the same GPU texture.
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      try {
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('image load failed: ' + imageUrl));
        });
      } catch (e) {
        console.warn('[LivePortrait]', e);
        return null;
      }
      if (cancelled) return null;

      const aspect = img.naturalWidth / img.naturalHeight;
      const displayWidth = aspect >= 1 ? size : size * aspect;
      const displayHeight = aspect >= 1 ? size / aspect : size;
      setDisplaySize({ w: displayWidth, h: displayHeight });

      const localApp = new Application();
      await localApp.init({
        width: displayWidth,
        height: displayHeight,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (cancelled || !containerRef.current) {
        localApp.destroy(true, { children: true, texture: false });
        return null;
      }
      containerRef.current.appendChild(localApp.canvas);

      const texture = Texture.from(img);

      plane = new MeshPlane({
        texture,
        verticesX: VERTICES_PER_AXIS,
        verticesY: VERTICES_PER_AXIS,
      });
      plane.width = displayWidth;
      plane.height = displayHeight;
      localApp.stage.addChild(plane);
      // Force a first render — without this the canvas can stay blank under
      // React StrictMode's double-mount until the auto-ticker catches up.
      localApp.render();

      // Snapshot rest positions so we can re-derive each frame from a clean
      // baseline rather than accumulating drift.
      restPositions = new Float32Array(plane.geometry.positions);

      let last = performance.now();
      const tick = (now: number) => {
        if (cancelled || !plane || !restPositions) return;
        const dt = now - last;
        last = now;

        // ── Drivers ──────────────────────────────────────────────────────
        blinkElapsed += dt;
        let blink = 0;
        if (blinkElapsed >= blinkPhase) {
          const sinceTrigger = blinkElapsed - blinkPhase;
          blink = blinkAmount(sinceTrigger);
          if (sinceTrigger > 220) {
            blinkElapsed = 0;
            blinkPhase = randomBlinkInterval();
          }
        }

        // Mouth: when speaking, oscillate with light noise around 0.4–0.9 open.
        // When silent, gentle ambient mouth motion (~10% open with sigh-like
        // periodicity) so the user sees the mouth driver is alive even
        // outside of streaming.
        const t = (now - startTime) / 1000;
        const mouth = speakingRef.current
          ? 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 14)) + 0.1 * Math.sin(t * 23)
          : 0.06 + 0.04 * Math.sin((t * Math.PI * 2) / 4.2);

        // Breath: gentle vertical sway of the whole portrait. ~3.5s period.
        const breath = Math.sin((t * Math.PI * 2) / 3.5) * (displayHeight * 0.006);

        // ── Apply to mesh ────────────────────────────────────────────────
        // Anchor regions are normalized 0..1 coords within the IMAGE, so
        // displacement scales need to be in the image's pixel space — not the
        // square `size`, which would distort portraits.
        //
        // FALLOFF_REACH widens the effective influence to 1.8× the user's
        // chosen radius with a smooth quartic decay. Without this, sparse
        // grids miss small ellipses entirely; with this, nearby vertices
        // get partial warp and the motion is always visible.
        const positions = plane.geometry.positions;
        const eyeMaxClosePx = displayHeight * 0.07;
        const mouthMaxOpenPx = displayHeight * 0.06;
        const FALLOFF_REACH = 1.8;

        for (let i = 0; i < positions.length; i += 2) {
          const restX = restPositions[i];
          const restY = restPositions[i + 1];
          const nx = restX / displayWidth;
          const ny = restY / displayHeight;

          let dy = breath; // global breath sway

          // Eyes: vertices near the ellipse get pinched vertically toward
          // the eye center, scaled by blink amount with a smooth falloff
          // that extends past the strict ellipse boundary.
          for (const eye of [anchors.leftEye, anchors.rightEye]) {
            const ex = (nx - eye.cx) / (eye.rx * FALLOFF_REACH);
            const ey = (ny - eye.cy) / (eye.ry * FALLOFF_REACH);
            const d2 = ex * ex + ey * ey;
            if (d2 < 1) {
              const falloff = (1 - d2) * (1 - d2); // quartic — sharper near peak
              const isAbove = ny < eye.cy;
              dy += (isAbove ? 1 : -1) * blink * eyeMaxClosePx * falloff;
            }
          }

          // Mouth: vertices near the ellipse stretch vertically away from
          // the mouth center, opening the mouth.
          {
            const mx = (nx - anchors.mouth.cx) / (anchors.mouth.rx * FALLOFF_REACH);
            const my = (ny - anchors.mouth.cy) / (anchors.mouth.ry * FALLOFF_REACH);
            const d2 = mx * mx + my * my;
            if (d2 < 1) {
              const falloff = (1 - d2) * (1 - d2);
              const isAbove = ny < anchors.mouth.cy;
              dy += (isAbove ? -1 : 1) * mouth * mouthMaxOpenPx * falloff;
            }
          }

          positions[i] = restX;
          positions[i + 1] = restY + dy;
        }

        // Pixi v8 picks up buffer changes automatically when you mutate the
        // backing Float32Array, but we still need to flag it dirty.
        plane.geometry.attributes.aPosition.buffer.update();

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return localApp;
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      // Wait for init to finish before destroying — see comment on initPromise.
      // Pixi v8 takes a {removeView} options object as the first arg (the
      // legacy boolean removeView is interpreted differently). Pass it
      // explicitly so the canvas gets pulled out of the DOM, otherwise React
      // StrictMode's double-mount leaves a dead orphan canvas behind.
      initPromise.then((readyApp) => {
        if (!readyApp) return;
        const canvas = readyApp.canvas;
        readyApp.destroy({ removeView: true }, { children: true, texture: false });
        // Belt-and-braces: ensure canvas is gone even if Pixi missed it.
        if (canvas?.parentElement) canvas.parentElement.removeChild(canvas);
      });
    };
  }, [imageUrl, size, anchors]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: displaySize ? displaySize.w : size,
        height: displaySize ? displaySize.h : size,
      }}
    />
  );
}
