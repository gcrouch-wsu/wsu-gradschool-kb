"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { RouteStatusActions } from "@/components/route-states/RouteStatusActions";
import { RouteStatusPage, type RouteStatusVariant } from "@/components/route-states/RouteStatusPage";
import {
  adminErrorActions,
  adminErrorCopy,
  publicErrorActions,
  publicErrorCopy,
} from "@/components/route-states/route-status-copy";
import { logError } from "@/lib/log";

interface RouteErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
  variant?: RouteStatusVariant;
}

export function RouteErrorPage({ error, reset, variant = "public" }: RouteErrorPageProps) {
  const copy = variant === "admin" ? adminErrorCopy : publicErrorCopy;
  const secondaryActions = variant === "admin" ? adminErrorActions : publicErrorActions;

  useEffect(() => {
    logError(error, { surface: "route-error", variant });
  }, [error, variant]);

  const detail =
    process.env.NODE_ENV === "development"
      ? error.message || error.digest
      : undefined;

  return (
    <RouteStatusPage
      code={copy.code}
      detail={detail}
      icon={<AlertTriangle aria-hidden size={28} strokeWidth={1.75} />}
      message={copy.message}
      title={copy.title}
      variant={variant}
    >
      <RouteStatusActions
        actions={[
          { label: "Try again", onClick: reset },
          ...secondaryActions,
        ]}
      />
    </RouteStatusPage>
  );
}
