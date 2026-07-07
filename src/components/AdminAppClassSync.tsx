"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * The root layout chooses between the public shell and the admin shell on the
 * server, but it does not re-render on client-side navigation. Without this
 * sync, crossing the /admin boundary via a soft navigation leaves the old
 * shell classes on <html>/<body> (e.g. the admin shell's overflow: hidden),
 * which makes public pages unscrollable and the sign-in redirect look blank.
 */
export function AdminAppClassSync() {
  const pathname = usePathname();

  useEffect(() => {
    const isAdminShell = pathname.startsWith("/admin") && !pathname.startsWith("/admin/sign-in");
    document.documentElement.classList.toggle("admin-app", isAdminShell);
    document.body.classList.toggle("admin-app-body", isAdminShell);
    document.getElementById("main")?.classList.toggle("admin-app-main", isAdminShell);
  }, [pathname]);

  return null;
}
