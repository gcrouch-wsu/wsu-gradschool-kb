"use client";

import { createElement } from "react";
import { getActivityIcon, type ActivityIconName } from "@/components/admin/admin-icons";

interface ActivityItemProps {
  icon: ActivityIconName;
  action: string;
  actor: string;
  time: string;
}

export function ActivityItem({ icon, action, actor, time }: ActivityItemProps) {
  return (
    <li className="admin-activity-item">
      <div aria-hidden className="admin-activity-item__avatar">
        {createElement(getActivityIcon(icon), { size: 16, strokeWidth: 1.75 })}
      </div>
      <div className="admin-activity-item__body">
        <p className="admin-activity-item__action">{action}</p>
        <p className="admin-activity-item__meta">
          {actor} · {time}
        </p>
      </div>
    </li>
  );
}
