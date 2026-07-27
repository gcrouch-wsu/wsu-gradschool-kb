import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";

export default async function AdminWebhooksLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/webhooks");
  }
  if (session.role !== "owner" && session.role !== "admin") {
    redirect("/admin");
  }
  return <>{children}</>;
}
