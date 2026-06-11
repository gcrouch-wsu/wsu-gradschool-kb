"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

interface SidebarLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export function SidebarLink({ href, label, icon: Icon, exact = false }: SidebarLinkProps) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`admin-shell__nav-link${active ? " is-active" : ""}`}
      href={href}
    >
      <Icon aria-hidden size={18} strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  );
}
