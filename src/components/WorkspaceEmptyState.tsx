"use client";

import Link from "next/link";

interface WorkspaceEmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface WorkspaceEmptyStateProps {
  message: string;
  action?: WorkspaceEmptyStateAction;
}

export function WorkspaceEmptyState({ message, action }: WorkspaceEmptyStateProps) {
  return (
    <div className="empty">
      <p>{message}</p>
      {action &&
        (action.href ? (
          <Link className="button" href={action.href}>
            {action.label}
          </Link>
        ) : (
          <button className="button" onClick={action.onClick} type="button">
            {action.label}
          </button>
        ))}
    </div>
  );
}
