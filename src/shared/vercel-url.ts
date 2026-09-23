export const normalizeVercelUrl = (url: string): string => {
  const [rawPathname, rawQuery = ""] = url.split("?", 2);
  let pathname = rawPathname === "/api"
    ? "/"
    : rawPathname.startsWith("/api/")
      ? rawPathname.slice("/api".length)
      : rawPathname;

  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const query = new URLSearchParams(rawQuery);
  query.delete("path");
  const normalizedQuery = query.toString();
  return normalizedQuery ? `${pathname}?${normalizedQuery}` : pathname;
};
