import { FileQuestion } from "lucide-react";
import { headers } from "next/headers";
import { RouteStatusActions } from "@/components/route-states/RouteStatusActions";
import { RouteStatusPage } from "@/components/route-states/RouteStatusPage";
import { extractKbSlugFromPathname } from "@/components/route-states/extract-kb-slug";
import { kbNotFoundActions, kbNotFoundCopy } from "@/components/route-states/route-status-copy";

export default async function NotFound() {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const kbSlug = extractKbSlugFromPathname(pathname);

  return (
    <RouteStatusPage
      code={kbNotFoundCopy.code}
      icon={<FileQuestion aria-hidden size={28} strokeWidth={1.75} />}
      message={kbNotFoundCopy.message}
      title={kbNotFoundCopy.title}
      variant="public"
    >
      <RouteStatusActions actions={kbNotFoundActions(kbSlug)} />
    </RouteStatusPage>
  );
}
