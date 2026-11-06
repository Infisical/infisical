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

// Which Certificate Manager project a request in this org is for, now that the URL carries none: the
// instance the user last opened, while they are still a member of it, otherwise the org's active
// instance. The layout, the product switcher and the 403 page must all agree, so they share this.
export const resolveCertManagerProjectId = ({
  orgId,
  activeProjectId,
  memberProjectIds
}: {
  orgId: string;
  activeProjectId: string | null;
  memberProjectIds: string[];
}): string | null => {
  const pinnedProjectId = getCertManagerActiveProjectCookie(orgId);
  if (pinnedProjectId && memberProjectIds.includes(pinnedProjectId)) return pinnedProjectId;
  return activeProjectId;
};

// The cookie is shared by every tab, and the backend falls back to it for requests that name no
// project. In an org with several instances, a tab that switched instances would then redirect another
// tab's writes (an inventory import would store a private key in the wrong instance), so each tab names
// the instance it is showing. Single-instance orgs pass null and keep sending no project.
let tabCertManagerProjectId: string | null = null;

export const setTabCertManagerProjectId = (projectId: string | null) => {
  tabCertManagerProjectId = projectId;
};

const CERT_MANAGER_API_PREFIXES = ["/api/v1/cert-manager/", "/api/v1/pki/", "/api/v2/pki/"];
const CERT_MANAGER_PAGE_RE = /^\/organizations\/[^/]+\/cert-manager(\/|$)/;

export const getTabCertManagerProjectIdForRequest = (url: string | undefined): string | null => {
  if (!tabCertManagerProjectId || !url) return null;
  if (!CERT_MANAGER_API_PREFIXES.some((prefix) => url.startsWith(prefix))) return null;
  if (!CERT_MANAGER_PAGE_RE.test(window.location.pathname)) return null;
  return tabCertManagerProjectId;
};
