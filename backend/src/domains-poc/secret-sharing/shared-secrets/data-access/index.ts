import { TDbClient } from "@app/db";

import { SharedSecretDataAccess, TSharedSecretDataAccess } from "./shared-secret-data-access";

export type TSecretSharingDataAccess = {
  sharedSecrets: TSharedSecretDataAccess;
};

export const buildSecretSharingDataAccess = (db: TDbClient): TSecretSharingDataAccess => ({
  sharedSecrets: new SharedSecretDataAccess(db)
});
