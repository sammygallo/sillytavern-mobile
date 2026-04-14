/**
 * Sandbox Event Bus
 *
 * Decoupled pub/sub that lets any React component (ChatView, chatStore, etc.)
 * broadcast SillyTavern lifecycle events to every mounted ExtensionFrame, without
 * those callers needing to hold references to the iframes.
 *
 * Matching event name strings:
 *   'chatChanged'        ← fire when currentChatFile changes
 *   'generationStarted'  ← fire when streaming begins
 *   'generationAfter'    ← fire after a response is fully received
 *   'messageReceived'    ← fire when an AI message lands
 *   'messageSent'        ← fire when user message is sent
 *   'characterEdited'    ← fire when character is changed/loaded
 */

type BusListener = (eventName: string, args: unknown[]) => void;

const listeners = new Set<BusListener>();

/** Register a listener.  Returns an unsubscribe function. */
export function subscribeToSandboxEvents(listener: BusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fire a lifecycle event to all mounted ExtensionFrames.
 *
 * @param eventName  The ST event_types value (e.g. 'chatChanged').
 * @param args       Optional arguments forwarded to the extension callback.
 */
export function fireSandboxLifecycleEvent(eventName: string, args: unknown[] = []): void {
  for (const listener of listeners) {
    try {
      listener(eventName, args);
    } catch {
      // don't let a misbehaving frame take down the bus
    }
  }
}
