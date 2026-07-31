import { useCallback, useState } from "react";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const wasDismissedWithinLastDay = (storageKey: string): boolean => {
  const dismissedAt = localStorage.getItem(storageKey);
  if (!dismissedAt) return false;
  const dismissedTime = parseInt(dismissedAt, 10);
  return Date.now() - dismissedTime < ONE_DAY_MS;
};

/**
 * Dismissal state for a banner, persisted for a day so it survives reloads and navigation but comes back
 * afterwards. Same behaviour as the network health banner.
 */
export const useBannerDismissal = (storageKey: string): [boolean, () => void] => {
  // localStorage is the source of truth and is read on every render, so a changing storageKey (e.g.
  // switching project) is picked up without the consumer having to remount. The state only exists to
  // re-render after a dismissal.
  const [, setDismissCount] = useState(0);

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, Date.now().toString());
    setDismissCount((count) => count + 1);
  }, [storageKey]);

  return [wasDismissedWithinLastDay(storageKey), dismiss];
};
