import { Volume2 } from 'lucide-react';
import { extensionRegistry } from '../registry';
import type { ExtensionManifest } from '../types';

const manifest: ExtensionManifest = {
  id: 'tts',
  displayName: 'Text-to-Speech',
  description:
    'Read AI messages aloud using your device\'s speech engine. Supports auto-read on new messages.',
  version: '1.0.0',
  icon: Volume2,
  defaultEnabled: true,
};

extensionRegistry.register(manifest);
