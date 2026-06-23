export function extractKbSlugFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "kb" && segments[1]) {
    return segments[1];
  }
  return null;
}
