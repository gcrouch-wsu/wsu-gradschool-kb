import {
  SkeletonBlock,
  SkeletonButton,
  SkeletonLine,
  SkeletonStat,
  SkeletonTableRow,
  SkeletonTile,
  SkeletonTreeLine,
} from "@/components/route-states/RouteSkeleton";

export type RouteLoadingPreset =
  | "audit"
  | "pages"
  | "review"
  | "dashboard"
  | "import"
  | "assets"
  | "settings"
  | "sign-in";

export type RouteLoadingVariant = "public" | "admin";

function PageHeaderSkeleton({ withActions = false }: { withActions?: boolean }) {
  return (
    <div className="route-loading__header">
      <SkeletonLine size="sm" width="4.5rem" />
      {withActions ? (
        <div className="route-loading__header-row">
          <SkeletonLine size="lg" maxWidth="14rem" width="55%" />
          <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            <SkeletonButton />
            <SkeletonButton small />
          </div>
        </div>
      ) : (
        <SkeletonLine size="lg" maxWidth="16rem" width="60%" />
      )}
      <SkeletonLine maxWidth="36rem" width="92%" />
      <SkeletonLine maxWidth="28rem" width="72%" />
      <SkeletonLine size="sm" maxWidth="8rem" width="30%" />
    </div>
  );
}

function AuditPreset() {
  return (
    <div className="page-shell">
      <PageHeaderSkeleton />
      <div className="route-loading__filters">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBlock key={index} height="2.75rem" />
        ))}
      </div>
      <SkeletonBlock height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <div className="route-loading__table">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonTableRow key={index} />
        ))}
      </div>
    </div>
  );
}

function PagesPreset() {
  return (
    <div className="page-shell admin-pages">
      <PageHeaderSkeleton withActions />
      <div className="route-loading__grid-2">
        {Array.from({ length: 2 }, (_, cardIndex) => (
          <section className="card admin-pages__kb-card" key={cardIndex}>
            <div className="route-loading__header-row" style={{ marginBottom: "0.5rem" }}>
              <SkeletonLine maxWidth="12rem" width="70%" />
              <SkeletonButton small />
            </div>
            <div className="route-loading__tree">
              <SkeletonTreeLine />
              <SkeletonTreeLine indent={1} />
              <SkeletonTreeLine indent={1} />
              <SkeletonTreeLine indent={2} />
              <SkeletonTreeLine />
              <SkeletonTreeLine indent={1} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ReviewPreset() {
  return (
    <div className="page-shell">
      <PageHeaderSkeleton />
      <div className="route-loading__sections">
        {Array.from({ length: 5 }, (_, sectionIndex) => (
          <section className="route-loading__section-card" key={sectionIndex}>
            <SkeletonLine maxWidth="14rem" width="55%" />
            {Array.from({ length: 3 }, (_, rowIndex) => (
              <SkeletonLine key={rowIndex} maxWidth="100%" width={`${88 - rowIndex * 8}%`} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function DashboardPreset() {
  return (
    <div className="admin-dashboard">
      <div className="route-loading__header-row" style={{ marginBottom: "1.25rem" }}>
        <div className="route-loading__header" style={{ marginBottom: 0 }}>
          <SkeletonLine size="sm" width="6rem" />
          <SkeletonLine size="lg" maxWidth="10rem" width="45%" />
        </div>
        <SkeletonButton />
      </div>
      <div className="route-loading__grid-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonStat key={index} />
        ))}
      </div>
      <div className="route-loading__panels">
        {Array.from({ length: 2 }, (_, index) => (
          <section className="route-loading__section-card" key={index}>
            <SkeletonLine maxWidth="12rem" width="50%" />
            {Array.from({ length: 4 }, (_, rowIndex) => (
              <SkeletonLine key={rowIndex} width={`${90 - rowIndex * 6}%`} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ImportPreset() {
  return (
    <div className="page-shell">
      <PageHeaderSkeleton />
      <section className="route-loading__section-card">
        <SkeletonLine maxWidth="11rem" width="45%" />
        <SkeletonLine maxWidth="20rem" width="80%" />
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonLine key={index} width={`${85 - index * 10}%`} />
        ))}
      </section>
      <div className="route-loading__dropzone">
        <SkeletonLine maxWidth="14rem" width="50%" style={{ margin: "0 auto" }} />
        <SkeletonLine maxWidth="20rem" width="70%" style={{ margin: "0.75rem auto 0" }} />
      </div>
    </div>
  );
}

function AssetsPreset() {
  return (
    <div className="page-shell">
      <div className="route-loading__header">
        <SkeletonLine size="sm" maxWidth="12rem" width="40%" />
        <SkeletonLine size="lg" maxWidth="12rem" width="50%" />
        <SkeletonLine maxWidth="34rem" width="95%" />
        <SkeletonLine maxWidth="30rem" width="85%" />
      </div>
      <div className="route-loading__filters" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} height="2.5rem" />
        ))}
      </div>
      <div className="route-loading__grid-assets" style={{ marginTop: "1.25rem" }}>
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonTile key={index} />
        ))}
      </div>
    </div>
  );
}

function SettingsPreset() {
  return (
    <div className="page-shell">
      <PageHeaderSkeleton />
      <div className="route-loading__filters" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} height="2.5rem" />
        ))}
      </div>
      <div className="route-loading__grid-2">
        {Array.from({ length: 2 }, (_, index) => (
          <section className="route-loading__section-card" key={index}>
            <SkeletonLine maxWidth="10rem" width="45%" />
            {Array.from({ length: 4 }, (_, rowIndex) => (
              <SkeletonLine key={rowIndex} width={`${90 - rowIndex * 8}%`} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function SignInPreset() {
  return (
    <div className="page-shell">
      <PageHeaderSkeleton />
      <section className="route-loading__section-card" style={{ maxWidth: "28rem" }}>
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonBlock key={index} height="2.5rem" />
        ))}
        <SkeletonButton />
      </section>
    </div>
  );
}

const presetComponents: Record<RouteLoadingPreset, () => React.JSX.Element> = {
  audit: AuditPreset,
  pages: PagesPreset,
  review: ReviewPreset,
  dashboard: DashboardPreset,
  import: ImportPreset,
  assets: AssetsPreset,
  settings: SettingsPreset,
  "sign-in": SignInPreset,
};

interface RouteLoadingPageProps {
  preset: RouteLoadingPreset;
  variant?: RouteLoadingVariant;
}

export function RouteLoadingPage({ preset }: RouteLoadingPageProps) {
  const Preset = presetComponents[preset];

  return (
    <div aria-busy="true" aria-live="polite" className="route-loading" role="status">
      <span className="route-loading__sr-only">Loading…</span>
      <Preset />
    </div>
  );
}
