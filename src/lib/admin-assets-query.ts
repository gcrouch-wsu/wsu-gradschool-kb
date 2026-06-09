export type AdminAssetsTab = "knowledge-base" | "upload";

export function buildAdminAssetsQuery(options: {
  kbSlug: string;
  status?: string;
  tab?: AdminAssetsTab;
}) {
  const params = new URLSearchParams({ kb: options.kbSlug });
  if (options.status) {
    params.set("status", options.status);
  }
  if (options.tab === "upload") {
    params.set("tab", "upload");
  } else if (options.tab === "knowledge-base") {
    params.set("tab", "knowledge-base");
  }
  return params.toString();
}

export function parseAdminAssetsTab(value?: string | null): AdminAssetsTab {
  return value === "upload" ? "upload" : "knowledge-base";
}
