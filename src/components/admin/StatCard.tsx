"use client";

import { getStatIcon, type StatIconName } from "@/components/admin/admin-icons";

export type StatTone = "blue" | "green" | "amber" | "gray";

interface StatCardProps {
  icon: StatIconName;
  tone: StatTone;
  value: number;
  label: string;
}

export function StatCard({ icon, tone, value, label }: StatCardProps) {
  const Icon = getStatIcon(icon);

  return (
    <article className={`admin-stat-card admin-stat-card--${tone}`}>
      <div aria-hidden className="admin-stat-card__icon">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div className="admin-stat-card__body">
        <span className="admin-stat-card__value">{value}</span>
        <span className="admin-stat-card__label">{label}</span>
      </div>
    </article>
  );
}
