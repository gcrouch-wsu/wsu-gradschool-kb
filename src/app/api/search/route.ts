import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentAdminSession, getKbReadAccess } from "@/lib/auth";
import { getAssetById, getKbById, getKbBySlug, searchKb } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import { globalSearchScope } from "@/lib/search-scope";

const SUGGEST_LIMIT = 60;
const SUGGEST_WINDOW_SECONDS = 60;
const MAX_RESULTS = 8;

function emptyResponse() {
  return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kbSlug = (url.searchParams.get("kb") ?? "").trim();
  if (q.length < 2 || q.length > 200) {
    return emptyResponse();
  }

  const clientKey = clientKeyFromHeaders(await headers());
  const allowed = (await rateLimit(`search-suggest:${clientKey}`, SUGGEST_LIMIT, SUGGEST_WINDOW_SECONDS)).allowed;
  if (!allowed) {
    return emptyResponse();
  }

  try {
    let results;
    let scopedKb = null;
    if (kbSlug) {
      const session = await getCurrentAdminSession();
      const kb = await getKbBySlug(kbSlug, Boolean(session));
      if (!kb) {
        return emptyResponse();
      }
      const access = await getKbReadAccess(session, kb);
      if (!access.canRead) {
        return emptyResponse();
      }
      scopedKb = kb;
      results = await searchKb(kb.id, q, access.canReadStaffContent, {
        readableKbIds: [kb.id],
        staffKbIds: access.canReadStaffContent ? [kb.id] : [],
      });
    } else {
      const scope = await globalSearchScope();
      results = await searchKb(undefined, q, scope.includeStaff, scope.options);
    }

    const mapped = await Promise.all(
      results.slice(0, MAX_RESULTS).map(async (result) => {
        const kb = scopedKb ?? (await getKbById(result.kbId));
        if (!kb) {
          return null;
        }
        if (result.type === "page") {
          return {
            type: "page" as const,
            title: result.title,
            href: `/kb/${kb.slug}/${result.path.join("/")}`,
            kbTitle: kb.title,
          };
        }
        const asset = await getAssetById(result.id);
        const homeKb = asset ? await getKbById(asset.homeKbId) : null;
        if (!asset || !homeKb) {
          return null;
        }
        return {
          type: "asset" as const,
          title: result.title,
          href: `/kb/${homeKb.slug}/files/${asset.slug}`,
          kbTitle: kb.title,
        };
      }),
    );

    return NextResponse.json(
      { results: mapped.filter((entry) => entry !== null) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logError(error, { route: "/api/search", action: "search_suggest" });
    return emptyResponse();
  }
}
