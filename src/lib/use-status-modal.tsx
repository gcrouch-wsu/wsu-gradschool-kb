"use client";

import { useCallback, useState } from "react";
import { StatusModal, type StatusModalVariant } from "@/components/StatusModal";

interface StatusModalState {
  message: string;
  open: boolean;
  title?: string;
  variant: StatusModalVariant;
}

export function useStatusModal() {
  const [state, setState] = useState<StatusModalState>({
    open: false,
    variant: "error",
    message: "",
  });

  const close = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
  }, []);

  const show = useCallback((variant: StatusModalVariant, message: string, title?: string) => {
    setState({ open: true, variant, message, title });
  }, []);

  const showSuccess = useCallback(
    (message: string, title?: string) => show("success", message, title),
    [show],
  );

  const showError = useCallback(
    (message: string, title?: string) => show("error", message, title),
    [show],
  );

  const statusModal = (
    <StatusModal
      message={state.message}
      onClose={close}
      open={state.open}
      title={state.title}
      variant={state.variant}
    />
  );

  return { close, showError, showSuccess, statusModal };
}

export async function readApiErrorMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return data?.message || fallback;
}
