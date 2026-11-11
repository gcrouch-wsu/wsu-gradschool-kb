import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { getCurrentAdminSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Change password | WSU Knowledge Base",
};

/**
 * Lives outside /admin on purpose: the admin layout redirects viewers away, and viewers need to
 * change the password an owner handed them just as much as editors do.
 */
export default async function ChangePasswordPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/account/password");
  }

  const backHref = session.role === "viewer" ? "/" : "/admin";

  return (
    <div className="page-shell admin-sign-in">
      <p className="eyebrow">Account</p>
      <h1>Change password</h1>
      <p className="lead">
        Signed in as <strong>{session.email}</strong>.
      </p>
      {session.source === "managed" ? (
        <ChangePasswordForm backHref={backHref} email={session.email} />
      ) : (
        <p className="alert">
          This account&apos;s password is set by the deployment environment
          (<code>BOOTSTRAP_OWNER_PASSWORD</code>) and can only be changed there.
        </p>
      )}
    </div>
  );
}
