import { TDbClient } from "@app/db";

import { KmsCoreModule } from "./platform/kms-core";
import { SecretSharingModule } from "./secret-sharing/shared-secrets";

export const createClassDomains = ({ db, rootKey }: { db: TDbClient; rootKey: Buffer }) => {
  const kmsCore = new KmsCoreModule({ db, rootKey });
  const secretSharing = new SecretSharingModule({ db, kmsCore: kmsCore.service });

  return [kmsCore, secretSharing];
};
