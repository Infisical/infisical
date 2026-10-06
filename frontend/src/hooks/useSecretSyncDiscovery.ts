import { useCallback, useMemo } from "react";

import { useUser } from "@app/context";
import {
  FEATURE_RELEASE_NEW_WINDOW_DAYS,
  SECRET_SYNC_RELEASES
} from "@app/helpers/featureReleases";
import {
  useCreateFeatureDiscoveries,
  useGetFeatureDiscoveries
} from "@app/hooks/api/featureDiscoveries";
import { useSecretSyncOptions } from "@app/hooks/api/secretSyncs";

const DAY_MS = 24 * 60 * 60 * 1000;
// Matches the announcement grace period: no discovery dots during a user's first week.
const NEW_USER_GRACE_PERIOD_MS = 7 * DAY_MS;

export const useSecretSyncDiscovery = () => {
  const { user } = useUser();
  const { data: syncOptions } = useSecretSyncOptions();
  const { data: discoveries } = useGetFeatureDiscoveries();
  const { mutate: createDiscoveries } = useCreateFeatureDiscoveries();

  const newReleases = useMemo(() => {
    const now = Date.now();
    const available = new Set(syncOptions?.map((option) => option.destination));
    return SECRET_SYNC_RELEASES.filter(({ destination, releasedAt }) => {
      const age = now - new Date(releasedAt).getTime();
      return (
        available.has(destination) && age >= 0 && age < FEATURE_RELEASE_NEW_WINDOW_DAYS * DAY_MS
      );
    }).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
  }, [syncOptions]);

  const unseenReleaseIds = useMemo(() => {
    const seen = new Set(discoveries?.map(({ releaseId }) => releaseId));
    return newReleases
      .filter(({ releaseId }) => !seen.has(releaseId))
      .map(({ releaseId }) => releaseId);
  }, [discoveries, newReleases]);

  const isInGracePeriod =
    Date.now() - new Date(user.createdAt).getTime() < NEW_USER_GRACE_PERIOD_MS;

  const markSecretSyncsSeen = useCallback(() => {
    if (unseenReleaseIds.length) createDiscoveries(unseenReleaseIds);
  }, [unseenReleaseIds, createDiscoveries]);

  return {
    newSecretSyncReleases: newReleases,
    hasUnseenSecretSyncs: Boolean(discoveries) && !isInGracePeriod && unseenReleaseIds.length > 0,
    markSecretSyncsSeen
  };
};
