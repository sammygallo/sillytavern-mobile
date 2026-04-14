// Server Extension Command Bridge
// Reads manifest.json slash_commands declarations from installed server extensions
// and registers proxy STscript commands that call the extension's server-side API.
//
// Called by serverExtensionStore.fetchManifests() after each installed-list refresh.

import { registerCommand, unregisterCommand, getCommand } from '../utils/stscript/registry';
import { apiRequest } from '../api/client';
import type { ExtensionManifestData } from '../api/extensionsApi';
import type { InstalledExtensionInfo } from '../stores/serverExtensionStore';

// Track command names registered via this bridge so we can clean up on re-registration.
const bridgeRegisteredNames = new Set<string>();

/** Strip the "third-party/" prefix the ST backend adds to local/global extensions. */
function baseName(name: string): string {
  return name.replace(/^third-party\//, '');
}

/**
 * Sync manifest-declared slash commands into the STscript registry.
 * Safe to call multiple times — clears previous bridge registrations first.
 */
export function registerServerExtensionCommands(
  manifests: Record<string, ExtensionManifestData>,
  installed: InstalledExtensionInfo[],
): void {
  // Clean up previous bridge registrations
  for (const name of bridgeRegisteredNames) {
    unregisterCommand(name);
  }
  bridgeRegisteredNames.clear();

  for (const ext of installed) {
    const manifest = manifests[ext.name];
    if (!manifest?.slash_commands?.length) continue;

    const extName = baseName(ext.name);

    for (const cmd of manifest.slash_commands) {
      const cmdName = cmd.name.toLowerCase();

      // Don't overwrite built-in commands that weren't registered by this bridge
      if (getCommand(cmdName) && !bridgeRegisteredNames.has(cmdName)) {
        console.warn(
          `[ServerCommandBridge] /${cmdName} from "${extName}" conflicts with a built-in command — skipping`,
        );
        continue;
      }

      registerCommand({
        name: cmdName,
        aliases: cmd.aliases,
        description: cmd.description ?? `Extension command from ${extName}`,
        category: 'system',
        usage: `/${cmdName} [args]`,
        async handler(args, rawArgs, ctx) {
          try {
            const result = await apiRequest<{ result?: string; output?: string } | string>(
              `/api/plugins/${encodeURIComponent(extName)}/slash-command`,
              {
                method: 'POST',
                body: JSON.stringify({ command: cmdName, args, rawArgs }),
              },
            );
            if (typeof result === 'string') return result;
            return result?.result ?? result?.output ?? '';
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.showToast(`/${cmdName} failed: ${msg}`, 'error');
            return '';
          }
        },
      });

      bridgeRegisteredNames.add(cmdName);
      for (const alias of cmd.aliases ?? []) {
        bridgeRegisteredNames.add(alias.toLowerCase());
      }
    }
  }

  if (bridgeRegisteredNames.size > 0) {
    console.info(
      `[ServerCommandBridge] Registered ${bridgeRegisteredNames.size} extension command(s): ${[...bridgeRegisteredNames].join(', ')}`,
    );
  }
}
