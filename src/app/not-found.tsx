import { FileQuestion } from "lucide-react";
import { RouteStatusActions } from "@/components/route-states/RouteStatusActions";
import { RouteStatusPage } from "@/components/route-states/RouteStatusPage";
import { publicNotFoundActions, publicNotFoundCopy } from "@/components/route-states/route-status-copy";

export default function NotFound() {
  return (
    <RouteStatusPage
      code={publicNotFoundCopy.code}
      icon={<FileQuestion aria-hidden size={28} strokeWidth={1.75} />}
      message={publicNotFoundCopy.message}
      title={publicNotFoundCopy.title}
      variant="public"
    >
      <RouteStatusActions actions={publicNotFoundActions} />
    </RouteStatusPage>
  );
}
