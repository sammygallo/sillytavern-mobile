import { getCsrfToken } from './client';
import { useSettingsStore } from '../stores/settingsStore';
import type { PortraitAnchors } from '../components/chat/LivePortrait';

/**
 * Auto-detect Live Portrait anchor coordinates from a character avatar by
 * asking the user's currently-configured vision-capable LLM to look at the
 * image and return JSON.
 *
 * Uses the same SillyTavern backend chat-completions proxy the chat already
 * relies on, so auth/CSRF/provider routing all reuse the existing plumbing.
 * One-shot (`stream: false`) so we get the full response in a single fetch.
 *
 * Throws on network error or unparseable response. Caller should surface a
 * toast — the user can always fall back to manual click-to-place.
 */

type AnchorCenters = {
  leftEye: { cx: number; cy: number };
  rightEye: { cx: number; cy: number };
  mouth: { cx: number; cy: number };
};

/** Default radii to apply to each detected center. Match the manual setup defaults. */
const DEFAULT_RADII = {
  leftEye:  { rx: 0.06, ry: 0.04 },
  rightEye: { rx: 0.06, ry: 0.04 },
  mouth:    { rx: 0.07, ry: 0.04 },
};

const DETECTION_PROMPT =
  `Look at this character portrait. Identify the center of the LEFT eye, the center of the RIGHT eye, ` +
  `and the center of the MOUTH. Return ONLY a JSON object with normalized 0..1 coordinates ` +
  `(0,0 = top-left of image, 1,1 = bottom-right), exactly this shape, no markdown, no commentary:\n\n` +
  `{"leftEye":{"cx":0.42,"cy":0.30},"rightEye":{"cx":0.58,"cy":0.30},"mouth":{"cx":0.50,"cy":0.50}}\n\n` +
  `LEFT and RIGHT are from the CHARACTER's perspective (so the character's left eye appears on the ` +
  `right side of the image when they face the camera). If the character is facing sideways and an eye ` +
  `is hidden, place that eye's coordinates at where it would be if visible. Be precise — these ` +
  `coordinates drive an animation overlay.`;

/**
 * Fetch an image URL and return its raw bytes as base64 + the inferred MIME type.
 * Re-encodes via canvas to JPEG so the payload to the LLM is small (PNGs of ST
 * avatars can be 700KB+ which slows the API call without improving detection).
 */
async function imageUrlToBase64Jpeg(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load image: ' + imageUrl));
  });
  // Cap at 768px on the long side — plenty for landmark detection, much faster
  // upload than full-resolution avatars.
  const MAX = 768;
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64 = dataUrl.split(',')[1] ?? '';
  return { base64, mimeType: 'image/jpeg' };
}

/** Strip provider noise (markdown fences, leading text) and extract the first JSON object. */
function extractJsonObject(raw: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }
  // Find the first {...} block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = raw.slice(start, end + 1);
    return JSON.parse(slice);
  }
  throw new Error('No JSON object found in response: ' + raw.slice(0, 200));
}

function isAnchorCenters(value: unknown): value is AnchorCenters {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const ok = (p: unknown) =>
    !!p &&
    typeof p === 'object' &&
    typeof (p as Record<string, unknown>).cx === 'number' &&
    typeof (p as Record<string, unknown>).cy === 'number';
  return ok(v.leftEye) && ok(v.rightEye) && ok(v.mouth);
}

/**
 * Run vision-LLM auto-detection on a character avatar and return full
 * Live Portrait anchors (centers + default radii).
 */
export async function detectFaceAnchors(imageUrl: string): Promise<PortraitAnchors> {
  const { activeProvider, activeModel } = useSettingsStore.getState();
  const provider = activeProvider || 'claude';
  const model = activeModel || 'claude-sonnet-4-6';

  const { base64, mimeType } = await imageUrlToBase64Jpeg(imageUrl);
  const token = await getCsrfToken();

  const body = {
    stream: false,
    max_tokens: 256,
    temperature: 0,
    model,
    chat_completion_source: provider,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: DETECTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      },
    ],
  };

  const response = await fetch('/api/backends/chat-completions/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Vision request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  // Pull the text content out of whichever response shape the backend returned.
  // Two formats land here depending on the provider:
  //   • OpenAI-style:    { choices: [{ message: { content: "..." } }] }
  //   • Anthropic-native: { content: [{ type: "thinking", ... }, { type: "text", text: "..." }] }
  // Claude with extended thinking yields the second; we read text blocks from
  // either shape and concatenate (just in case there are multiple).
  const contentText = (() => {
    const openai = data?.choices?.[0]?.message?.content;
    if (typeof openai === 'string' && openai.length > 0) return openai;
    const anthropic = data?.content;
    if (Array.isArray(anthropic)) {
      return anthropic
        .filter((b: unknown) => (b as { type?: string })?.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('\n');
    }
    return '';
  })();
  if (!contentText) {
    throw new Error('Vision response had no readable text content');
  }

  const parsed = extractJsonObject(contentText);
  if (!isAnchorCenters(parsed)) {
    throw new Error('Vision response did not contain expected anchor coordinates');
  }

  // Clamp to [0, 1] in case the model returns a value just outside.
  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  return {
    leftEye:  { cx: clamp(parsed.leftEye.cx),  cy: clamp(parsed.leftEye.cy),  ...DEFAULT_RADII.leftEye },
    rightEye: { cx: clamp(parsed.rightEye.cx), cy: clamp(parsed.rightEye.cy), ...DEFAULT_RADII.rightEye },
    mouth:    { cx: clamp(parsed.mouth.cx),    cy: clamp(parsed.mouth.cy),    ...DEFAULT_RADII.mouth },
  };
}
