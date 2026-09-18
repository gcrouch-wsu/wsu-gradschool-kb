import Link from "next/link";
import { Lock } from "lucide-react";
import { RouteStatusPage } from "@/components/route-states/RouteStatusPage";

/**
 * Shown when a published private KB exists but the visitor cannot read it.
 * Sign-in uses a hard navigation (plain <a>) so the admin shell layout loads correctly.
 */
export function PrivateKbGatePage({
  kbTitle,
  returnPath,
  signedIn,
}: {
  kbTitle: string;
  returnPath: string;
  signedIn: boolean;
}) {
  const signInHref = `/admin/sign-in?next=${encodeURIComponent(returnPath)}`;

  return (
    <RouteStatusPage
      code="Private"
      icon={<Lock aria-hidden size={28} strokeWidth={1.75} />}
      message={
        signedIn
          ? `"${kbTitle}" is private and your account does not have access. Ask an owner to assign you, or sign in with a different account.`
          : `"${kbTitle}" is a private knowledge base. Sign in with an account that has access to continue.`
      }
      title="Private knowledge base"
      variant="public"
    >
      <div className="route-status__actions">
        {/* Plain anchor: entering the admin shell needs a full page load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard nav */}
        <a className="button" href={signInHref}>
          {signedIn ? "Sign in with a different account" : "Sign in"}
        </a>
        <Link className="button button--ghost" href="/">
          Site home
        </Link>
      </div>
    </RouteStatusPage>
  );
}
