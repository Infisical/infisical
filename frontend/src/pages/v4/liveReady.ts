const segmentsOf = (path: string) => path.split("/").filter(Boolean);

const LIVE_READY_ROUTES = [
  "/v4/organizations/$orgId/projects",
  "/v4/organizations/$orgId/audit-logs",
  "/v4/organizations/$orgId/projects/kms/$projectId/overview"
].map(segmentsOf);

export const isLiveReady = (pathname: string) => {
  const segments = segmentsOf(pathname);
  return LIVE_READY_ROUTES.some(
    (pattern) =>
      pattern.length === segments.length &&
      pattern.every((part, index) => part.startsWith("$") || part === segments[index])
  );
};

export const liveHref = (href: string) => {
  if (!href.startsWith("/v4/")) return href;
  return isLiveReady(href.split(/[?#]/)[0]) ? href : href.slice("/v4".length);
};
