"use client";

import { X } from "lucide-react";
import { useId, type FormEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/lib/use-modal-a11y";

type ModalProps = {
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  title: string;
  width?: "sm" | "md" | "lg";
};

type ModalFormProps = Omit<ModalProps, "children" | "footer"> & {
  cancelLabel?: string;
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitDisabled?: boolean;
  submitLabel: string;
};

export function Modal({ children, description, footer, onClose, title, width = "md" }: ModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const titleId = useId();
  const descriptionId = useId();

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal modal--${width}`}
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="modal__header">
          <div>
            <h2 className="modal__title" id={titleId}>
              {title}
            </h2>
            {description && (
              <div className="modal__description" id={descriptionId}>
                {description}
              </div>
            )}
          </div>
          <button className="modal__close" onClick={onClose} type="button">
            <span className="sr-only">Close dialog</span>
            <X aria-hidden size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ModalForm({
  cancelLabel = "Cancel",
  children,
  onClose,
  onSubmit,
  submitDisabled = false,
  submitLabel,
  ...modalProps
}: ModalFormProps) {
  return (
    <Modal {...modalProps} onClose={onClose}>
      <form className="form modal-form" onSubmit={onSubmit}>
        {children}
        <div className="modal-form__actions">
          <button className="button" disabled={submitDisabled} type="submit">
            {submitLabel}
          </button>
          <button className="button button--ghost" onClick={onClose} type="button">
            {cancelLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
