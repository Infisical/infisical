import { useUser } from "@app/context";
import {
  FEATURE_RELEASE_NEW_WINDOW_DAYS,
  FEATURE_RELEASES,
  FeatureArea
} from "@app/helpers/featureReleases";
import {
  useCreateFeatureDiscoveries,
  useGetFeatureDiscoveries
} from "@app/hooks/api/featureDiscoveries";

const DAY_MS = 24 * 60 * 60 * 1000;
// Matches the announcement grace period: no discovery indicators during a user's first week.
const NEW_USER_GRACE_PERIOD_MS = 7 * DAY_MS;

// availableItems is what this instance offers in the area, so unavailable releases are never promoted.
export const useFeatureDiscovery = (area: FeatureArea, availableItems: string[] | undefined) => {
  const { user } = useUser();
  const { data: discoveries } = useGetFeatureDiscoveries();
  const { mutate: createDiscoveries } = useCreateFeatureDiscoveries();

  // Recomputed every render so a page left open past a release window stops promoting it.
  const now = Date.now();
  const available = new Set(availableItems);
  const newReleases = FEATURE_RELEASES.filter((release) => {
    const age = now - new Date(release.releasedAt).getTime();
    return (
      release.area === area &&
      available.has(release.item) &&
      age >= 0 &&
      age < FEATURE_RELEASE_NEW_WINDOW_DAYS * DAY_MS
    );
  }).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));

  const seen = new Set(discoveries?.map(({ releaseId }) => releaseId));
  const unseenReleaseIds = newReleases
    .filter(({ releaseId }) => !seen.has(releaseId))
    .map(({ releaseId }) => releaseId);

  const isInGracePeriod = now - new Date(user.createdAt).getTime() < NEW_USER_GRACE_PERIOD_MS;

  const markSeen = (releaseIds: string[] = unseenReleaseIds) => {
    const toMark = releaseIds.filter((releaseId) => unseenReleaseIds.includes(releaseId));
    if (toMark.length) createDiscoveries(toMark);
  };

  return {
    newReleases,
    unseenCount: discoveries && !isInGracePeriod ? unseenReleaseIds.length : 0,
    markSeen
  };
};
