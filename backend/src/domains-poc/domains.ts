import { TDbClient } from "@app/db";

import { BillingCoreModule, TPlanFeature } from "./platform/billing-core";
import { KmsCoreModule } from "./platform/kms-core";
import { KmsCoreEeModule } from "./platform/kms-core/ee";
import { SecretSharingModule } from "./secret-sharing/shared-secrets";

export const createDomains = ({
  db,
  rootKey,
  externalKmsProviderKey,
  licensedFeatures
}: {
  db: TDbClient;
  rootKey: Buffer;
  externalKmsProviderKey: Buffer;
  licensedFeatures: TPlanFeature[];
}) => {
  const billingCore = new BillingCoreModule({ licensedFeatures });
  const kmsCoreEe = new KmsCoreEeModule({ db, rootKey, billingCore: billingCore.service, externalKmsProviderKey });
  const kmsCore = new KmsCoreModule({ db, rootKey }, kmsCoreEe.hooks);
  const secretSharing = new SecretSharingModule({ db, kmsCore: kmsCore.service });

  return [billingCore, kmsCoreEe, kmsCore, secretSharing];
};
