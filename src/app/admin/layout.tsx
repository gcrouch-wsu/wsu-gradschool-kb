import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getCurrentAdminSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  if (pathname.startsWith("/admin/sign-in")) {
    return children;
  }

  const session = await getCurrentAdminSession();
  if (!session) {
    redirect(`/admin/sign-in?next=${encodeURIComponent(pathname || "/admin")}`);
  }

  return <AdminShell session={session}>{children}</AdminShell>;
}
