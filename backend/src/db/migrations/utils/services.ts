import { Knex } from "knex";

import { getDefaultOnPremFeatures } from "@app/domains/platform/license/ce/module";
import { initializeHsmModule, isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsLegacyEncryptionKeyDALFactory } from "@app/services/kms/kms-legacy-encryption-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";

import { TMigrationEnvConfig } from "./env-config";

type TDependencies = {
  envConfig: TMigrationEnvConfig;
  db: Knex;
  keyStore: TKeyStoreFactory;
  skipHsmLicenseCheck?: boolean;
};

type THsmServiceDependencies = {
  envConfig: Pick<TMigrationEnvConfig, "HSM_PIN" | "HSM_SLOT" | "HSM_LIB_PATH" | "HSM_KEY_LABEL" | "isHsmConfigured">;
};

export const getMigrationHsmService = async ({ envConfig }: THsmServiceDependencies) => {
  const hsmModule = initializeHsmModule(envConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig
  });

  await hsmService.startService();

  return { hsmService };
};

export const getMigrationEncryptionServices = async ({
  envConfig,
  db,
  keyStore,
  skipHsmLicenseCheck = true
}: TDependencies) => {
  // ----- DAL dependencies -----
  const orgDAL = orgDALFactory(db);
  const projectDAL = projectDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
  const kmsLegacyEncryptionKeyDAL = kmsLegacyEncryptionKeyDALFactory(db);
  const kmsKekHistoryDAL = kmsKekHistoryDALFactory(db);
  const kmsDAL = kmskeyDALFactory(db);
  const internalKmsDAL = internalKmsDALFactory(db);
  const internalKmsKeyVersionDAL = internalKmsKeyVersionDALFactory(db);

  // ----- Service dependencies -----

  // ----- HSM startup -----

  const { hsmService } = await getMigrationHsmService({ envConfig });

  const hsmStatus = await isHsmActiveAndEnabled({
    hsmService,
    kmsRootConfigDAL,
    // Migrations run before the license is read, so the instance holds the community entitlements.
    instanceHasHsm: skipHsmLicenseCheck ? undefined : getDefaultOnPremFeatures().hsm
  });

  // if the encryption strategy is software - user needs to provide an encryption key
  // if the encryption strategy is null AND the hsm is not configured - user needs to provide an encryption key
  const needsEncryptionKey =
    hsmStatus.rootKmsConfigEncryptionStrategy === RootKeyEncryptionStrategy.Software ||
    (hsmStatus.rootKmsConfigEncryptionStrategy === null && !hsmStatus.isHsmConfigured);

  if (needsEncryptionKey) {
    if (!envConfig.ROOT_ENCRYPTION_KEY && !envConfig.ENCRYPTION_KEY) {
      throw new BadRequestError({
        message:
          "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment.\nYou can enable HSM encryption in the Server Console."
      });
    }
  }

  // ----- KMS startup -----

  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    kmsLegacyEncryptionKeyDAL,
    kmsKekHistoryDAL,
    kmsDAL,
    internalKmsDAL,
    internalKmsKeyVersionDAL,
    orgDAL,
    projectDAL,
    hsmService,
    keyStore,
    envConfig
  });

  await kmsService.startService(hsmStatus, { skipRotationState: true });

  return { kmsService, hsmService };
};
