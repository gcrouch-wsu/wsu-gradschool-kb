import type { ReactNode } from "react";

export type RouteStatusVariant = "public" | "admin";

interface RouteStatusPageProps {
  variant?: RouteStatusVariant;
  code: string;
  title: string;
  message: string;
  icon: ReactNode;
  children?: ReactNode;
  detail?: string;
}

export function RouteStatusPage({
  variant = "public",
  code,
  title,
  message,
  icon,
  children,
  detail,
}: RouteStatusPageProps) {
  const wrapperClass =
    variant === "admin" ? "route-status route-status--admin" : "route-status";

  return (
    <div className={wrapperClass}>
      <div className="route-status__panel">
        <div aria-hidden="true" className="route-status__icon">
          {icon}
        </div>
        <p aria-label={`Status code ${code}`} className="route-status__code">
          {code}
        </p>
        <h1 className="route-status__title">{title}</h1>
        <p className="route-status__message">{message}</p>
        {detail && <pre className="route-status__detail">{detail}</pre>}
        {children}
      </div>
    </div>
  );
}
