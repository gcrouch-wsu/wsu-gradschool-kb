import { FileQuestion } from "lucide-react";
import { RouteStatusActions } from "@/components/route-states/RouteStatusActions";
import { RouteStatusPage } from "@/components/route-states/RouteStatusPage";
import { adminNotFoundActions, adminNotFoundCopy } from "@/components/route-states/route-status-copy";

export default function NotFound() {
  return (
    <RouteStatusPage
      code={adminNotFoundCopy.code}
      icon={<FileQuestion aria-hidden size={28} strokeWidth={1.75} />}
      message={adminNotFoundCopy.message}
      title={adminNotFoundCopy.title}
      variant="admin"
    >
      <RouteStatusActions actions={adminNotFoundActions} />
    </RouteStatusPage>
  );
}
