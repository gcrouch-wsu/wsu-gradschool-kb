import type { PageStatus } from "@/lib/types";

/** Visible to signed-in staff in the reader/admin tree (not archived). */
export function isStaffVisiblePageStatus(status: PageStatus): boolean {
  return status === "published" || status === "draft" || status === "proposed";
}

/** Live on the public site. */
export function isPublicPageStatus(status: PageStatus): boolean {
  return status === "published";
}

/** Working copy that is not live (draft or awaiting review). */
export function isWorkingPageStatus(status: PageStatus): boolean {
  return status === "draft" || status === "proposed";
}
