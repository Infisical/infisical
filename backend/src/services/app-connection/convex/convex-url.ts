export const normalizeConvexDeploymentUrl = (url: string): string => {
  const parsed = new URL(url.trim());
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path === "/" ? "" : path}`;
};
