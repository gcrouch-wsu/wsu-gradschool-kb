"use client";

import { ThemeEditor } from "@/components/ThemeEditor";
import { withGlobalPageTreeChrome, type KbTheme } from "@/lib/kb-theme";

/**
 * Client wrapper so Manage Styles can save via fetch. The styles route is a
 * Server Component and cannot pass an inline onSave into ThemeEditor.
 */
export function ManageKbStylesEditor({
  kbId,
  kbTitle,
  initialTheme,
  globalTheme,
  dbEnabled,
  siteContentWidth,
}: {
  kbId: string;
  kbTitle: string;
  initialTheme: KbTheme;
  globalTheme: KbTheme;
  dbEnabled: boolean;
  siteContentWidth?: number;
}) {
  return (
    <ThemeEditor
      dbEnabled={dbEnabled}
      initialTheme={initialTheme}
      kbTitle={kbTitle}
      scope="kb"
      siteContentWidth={siteContentWidth}
      onSave={async (newTheme) => {
        const toSave = withGlobalPageTreeChrome(newTheme, globalTheme);
        const res = await fetch(`/api/admin/kbs/${kbId}/theme`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: toSave }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.message === "string" ? data.message : "Failed to save styles",
          );
        }
      }}
    />
  );
}
