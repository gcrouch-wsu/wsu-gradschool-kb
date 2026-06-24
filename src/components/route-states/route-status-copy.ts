import type { RouteStatusAction } from "@/components/route-states/RouteStatusActions";

export const publicNotFoundCopy = {
  code: "404",
  title: "Page not found",
  message:
    "The page you requested may have been moved, renamed, or removed. Check the URL or return to the knowledge base home.",
};

export const publicNotFoundActions: RouteStatusAction[] = [
  { label: "Go to home", href: "/" },
  { label: "Browse knowledge bases", href: "/", variant: "ghost" },
];

export const adminNotFoundCopy = {
  code: "404",
  title: "Admin page not found",
  message:
    "This admin resource does not exist or you may not have access. Return to the dashboard or open the pages workspace.",
};

export const adminNotFoundActions: RouteStatusAction[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Pages", href: "/admin/pages", variant: "ghost" },
];

export const kbNotFoundCopy = {
  code: "404",
  title: "Article not found",
  message:
    "This knowledge base article could not be found. It may be unpublished, moved, or the link may be outdated.",
};

export function kbNotFoundActions(kbSlug: string | null): RouteStatusAction[] {
  if (kbSlug) {
    return [
      { label: "Knowledge base home", href: `/kb/${kbSlug}` },
      { label: "Site home", href: "/", variant: "ghost" },
    ];
  }

  return publicNotFoundActions;
}

export const publicErrorCopy = {
  code: "Error",
  title: "Something went wrong",
  message: "An unexpected error occurred while loading this page. You can try again or return home.",
};

export const adminErrorCopy = {
  code: "Error",
  title: "Something went wrong",
  message:
    "An unexpected error occurred in the admin workspace. Try again or return to the dashboard.",
};

export const publicErrorActions: RouteStatusAction[] = [
  { label: "Go to home", href: "/" },
];

export const adminErrorActions: RouteStatusAction[] = [
  { label: "Dashboard", href: "/admin", variant: "ghost" },
];
