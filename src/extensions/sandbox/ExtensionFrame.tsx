/**
 * ExtensionFrame
 *
 * Owns the sandboxed <iframe> for a single server-side extension.
 * The iframe loads the extension's index.js with the shim already in scope,
 * then communicates back via postMessage.
 *
 * Mounting lifecycle:
 *   1. Iframe is created with srcdoc = shim + <script src="{scriptUrl}">.
 *   2. Extension's DOMContentLoaded runs → extension writes to #extensions_settings.
 *   3. window.load fires → shim posts ST_READY → component pushes current context.
 *   4. Thereafter, lifecycle events from sandboxEventBus are forwarded into the
 *      iframe as ST_LIFECYCLE messages, and the context is re-pushed on each one.
 *
 * Auto-resize:
 *   The shim posts ST_RESIZE with the body's scrollHeight whenever a ResizeObserver
 *   fires.  This component adjusts the iframe height accordingly so no scroll bars
 *   appear and the iframe blends into the settings card.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { SHIM_CODE } from './extensionShim';
import { subscribeToSandboxEvents } from './sandboxEventBus';
import { useCharacterStore } from '../../stores/characterStore';
import { useChatStore } from '../../stores/chatStore';
import { usePersonaStore } from '../../stores/personaStore';
import { useAuthStore } from '../../stores/authStore';
import { showToastGlobal } from '../../components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtensionFrameProps {
  /** Extension name as returned by the discovery API, e.g. "third-party/my-ext". */
  extensionName: string;
  /**
   * URL of the extension's index.js served by the ST backend.
   * Typically /scripts/extensions/third-party/{name}/index.js
   */
  scriptUrl: string;
  /** Optional extra CSS classes on the iframe wrapper div. */
  className?: string;
  /** Called with true the first time the iframe reports non-zero content. */
  onHasContent?: (hasContent: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context snapshot builder (reads Zustand state imperatively — safe outside render)
// ---------------------------------------------------------------------------

function buildContextSnapshot() {
  const charState = useCharacterStore.getState();
  const chatState = useChatStore.getState();
  const personaState = usePersonaStore.getState();
  const authState = useAuthStore.getState();

  const activePersonaId = personaState.activePersonaId;
  const activePersona = activePersonaId
    ? personaState.personas.find((p) => p.id === activePersonaId) ?? null
    : null;

  const charIndex = charState.selectedCharacter
    ? charState.characters.findIndex((c) => c.avatar === charState.selectedCharacter?.avatar)
    : null;

  return {
    characters: charState.characters.map((c) => ({ name: c.name, avatar: c.avatar ?? '' })),
    characterId: charIndex !== -1 ? charIndex : null,
    groupId: charState.isGroupChatMode ? 'group' : null,
    chatId: chatState.currentChatFile,
    name1: activePersona?.name ?? authState.currentUser?.name ?? 'You',
    name2: charState.isGroupChatMode
      ? 'Group Chat'
      : (charState.selectedCharacter?.name ?? 'Assistant'),
    // Send the last 100 messages in ST's wire format
    chat: chatState.messages.slice(-100).map((m) => ({
      name: m.name,
      is_user: m.isUser,
      is_system: m.isSystem,
      mes: m.content,
    })),
    settings: {},
    extensionSettings: {},
    personas: personaState.personas.map((p) => ({ id: p.id, name: p.name })),
  };
}

// ---------------------------------------------------------------------------
// srcdoc builder
// ---------------------------------------------------------------------------

function buildSrcdoc(scriptUrl: string): string {
  // Escape the URL for safe insertion into an HTML attribute
  const safeUrl = scriptUrl.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    padding: 8px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    color: var(--color-text-primary, #e8e8e8);
    background: transparent;
  }
  * { box-sizing: border-box; }
  input, select, textarea, button {
    font-family: inherit;
    font-size: inherit;
  }
</style>
<script>${SHIM_CODE}</script>
</head>
<body>
<div id="extensions_settings" class="extensions_settings"></div>
<div id="send_form" style="display:none"></div>
<div id="chat" style="display:none"></div>
<script src="${safeUrl}"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExtensionFrame({
  extensionName,
  scriptUrl,
  className,
  onHasContent,
}: ExtensionFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const readyRef = useRef(false);
  const hasContentReportedRef = useRef(false);

  // Stable ref so the event bus subscription (useEffect with [] deps) always
  // calls the current version of pushContext without needing re-subscription.
  const pushContextRef = useRef<() => void>(() => {});

  function pushContext() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'ST_CONTEXT_UPDATE', context: buildContextSnapshot() },
      '*',
    );
  }

  // Keep ref in sync each render
  pushContextRef.current = pushContext;

  // ── RPC handler ──────────────────────────────────────────────────────────
  function handleRpc(msg: { id: string; method: string; args: unknown[] }) {
    const respond = (result?: unknown, error?: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'ST_RPC_RESPONSE', id: msg.id, result, error },
        '*',
      );
    };

    switch (msg.method) {
      case 'saveMetadata':
      case 'saveSettings':
      case 'reloadCurrentChat':
        respond(null);
        break;
      case 'sendSystemMessage':
        respond(null);
        break;
      default:
        respond(null, `Unsupported RPC method: ${msg.method}`);
    }
  }

  // ── postMessage handler ───────────────────────────────────────────────────
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data as { type?: string; [k: string]: unknown };
      if (!msg?.type || !String(msg.type).startsWith('ST_')) return;

      switch (msg.type) {
        case 'ST_READY':
          readyRef.current = true;
          pushContextRef.current();
          break;

        case 'ST_RESIZE': {
          const h = Number(msg.height) || 0;
          setHeight(h);
          if (h > 0 && !hasContentReportedRef.current) {
            hasContentReportedRef.current = true;
            onHasContent?.(true);
          }
          break;
        }

        case 'ST_TOAST':
          showToastGlobal(
            String(msg.message ?? ''),
            (msg.level as 'info' | 'warning' | 'error' | 'success') ?? 'info',
          );
          break;

        case 'ST_RPC':
          handleRpc(msg as { id: string; method: string; args: unknown[] });
          break;

        // Extension emitted an event — re-broadcast to the bus if desired.
        // For now, just ignore (extensions can emit to themselves).
        case 'ST_EVENT_EMIT':
          break;
      }
    },
    [onHasContent], // extensionName captured via closure, but doesn't change
  );

  // ── Wire up postMessage listener ──────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // ── Subscribe to sandboxEventBus for lifecycle events ─────────────────────
  useEffect(() => {
    return subscribeToSandboxEvents((eventName, args) => {
      if (!readyRef.current) return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'ST_LIFECYCLE', event: eventName, args },
        '*',
      );
      // Re-push fresh context so extensions always have up-to-date data
      pushContextRef.current();
    });
  }, []);

  // ── Build srcdoc once ─────────────────────────────────────────────────────
  // We use a ref so the srcdoc doesn't change on re-renders (which would cause
  // the iframe to reload).
  const srcdocRef = useRef<string | null>(null);
  if (srcdocRef.current === null) {
    srcdocRef.current = buildSrcdoc(scriptUrl);
  }

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: `${height}px`,
        overflow: 'hidden',
        transition: 'height 0.2s ease',
        minHeight: 0,
      }}
    >
      <iframe
        ref={iframeRef}
        // Use srcDoc (React's camelCase spelling)
        srcDoc={srcdocRef.current}
        sandbox="allow-scripts allow-same-origin allow-forms"
        title={`Extension UI: ${extensionName}`}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: 'transparent',
        }}
      />
    </div>
  );
}
