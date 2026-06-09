import type { AuditEntityType, AuditLogEntry } from "@/lib/types";

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatAuditAction(entry: AuditLogEntry): string {
  const label = entry.entityLabel;

  switch (entry.action) {
    case "page.created":
      return `Created page “${label}”`;
    case "page.updated":
      return `Updated page “${label}”`;
    case "page.published":
      return `Published page “${label}”`;
    case "page.archived":
      return `Archived page “${label}”`;
    case "page.deleted":
      return `Deleted page “${label}”`;
    case "asset.created":
      return `Created asset “${label}”`;
    case "asset.updated":
      return `Updated asset “${label}”`;
    case "asset.activated":
      return `Activated asset version for “${label}”`;
    case "asset.archived":
      return `Archived asset “${label}”`;
    case "asset.deleted":
      return `Deleted asset “${label}”`;
    case "kb.created":
      return `Created knowledge base “${label}”`;
    case "kb.updated":
      return `Updated knowledge base “${label}”`;
    case "import.staged":
      return `Staged import “${label}”`;
    case "import.committed":
      return `Committed import “${label}”`;
    case "user.created":
      return `Created user “${label}”`;
    case "user.updated":
      return `Updated user “${label}”`;
    case "user.deleted":
      return `Deleted user “${label}”`;
    case "settings.updated":
      return "Updated site settings";
    case "redirect.created":
      return `Created redirect for “${label}”`;
    case "redirect.deleted":
      return `Deleted redirect for “${label}”`;
    default:
      return `${entry.action.replaceAll(".", " ")} “${label}”`;
  }
}

export function auditEntityTone(entityType: AuditEntityType): "page" | "asset" | "kb" | "user" | "default" {
  if (entityType === "page" || entityType === "import") return "page";
  if (entityType === "asset") return "asset";
  if (entityType === "kb") return "kb";
  if (entityType === "user") return "user";
  return "default";
}
