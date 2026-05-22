const COOKIE_PREFIX = "infisical-cm-active-project-";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const cookieName = (orgId: string) => `${COOKIE_PREFIX}${orgId}`;

export const getCertManagerActiveProjectCookie = (orgId: string): string | null => {
  if (typeof document === "undefined") return null;
  const name = cookieName(orgId);
  const entry = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!entry) return null;
  const value = entry.slice(name.length + 1);
  return value || null;
};

export const setCertManagerActiveProjectCookie = (orgId: string, projectId: string): void => {
  if (typeof document === "undefined") return;
  document.cookie = `${cookieName(orgId)}=${projectId}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
};
