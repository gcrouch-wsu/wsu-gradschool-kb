"use client";

import Link from "next/link";
import { createElement } from "react";
import { getStatIcon, type StatIconName } from "@/components/admin/admin-icons";

export type StatTone = "blue" | "green" | "amber" | "gray";

interface StatCardProps {
  icon: StatIconName;
  tone: StatTone;
  value: number;
  label: string;
  href?: string;
}

export function StatCard({ icon, tone, value, label, href }: StatCardProps) {
  const className = `admin-stat-card admin-stat-card--${tone}${href ? " admin-stat-card--link" : ""}`;
  const content = (
    <>
      <div aria-hidden className="admin-stat-card__icon">
        {createElement(getStatIcon(icon), { size: 20, strokeWidth: 1.75 })}
      </div>
      <div className="admin-stat-card__body">
        <span className="admin-stat-card__value">{value}</span>
        <span className="admin-stat-card__label">{label}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link className={className} href={href}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}
