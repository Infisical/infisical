const getKey = (userId: string, orgId: string) => `lastProject_${userId}_${orgId}`;

export const getLastProject = (userId: string, orgId: string): string | null => {
  try {
    return localStorage.getItem(getKey(userId, orgId));
  } catch {
    return null;
  }
};

export const setLastProject = (userId: string, orgId: string, projectId: string): void => {
  try {
    localStorage.setItem(getKey(userId, orgId), projectId);
  } catch {
    // localStorage unavailable (e.g. incognito quota exceeded)
  }
};

export const clearLastProject = (userId: string, orgId: string): void => {
  try {
    localStorage.removeItem(getKey(userId, orgId));
  } catch {
    // noop
  }
};
