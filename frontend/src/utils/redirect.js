const AUTH_PATHS = new Set(["/", "/login", "/signin", "/signup", "/register"]);

export function getSafeNextUrl(searchParams, fallback = "/dashboard") {
  const raw = searchParams.get("next");
  if (!raw) return fallback;

  // Block external URLs like "https://example.com" or "//example.com"
  if (/^(https?:)?\/\//i.test(raw)) return fallback;

  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  const pathname = normalized.split("?")[0];

  if (AUTH_PATHS.has(pathname)) return fallback;
  return normalized;
}