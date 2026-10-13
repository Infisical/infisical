const STORAGE_PREFIX = "infisical-ss-active-project-";

const storageKey = (orgId: string) => `${STORAGE_PREFIX}${orgId}`;

export const getSecretScanningActiveProject = (orgId: string): string | null => {
  try {
    return localStorage.getItem(storageKey(orgId));
  } catch {
    return null;
  }
};

export const setSecretScanningActiveProject = (orgId: string, projectId: string): void => {
  try {
    localStorage.setItem(storageKey(orgId), projectId);
  } catch {
    // Without storage, the org's active project is opened instead of the one last viewed.
  }
};

// Which Secret Scanning project a page in this org shows, now that the URL carries none: the one the
// user last opened, while they are still a member of it, otherwise the org's active project. Unlike
// Certificate Manager's cookie, the backend never reads this: every project-scoped Secret Scanning
// request names its projectId, so only the frontend needs to agree with itself.
export const resolveSecretScanningProjectId = ({
  orgId,
  activeProjectId,
  memberProjectIds
}: {
  orgId: string;
  activeProjectId: string | null;
  memberProjectIds: string[];
}): string | null => {
  const pinnedProjectId = getSecretScanningActiveProject(orgId);
  if (pinnedProjectId && memberProjectIds.includes(pinnedProjectId)) return pinnedProjectId;
  return activeProjectId;
};
