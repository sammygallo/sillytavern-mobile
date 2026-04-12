// Quick Reply commands: /run, /qr-create, /qr-delete, /qr-update, /qr-get

import { registerCommand } from '../registry';
import { executeClosure, isClosure, unwrapClosure } from '../executor';
import type { ParsedArg, ExecutionContext } from '../types';

function getNamedArg(args: ParsedArg[], key: string): string | undefined {
  return args.find(a => a.key === key)?.value;
}

function getUnnamedArgs(args: ParsedArg[]): string {
  return args.filter(a => !a.key).map(a => a.value).join(' ');
}

async function getQRStore() {
  const { useQuickReplyStore } = await import('../../../stores/quickReplyStore');
  return useQuickReplyStore.getState();
}

registerCommand({
  name: 'run',
  description: 'Execute a Quick Reply entry or closure by label',
  category: 'quickreply',
  usage: '/run [set.label | {: closure :}]',
  async handler(args, rawArgs, ctx) {
    // Check for inline closure first
    const closureArg = args.find(a => !a.key && isClosure(a.value));
    if (closureArg) {
      return await executeClosure(unwrapClosure(closureArg.value), ctx);
    }

    const label = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!label) return '';

    const store = await getQRStore();
    let entry: { message: string } | undefined;

    // Try "setName.entryLabel" format
    if (label.includes('.')) {
      const [setName, entryLabel] = label.split('.', 2);
      const set = store.sets.find(s => s.name.toLowerCase() === setName.toLowerCase());
      entry = set?.entries.find(e => e.label.toLowerCase() === entryLabel.toLowerCase());
    }

    // Fall back to searching all sets by label
    if (!entry) {
      for (const set of store.sets) {
        const found = set.entries.find(e => e.label.toLowerCase() === label.toLowerCase());
        if (found) { entry = found; break; }
      }
    }

    if (!entry) {
      ctx.showToast(`/run: QR entry "${label}" not found`, 'error');
      return '';
    }

    // Execute the QR message as a script
    return await executeClosure(entry.message, ctx);
  },
});

registerCommand({
  name: 'qr-create',
  description: 'Create a Quick Reply entry',
  category: 'quickreply',
  usage: '/qr-create set=SetName label=Label message=Text',
  async handler(args, _raw, ctx) {
    const setName = getNamedArg(args, 'set');
    const label = getNamedArg(args, 'label');
    const message = getNamedArg(args, 'message') || getUnnamedArgs(args) || ctx.pipe;

    if (!label) { ctx.showToast('/qr-create: label required', 'error'); return ''; }

    const store = await getQRStore();
    let targetSet = setName
      ? store.sets.find(s => s.name.toLowerCase() === setName.toLowerCase())
      : store.sets.find(s => s.id === store.activeSetId);

    if (!targetSet && setName) {
      store.createSet(setName);
      targetSet = store.sets.find(s => s.name === setName);
    }

    if (targetSet) {
      store.addEntry(targetSet.id, label, message || '');
      return label;
    }
    ctx.showToast('/qr-create: no active QR set', 'error');
    return '';
  },
});

registerCommand({
  name: 'qr-delete',
  description: 'Delete a Quick Reply entry',
  category: 'quickreply',
  usage: '/qr-delete set=SetName label=Label',
  async handler(args, _raw, ctx) {
    const setName = getNamedArg(args, 'set');
    const label = getNamedArg(args, 'label') || getUnnamedArgs(args);

    if (!label) { ctx.showToast('/qr-delete: label required', 'error'); return ''; }

    const store = await getQRStore();
    const targetSet = setName
      ? store.sets.find(s => s.name.toLowerCase() === setName.toLowerCase())
      : store.sets.find(s => s.id === store.activeSetId);

    if (targetSet) {
      const entry = targetSet.entries.find(e => e.label.toLowerCase() === label.toLowerCase());
      if (entry) {
        store.deleteEntry(targetSet.id, entry.id);
        return label;
      }
    }
    ctx.showToast(`/qr-delete: "${label}" not found`, 'error');
    return '';
  },
});

registerCommand({
  name: 'qr-update',
  description: 'Update a Quick Reply entry',
  category: 'quickreply',
  usage: '/qr-update set=SetName label=Label [newlabel=NewLabel] [message=Text]',
  async handler(args, _raw, ctx) {
    const setName = getNamedArg(args, 'set');
    const label = getNamedArg(args, 'label') || getUnnamedArgs(args);
    const newLabel = getNamedArg(args, 'newlabel');
    const message = getNamedArg(args, 'message');

    if (!label) { ctx.showToast('/qr-update: label required', 'error'); return ''; }

    const store = await getQRStore();
    const targetSet = setName
      ? store.sets.find(s => s.name.toLowerCase() === setName.toLowerCase())
      : store.sets.find(s => s.id === store.activeSetId);

    if (targetSet) {
      const entry = targetSet.entries.find(e => e.label.toLowerCase() === label.toLowerCase());
      if (entry) {
        const updates: Record<string, string> = {};
        if (newLabel) updates.label = newLabel;
        if (message !== undefined) updates.message = message;
        store.updateEntry(targetSet.id, entry.id, updates);
        return newLabel || label;
      }
    }
    ctx.showToast(`/qr-update: "${label}" not found`, 'error');
    return '';
  },
});

registerCommand({
  name: 'qr-get',
  description: 'Get the message text of a Quick Reply entry',
  category: 'quickreply',
  usage: '/qr-get set=SetName label=Label',
  async handler(args, _raw, ctx) {
    const setName = getNamedArg(args, 'set');
    const label = getNamedArg(args, 'label') || getUnnamedArgs(args);

    if (!label) return '';

    const store = await getQRStore();
    const targetSet = setName
      ? store.sets.find(s => s.name.toLowerCase() === setName.toLowerCase())
      : store.sets.find(s => s.id === store.activeSetId);

    if (targetSet) {
      const entry = targetSet.entries.find(e => e.label.toLowerCase() === label.toLowerCase());
      if (entry) return entry.message;
    }
    return '';
  },
});
