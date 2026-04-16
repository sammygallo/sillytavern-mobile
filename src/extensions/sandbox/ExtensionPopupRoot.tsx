import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import {
  useExtensionPopupStore,
  POPUP_TYPE,
  type PopupRequest,
} from '../../stores/extensionPopupStore';

function SinglePopup({ popup }: { popup: PopupRequest }) {
  const closePopup = useExtensionPopupStore((s) => s.closePopup);
  const [inputVal, setInputVal] = useState(popup.inputValue ?? '');

  const okLabel = popup.options?.okButton ?? 'OK';
  const cancelLabel = popup.options?.cancelButton ?? 'Cancel';
  const showCancel =
    popup.type === POPUP_TYPE.CONFIRM || popup.type === POPUP_TYPE.INPUT;

  function handleOk() {
    switch (popup.type) {
      case POPUP_TYPE.CONFIRM:
        closePopup(popup.id, true);
        break;
      case POPUP_TYPE.INPUT:
        closePopup(popup.id, inputVal);
        break;
      default:
        closePopup(popup.id, true);
    }
  }

  function handleCancel() {
    const result = popup.type === POPUP_TYPE.CONFIRM ? false : null;
    closePopup(popup.id, result);
  }

  const size = popup.options?.large ? 'lg' : popup.options?.wide ? 'md' : 'sm';

  return (
    <Modal isOpen onClose={handleCancel} title="Extension" size={size}>
      <div
        className="text-sm text-[var(--color-text-primary)] mb-4 max-h-[50vh] overflow-y-auto"
        dangerouslySetInnerHTML={{ __html: popup.html }}
      />
      {popup.type === POPUP_TYPE.INPUT && (
        <textarea
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          rows={popup.options?.rows ?? 1}
          className="w-full mb-4 px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          autoFocus
        />
      )}
      <div className="flex justify-end gap-2">
        {showCancel && (
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={handleOk}>
          {okLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function ExtensionPopupRoot() {
  const popups = useExtensionPopupStore((s) => s.popups);
  return (
    <>
      {popups.map((p) => (
        <SinglePopup key={p.id} popup={p} />
      ))}
    </>
  );
}
