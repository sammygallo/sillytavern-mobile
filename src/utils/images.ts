// Phase 6.1 — image attachments for chat messages.
//
// This module owns three concerns:
//   1. Shrinking user-picked images to a sane payload size before we ship
//      base64 across the wire (max edge + JPEG re-encode).
//   2. Parsing/serializing between data-URL form (what we store on
//      ChatMessage.images + render in <img src>) and {mimeType, base64}
//      tuples (what the API client folds into provider content parts).
//   3. Deciding whether the current provider+model can actually *see*
//      images — non-vision models get a friendly inline error instead of
//      a silent 400 from the backend.

/** Largest edge (pixels) after resize. Bigger images get scaled down
 *  proportionally; smaller ones pass through untouched. */
export const MAX_IMAGE_EDGE = 1024;
/** JPEG quality used when we have to re-encode. Tuned for "looks fine on
 *  a phone screen" without blowing up the base64 payload. */
export const IMAGE_JPEG_QUALITY = 0.85;
/** Reject files larger than this pre-compression. Users will understand
 *  a clear error faster than a 10s hang on a 40MB raw camera capture. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Hard cap on number of attachments per message. Mostly a UX choice —
 *  the grid render falls apart beyond ~6, and token budgets do too. */
export const MAX_IMAGES_PER_MESSAGE = 4;
/** Accepted MIME types the picker will filter down to. Keep aligned with
 *  the `accept=` string on the file input. */
export const ACCEPTED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export interface ImagePart {
  mimeType: string;
  /** Pure base64 payload, NO `data:...;base64,` prefix. */
  base64: string;
}

/** Split a data URL into `{mimeType, base64}`. Returns `null` for
 *  malformed URLs so callers can filter out bad entries. */
export function dataUrlToPart(dataUrl: string): ImagePart | null {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export function partToDataUrl(part: ImagePart): string {
  return `data:${part.mimeType};base64,${part.base64}`;
}

/** Read a File into a data URL via FileReader (simpler than fetch()/blob,
 *  and resolves before the <img> load kicks off the canvas work). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Expected string result from FileReader'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataUrl;
  });
}

/**
 * Compress a user-picked image into a JPEG data URL whose longest edge
 * is ≤ MAX_IMAGE_EDGE. Small images skip the canvas round-trip.
 *
 * GIFs are rasterized to a single JPEG frame — animated GIF preservation
 * is out of scope for Phase 6.1 (and providers don't consume animation
 * anyway). Returns the compressed data URL.
 */
export async function compressImageFile(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB)`
    );
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageFromDataUrl(originalDataUrl);

  // Bail out of the canvas round-trip for already-small images. Skipping
  // is a win for PNGs with transparency where JPEG would be lossy.
  const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longestEdge <= MAX_IMAGE_EDGE && file.size <= 1024 * 1024) {
    return originalDataUrl;
  }

  const scale = longestEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longestEdge : 1;
  const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Fill a white background so PNG transparency doesn't turn into black
  // in the JPEG output.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
}

/** Bulk compress with per-file isolation — one bad file doesn't block
 *  the rest of the batch. Returns successful data URLs only; callers get
 *  a separate error list for UI surfacing. */
export async function compressImageFiles(
  files: File[]
): Promise<{ dataUrls: string[]; errors: string[] }> {
  const dataUrls: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const dataUrl = await compressImageFile(file);
      dataUrls.push(dataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'compression failed';
      errors.push(`${file.name}: ${msg}`);
    }
  }
  return { dataUrls, errors };
}

// ---------------- Vision capability detection ----------------

/**
 * Allow-list of (provider, model-pattern) tuples that can see images.
 * Matched substring-insensitively against `${provider}:${model}` so we
 * don't need to enumerate every point-release.
 *
 * Kept narrow on purpose — better to fail-closed (fall back to the
 * non-vision inline error) than to send a vision payload to a model
 * that returns a 400 three seconds later.
 */
const VISION_MODEL_PATTERNS: Array<{ provider: string; modelContains: string[] }> = [
  // OpenAI: gpt-4o family + gpt-4-vision + gpt-4-turbo (all see images)
  {
    provider: 'openai',
    modelContains: ['gpt-4o', 'gpt-4-vision', 'gpt-4-turbo', 'gpt-4.1', 'o1', 'o3', 'o4'],
  },
  // Claude: any claude-3+ (all modern Claude models are multimodal)
  {
    provider: 'claude',
    modelContains: ['claude-3', 'claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'],
  },
  // Gemini: all modern Gemini models handle inline_data
  {
    provider: 'makersuite',
    modelContains: ['gemini-1.5', 'gemini-2', 'gemini-pro-vision'],
  },
  // Mistral: Pixtral variants only
  {
    provider: 'mistralai',
    modelContains: ['pixtral'],
  },
  // OpenRouter: model id embeds provider/model — reuse the substrings
  // above under the openrouter provider bucket.
  {
    provider: 'openrouter',
    modelContains: [
      'gpt-4o',
      'gpt-4-vision',
      'gpt-4-turbo',
      'gpt-4.1',
      'claude-3',
      'claude-sonnet-4',
      'claude-opus-4',
      'claude-haiku-4',
      'gemini-1.5',
      'gemini-2',
      'pixtral',
      'vision',
    ],
  },
  // Groq: llama-4 + llama-3.2 vision variants
  {
    provider: 'groq',
    modelContains: ['llama-4', 'llama-3.2-11b-vision', 'llama-3.2-90b-vision'],
  },
];

export function supportsVision(provider: string, model: string): boolean {
  const p = (provider || '').toLowerCase();
  const m = (model || '').toLowerCase();
  for (const entry of VISION_MODEL_PATTERNS) {
    if (entry.provider !== p) continue;
    for (const needle of entry.modelContains) {
      if (m.includes(needle.toLowerCase())) return true;
    }
  }
  return false;
}
