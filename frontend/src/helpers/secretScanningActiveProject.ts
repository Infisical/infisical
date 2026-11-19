const COOKIE_PREFIX = "infisical-ss-active-project-";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const cookieName = (orgId: string) => `${COOKIE_PREFIX}${orgId}`;

export const getSecretScanningActiveProjectCookie = (orgId: string): string | null => {
  if (typeof document === "undefined") return null;
  const name = cookieName(orgId);
  const entry = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!entry) return null;
  const value = entry.slice(name.length + 1);
  return value || null;
};

export const setSecretScanningActiveProjectCookie = (orgId: string, projectId: string): void => {
  if (typeof document === "undefined") return;
  document.cookie = `${cookieName(orgId)}=${projectId}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
};

// Which Secret Scanning project a page in this org shows, now that the URL carries none: the one the
// user last opened, while they are still a member of it, otherwise the org's active project. The
// backend falls back to this cookie for requests that name no project, but it is shared by every tab,
// so a tab that switched projects would redirect another tab's writes. Keep naming the projectId on
// every project-scoped request.
export const resolveSecretScanningProjectId = ({
  orgId,
  activeProjectId,
  memberProjectIds
}: {
  orgId: string;
  activeProjectId: string | null;
  memberProjectIds: string[];
}): string | null => {
  const pinnedProjectId = getSecretScanningActiveProjectCookie(orgId);
  if (pinnedProjectId && memberProjectIds.includes(pinnedProjectId)) return pinnedProjectId;
  return activeProjectId;
};
