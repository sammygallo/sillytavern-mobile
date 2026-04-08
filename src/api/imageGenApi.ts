import { apiRequest } from './client';

export type ImageGenBackend = 'pollinations' | 'sdwebui';

export interface ImageGenResult {
  /** Raw base64 string — no data URI prefix. */
  base64: string;
  format: string;
}

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
        model: opts.model ?? 'flux',
        width: opts.width ?? 1024,
        height: opts.height ?? 1024,
        seed: -1,
      }),
    });
    return { base64: result.image, format: 'jpg' };
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
};
