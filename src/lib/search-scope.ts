import { accessibleKbIds, filterKbsForReadAccess, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getPublishedKbs, type SearchKbOptions } from "@/lib/kb-store";

// The one visibility contract for global search, shared by the /search page
// and the live-suggestion API so their result sets can never diverge.
export async function globalSearchScope(): Promise<{ includeStaff: boolean; options: SearchKbOptions }> {
  const session = await getCurrentAdminSession();
  const sourceKbs = session ? await getAllKbsForAdmin() : await getPublishedKbs();
  const readableKbIds = (await filterKbsForReadAccess(session, sourceKbs)).map((kb) => kb.id);
  if (!session) {
    return { includeStaff: false, options: { readableKbIds, staffKbIds: [] } };
  }
  if (session.role === "owner" || session.role === "admin") {
    return { includeStaff: true, options: { includeAllKbs: true, staffKbIds: null } };
  }
  if (session.role === "editor") {
    const assigned = (await accessibleKbIds(session)) ?? [];
    return { includeStaff: true, options: { readableKbIds, staffKbIds: assigned } };
  }
  return { includeStaff: false, options: { readableKbIds, staffKbIds: [] } };
}
