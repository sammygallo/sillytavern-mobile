import { apiRequest } from './client';
import { api } from './client';
import { useSettingsStore } from '../stores/settingsStore';

export type ImageGenBackend = 'pollinations' | 'horde' | 'sdwebui' | 'dalle';

export interface HordeModelInfo {
  name: string;
  /** Number of workers currently serving this model. */
  count: number;
  /** Pending jobs queued for this model. */
  queued: number;
  /** Estimated wait time in seconds. */
  eta: number;
}

export interface ImageGenResult {
  /** Raw base64 string — no data URI prefix. */
  base64: string;
  format: string;
}

// ---------------------------------------------------------------------------
// SSE stream helper (same pattern as summarizeStore)
// ---------------------------------------------------------------------------

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const content =
              json.choices?.[0]?.delta?.content ||
              json.choices?.[0]?.text ||
              json.delta?.text ||
              (json.type === 'content_block_delta' ? json.delta?.text : null) ||
              json.content ||
              json.message?.content?.[0]?.text ||
              '';
            if (content) result += content;
          } catch {
            if (data.length > 0 && data !== 'undefined') result += data;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result.trim();
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const imageGenApi = {
  async pingSdWebui(url: string, auth?: string): Promise<boolean> {
    try {
      await apiRequest('/api/sd/ping', {
        method: 'POST',
        body: JSON.stringify({ url, auth: auth || undefined }),
      });
      return true;
    } catch {
      return false;
    }
  },

  async generatePollinations(opts: {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    width?: number;
    height?: number;
  }): Promise<ImageGenResult> {
    const result = await apiRequest<{ image: string }>('/api/sd/pollinations/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: opts.prompt,
        negative_prompt: opts.negativePrompt,
        // 'sana' is the only model the legacy anonymous endpoint serves
        // as of 2026-04 — Pollinations silently downgrades anything else.
        // Caller can still override via the Settings dropdown if a model
        // name returned by the live /models endpoint changes.
        model: opts.model ?? 'sana',
        width: opts.width ?? 1024,
        height: opts.height ?? 1024,
        seed: -1,
      }),
    });
    return { base64: result.image, format: 'jpg' };
  },

  /**
   * Fetch the live list of Pollinations model names. Returns a fallback
   * single-element array on failure so the UI dropdown is never empty.
   */
  async getPollinationsModels(): Promise<string[]> {
    try {
      const result = await apiRequest<unknown>('/api/sd/pollinations/models', {
        method: 'POST',
        body: '{}',
      });
      if (Array.isArray(result)) {
        const names = result.filter((m): m is string => typeof m === 'string');
        if (names.length > 0) return names;
      }
    } catch {
      // fall through to fallback
    }
    return ['sana'];
  },

  /**
   * Fetch popular AI Horde image models, sorted by worker count.
   * Returns [] on failure — caller falls back to a hardcoded default.
   */
  async getHordeModels(): Promise<HordeModelInfo[]> {
    try {
      const result = await apiRequest<HordeModelInfo[]>('/api/sd/horde/models', {
        method: 'POST',
        body: '{}',
      });
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  },

  /**
   * Generate via AI Horde. Backend handles the async enqueue + poll dance
   * and returns the final base64 image. Anonymous key (0000000000) works
   * but is slow; users can supply their own free key for higher priority.
   */
  async generateHorde(opts: {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    apiKey?: string;
    nsfw?: boolean;
  }): Promise<ImageGenResult> {
    const result = await apiRequest<{ image: string }>('/api/sd/horde/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: opts.prompt,
        negative_prompt: opts.negativePrompt,
        model: opts.model ?? 'stable_diffusion',
        width: opts.width ?? 512,
        height: opts.height ?? 512,
        steps: opts.steps ?? 25,
        cfg_scale: opts.cfgScale ?? 7,
        api_key: opts.apiKey || undefined,
        nsfw: !!opts.nsfw,
      }),
    });
    return { base64: result.image, format: 'webp' };
  },

  async generateSdWebui(opts: {
    url: string;
    auth?: string;
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
  }): Promise<ImageGenResult> {
    const result = await apiRequest<{ images: string[] }>('/api/sd/generate', {
      method: 'POST',
      body: JSON.stringify({
        url: opts.url,
        auth: opts.auth || undefined,
        prompt: opts.prompt,
        negative_prompt: opts.negativePrompt ?? '',
        width: opts.width ?? 512,
        height: opts.height ?? 512,
        steps: opts.steps ?? 20,
        cfg_scale: opts.cfgScale ?? 7,
        seed: -1,
      }),
    });
    if (!result.images || result.images.length === 0) {
      throw new Error('No images returned from SD WebUI');
    }
    return { base64: result.images[0], format: 'png' };
  },

  /**
   * Generate an image using OpenAI DALL-E (2 or 3).
   * Calls the SillyTavern backend at POST /api/openai/generate-image,
   * which forwards to https://api.openai.com/v1/images/generations.
   */
  async generateDalle(opts: {
    prompt: string;
    model?: 'dall-e-3' | 'dall-e-2';
    size?: string;
    quality?: 'standard' | 'hd';
  }): Promise<ImageGenResult> {
    const model = opts.model ?? 'dall-e-3';
    const body: Record<string, unknown> = {
      prompt: opts.prompt,
      model,
      size: opts.size ?? '1024x1024',
      response_format: 'b64_json',
      n: 1,
    };
    // Quality is only supported by DALL-E 3
    if (model === 'dall-e-3') {
      body.quality = opts.quality ?? 'standard';
    }

    const result = await apiRequest<{
      data: { b64_json?: string; url?: string; revised_prompt?: string }[];
    }>('/api/openai/generate-image', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const img = result.data?.[0];
    if (!img?.b64_json) {
      throw new Error('No image data returned from DALL-E');
    }
    return { base64: img.b64_json, format: 'png' };
  },

  /**
   * Generate an image prompt from recent chat context using the active LLM.
   * Returns a detailed visual description suitable for image generation.
   */
  async generatePromptFromContext(
    messages: { name: string; isUser: boolean; isSystem: boolean; content: string }[],
    characterName: string
  ): Promise<string> {
    const { activeProvider, activeModel } = useSettingsStore.getState();

    // Take last 10 non-system messages for context
    const recent = messages
      .filter((m) => !m.isSystem)
      .slice(-10);

    if (recent.length === 0) {
      throw new Error('No messages to generate a prompt from');
    }

    const transcript = recent
      .map((m) => `${m.isUser ? 'User' : characterName}: ${m.content}`)
      .join('\n');

    const context: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      {
        role: 'system',
        content:
          'You are a creative art director. Based on the conversation below, write a detailed visual description for an image generation AI that captures the current scene. ' +
          'Focus on: character appearance, setting, mood, lighting, and composition. ' +
          'Output ONLY the image prompt — no explanations, no preamble, no quotes.',
      },
      {
        role: 'user',
        content: `Write an image generation prompt for this scene:\n\n${transcript}`,
      },
    ];

    const stream = await api.generateMessage(
      context,
      characterName,
      activeProvider,
      activeModel,
    );

    if (!stream) {
      throw new Error('No response from LLM');
    }

    return collectStream(stream);
  },
};
