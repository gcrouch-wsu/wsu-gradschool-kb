import {
  BookOpen,
  FileCheck,
  FilePen,
  FolderOpen,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

export type StatIconName = "book-open" | "file-check" | "file-pen" | "folder-open";
export type ActivityIconName = "page" | "asset" | "kb" | "user" | "default";

const STAT_ICONS: Record<StatIconName, LucideIcon> = {
  "book-open": BookOpen,
  "file-check": FileCheck,
  "file-pen": FilePen,
  "folder-open": FolderOpen,
};

const ACTIVITY_ICONS: Record<ActivityIconName, LucideIcon> = {
  page: FilePen,
  asset: FolderOpen,
  kb: BookOpen,
  user: User,
  default: Settings,
};

export function getStatIcon(name: StatIconName): LucideIcon {
  return STAT_ICONS[name];
}

export function getActivityIcon(name: ActivityIconName): LucideIcon {
  return ACTIVITY_ICONS[name];
}
