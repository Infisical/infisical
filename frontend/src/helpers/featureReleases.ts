import { SecretSync } from "@app/hooks/api/secretSyncs";

export const FEATURE_RELEASE_NEW_WINDOW_DAYS = 30;

export enum FeatureArea {
  SecretSyncs = "secret-syncs"
}

// item identifies the release within its area, e.g. the SecretSync destination for FeatureArea.SecretSyncs.
export type TFeatureRelease = {
  releaseId: string;
  area: FeatureArea;
  item: string;
  releasedAt: string;
};

// Add an entry in the PR that ships a feature to promote it for FEATURE_RELEASE_NEW_WINDOW_DAYS.
// releaseId must stay stable once shipped: it is the key users' discovery state is stored under.
export const FEATURE_RELEASES: TFeatureRelease[] = [
  {
    releaseId: "secret-sync-daytona",
    area: FeatureArea.SecretSyncs,
    item: SecretSync.Daytona,
    releasedAt: "2026-09-03"
  }
];
