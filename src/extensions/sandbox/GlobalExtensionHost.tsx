import { useEffect } from 'react';
import { ExtensionFrame } from './ExtensionFrame';
import { useServerExtensionStore } from '../../stores/serverExtensionStore';
import { useAuthStore } from '../../stores/authStore';

function extensionScriptUrl(extName: string): string {
  const base = extName.replace(/^third-party\//, '');
  return `/scripts/extensions/third-party/${base}/index.js`;
}

/**
 * Mounts one hidden, always-alive ExtensionFrame per installed server
 * extension so their background work (WebSockets, timers, generation
 * interceptors, lifecycle-event subscribers) keeps running even when the
 * settings panel is closed.
 *
 * Caveat: the settings page still mounts its own visible ExtensionFrame, so
 * each extension's index.js runs twice concurrently while settings are open.
 * Extensions that own unique resources (e.g. a single WebSocket connection)
 * should guard their init with their own singleton check.
 */
export function GlobalExtensionHost() {
  const installed = useServerExtensionStore((s) => s.installed);
  const fetchInstalled = useServerExtensionStore((s) => s.fetchInstalled);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) fetchInstalled();
  }, [isAuthenticated, fetchInstalled]);

  if (!isAuthenticated) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        visibility: 'hidden',
      }}
    >
      {installed.map((ext) => (
        <ExtensionFrame
          key={ext.name}
          extensionName={ext.name}
          scriptUrl={extensionScriptUrl(ext.name)}
          allowSlots
        />
      ))}
    </div>
  );
}
