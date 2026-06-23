import { Suspense } from "react";
import { AdminSignInForm } from "@/components/AdminSignInForm";
import { loadSiteSettings } from "@/lib/db";

export default async function AdminSignInPage() {

  return (
    <div className="page-shell admin-sign-in">
      <p className="eyebrow">Admin</p>
      <h1>Sign in</h1>
      <p className="lead">Use the configured administrator account to access the KB admin shell.</p>
      <Suspense fallback={<p>Loading sign-in form...</p>}>
        <AdminSignInForm />
      </Suspense>
    </div>
  );
}
