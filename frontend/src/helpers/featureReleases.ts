import { SecretSync } from "@app/hooks/api/secretSyncs";

export const FEATURE_RELEASE_NEW_WINDOW_DAYS = 30;

// Add an entry in the PR that ships a new sync to promote it for FEATURE_RELEASE_NEW_WINDOW_DAYS.
// releaseId must stay stable once shipped: it is the key users' discovery state is stored under.
export const SECRET_SYNC_RELEASES: {
  releaseId: string;
  destination: SecretSync;
  releasedAt: string;
}[] = [
  { releaseId: "secret-sync-daytona", destination: SecretSync.Daytona, releasedAt: "2026-09-03" }
];
