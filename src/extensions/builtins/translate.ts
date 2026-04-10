import { Languages } from 'lucide-react';
import { extensionRegistry } from '../registry';
import type { ExtensionManifest } from '../types';

const manifest: ExtensionManifest = {
  id: 'translate',
  displayName: 'Translation',
  description:
    'Translate AI messages to your preferred language. Tap the globe icon on any message.',
  version: '1.0.0',
  icon: Languages,
  defaultEnabled: true,
};

extensionRegistry.register(manifest);
