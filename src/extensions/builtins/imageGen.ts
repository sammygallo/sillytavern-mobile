import { Image } from 'lucide-react';
import { extensionRegistry } from '../registry';
import type { ExtensionManifest } from '../types';

const manifest: ExtensionManifest = {
  id: 'imageGen',
  displayName: 'Image Generation',
  description:
    'Generate images from prompts using Pollinations or a local Stable Diffusion WebUI. Images are inserted inline in chat.',
  version: '1.0.0',
  icon: Image,
  defaultEnabled: true,
};

extensionRegistry.register(manifest);
