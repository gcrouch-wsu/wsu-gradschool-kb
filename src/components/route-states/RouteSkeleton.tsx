import type { CSSProperties, ReactNode } from "react";

type SkeletonSize = "sm" | "md" | "lg";

interface SkeletonStyleProps {
  width?: string;
  maxWidth?: string;
  style?: CSSProperties;
  className?: string;
}

function skeletonClass(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

export function SkeletonLine({
  size = "md",
  width,
  maxWidth,
  style,
  className,
}: SkeletonStyleProps & { size?: SkeletonSize }) {
  const sizeClass =
    size === "sm" ? "route-skeleton--line-sm" : size === "lg" ? "route-skeleton--line-lg" : "route-skeleton--line";

  return (
    <span
      aria-hidden="true"
      className={skeletonClass(`route-skeleton ${sizeClass}`, className)}
      style={{ width, maxWidth, ...style }}
    />
  );
}

export function SkeletonBlock({
  height = "2.5rem",
  width = "100%",
  style,
  className,
}: SkeletonStyleProps & { height?: string; width?: string }) {
  return (
    <span
      aria-hidden="true"
      className={skeletonClass("route-skeleton route-skeleton--block", className)}
      style={{ height, width, ...style }}
    />
  );
}

export function SkeletonButton({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`route-skeleton ${small ? "route-skeleton--button-sm" : "route-skeleton--button"}`}
    />
  );
}

export function SkeletonTableRow() {
  return <span aria-hidden="true" className="route-skeleton route-skeleton--table-row" />;
}

export function SkeletonCard({ children }: { children?: ReactNode }) {
  return (
    <div aria-hidden="true" className="route-skeleton route-skeleton--card">
      {children}
    </div>
  );
}

export function SkeletonStat() {
  return <span aria-hidden="true" className="route-skeleton route-skeleton--stat" />;
}

export function SkeletonTile() {
  return <span aria-hidden="true" className="route-skeleton route-skeleton--tile" />;
}

export function SkeletonTreeLine({ indent = 0 }: { indent?: number }) {
  return (
    <SkeletonLine
      className="route-skeleton--tree-line"
      maxWidth={indent > 0 ? `calc(100% - ${indent * 1.25}rem)` : "85%"}
      style={indent > 0 ? { marginLeft: `${indent * 1.25}rem` } : undefined}
    />
  );
}
