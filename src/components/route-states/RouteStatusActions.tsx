import Link from "next/link";
import type { ReactNode } from "react";

export interface RouteStatusAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
}

interface RouteStatusActionsProps {
  actions: RouteStatusAction[];
}

export function RouteStatusActions({ actions }: RouteStatusActionsProps) {
  return (
    <div className="route-status__actions">
      {actions.map((action) => {
        const className = action.variant === "ghost" ? "button button--ghost" : "button";

        if (action.href) {
          return (
            <Link key={action.label} className={className} href={action.href}>
              {action.label}
            </Link>
          );
        }

        return (
          <button key={action.label} className={className} onClick={action.onClick} type="button">
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function RouteStatusActionsSlot({ children }: { children: ReactNode }) {
  return <div className="route-status__actions">{children}</div>;
}
