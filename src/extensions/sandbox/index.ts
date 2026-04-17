export { ExtensionFrame } from './ExtensionFrame';
export type { ExtensionFrameProps } from './ExtensionFrame';
export { fireSandboxLifecycleEvent, subscribeToSandboxEvents } from './sandboxEventBus';
export { SHIM_CODE } from './extensionShim';
export { GlobalExtensionHost } from './GlobalExtensionHost';
export { ExtensionPopupRoot } from './ExtensionPopupRoot';
export {
  SLOT_KINDS,
  useSandboxSlotStore,
  useSlotItems,
  invokeSlotItem,
  type SlotKind,
  type SlotItem,
} from './sandboxSlotRegistry';
