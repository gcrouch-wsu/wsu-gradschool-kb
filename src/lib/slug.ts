export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "page"
  );
}

/**
 * Slugs that would collide with application routes. Blocked at every page path
 * level and (for the KB-level set) as a top-level KB slug. See project_spec.md
 * §7 "Slug and Route Rules".
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  "files",
  "search",
  "tags",
  "archive",
  "admin",
  "api",
  "new",
  "edit",
  "preview",
]);

export const RESERVED_KB_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "search",
  "kb",
  "new",
  "edit",
  "preview",
  "files",
  "tags",
  "archive",
]);

export function isReservedPageSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.has(slug.toLowerCase());
}

/**
 * Throws a clear, user-facing error when a page slug would shadow an application
 * route. Call before persisting a created/updated page.
 */
export function assertPageSlugAllowed(slug: string): void {
  if (isReservedPageSlug(slug)) {
    throw new Error(
      `"${slug}" is a reserved name and cannot be used as a page slug. Reserved names: ${[
        ...RESERVED_PAGE_SLUGS,
      ].join(", ")}.`,
    );
  }
}
