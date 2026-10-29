import { TDbClient } from "@app/db";

import { createKmsCoreModule } from "./platform/kms-core";
import { createSecretSharingModule } from "./secret-sharing/shared-secrets";

export const createFunctionalDomains = ({ db, rootKey }: { db: TDbClient; rootKey: Buffer }) => {
  const kmsCore = createKmsCoreModule({ db, rootKey });
  const secretSharing = createSecretSharingModule({ db, kmsCore: kmsCore.service });

  return [kmsCore, secretSharing];
};
