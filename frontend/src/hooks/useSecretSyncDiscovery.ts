import { FeatureArea } from "@app/helpers/featureReleases";
import { SecretSync, useSecretSyncOptions } from "@app/hooks/api/secretSyncs";

import { useFeatureDiscovery } from "./useFeatureDiscovery";

export const useSecretSyncDiscovery = () => {
  const { data: syncOptions } = useSecretSyncOptions();
  const { newReleases, unseenCount, markSeen } = useFeatureDiscovery(
    FeatureArea.SecretSyncs,
    syncOptions?.map((option) => option.destination)
  );

  return {
    newSecretSyncReleases: newReleases.map((release) => ({
      ...release,
      destination: release.item as SecretSync
    })),
    unseenSecretSyncCount: unseenCount,
    markSecretSyncsSeen: markSeen
  };
};
