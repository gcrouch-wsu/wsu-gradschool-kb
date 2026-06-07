import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";

export default async function AdminKbsLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/kbs");
  }
  if (session.role !== "owner") {
    redirect("/admin");
  }
  return <>{children}</>;
}
