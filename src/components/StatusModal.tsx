"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useId } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/lib/use-modal-a11y";

export type StatusModalVariant = "success" | "error";

export interface StatusModalProps {
  confirmLabel?: string;
  message: string;
  onClose: () => void;
  open: boolean;
  title?: string;
  variant: StatusModalVariant;
}

const defaultTitles: Record<StatusModalVariant, string> = {
  success: "Success",
  error: "Error",
};

export function StatusModal({
  confirmLabel = "OK",
  message,
  onClose,
  open,
  title,
  variant,
}: StatusModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const titleId = useId();
  const messageId = useId();

  if (!open || typeof document === "undefined") {
    return null;
  }

  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;
  const resolvedTitle = title ?? defaultTitles[variant];

  return createPortal(
    <div className="status-modal-overlay" onClick={onClose} role="presentation">
      <div
        aria-describedby={messageId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`status-modal status-modal--${variant}`}
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <div aria-hidden="true" className="status-modal__icon">
          <Icon size={22} strokeWidth={1.75} />
        </div>
        <h2 className="status-modal__title" id={titleId}>
          {resolvedTitle}
        </h2>
        <p className="status-modal__message" id={messageId}>
          {message}
        </p>
        <button
          className="button status-modal__button"
          data-autofocus
          onClick={onClose}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
