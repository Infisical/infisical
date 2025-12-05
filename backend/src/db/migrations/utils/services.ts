import { Knex } from "knex";

import { initializeHsmModule, isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { licenseDALFactory } from "@app/ee/services/license/license-dal";
import { licenseServiceFactory } from "@app/ee/services/license/license-service";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import { TMigrationEnvConfig } from "./env-config";

type TDependencies = {
  envConfig: TMigrationEnvConfig;
  db: Knex;
  keyStore: TKeyStoreFactory;
};

type THsmServiceDependencies = {
  envConfig: Pick<TMigrationEnvConfig, "HSM_PIN" | "HSM_SLOT" | "HSM_LIB_PATH" | "HSM_KEY_LABEL" | "isHsmConfigured" | "HSM_ENCRYPTION_STRATEGY">;
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

export const getMigrationEncryptionServices = async ({ envConfig, db, keyStore }: TDependencies) => {
  // ----- DAL dependencies -----
  const orgDAL = orgDALFactory(db);
  const licenseDAL = licenseDALFactory(db);
  const permissionDAL = permissionDALFactory(db);
  const projectDAL = projectDALFactory(db);
  const roleDAL = roleDALFactory(db);
  const userDAL = userDALFactory(db);
  const identityDAL = identityDALFactory(db);
  const serviceTokenDAL = serviceTokenDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
  const kmsDAL = kmskeyDALFactory(db);
  const internalKmsDAL = internalKmsDALFactory(db);

  // ----- Service dependencies -----
  const permissionService = permissionServiceFactory({
    permissionDAL,
    serviceTokenDAL,
    projectDAL,
    keyStore,
    roleDAL,
    userDAL,
    identityDAL
  });

  const licenseService = licenseServiceFactory({
    permissionService,
    orgDAL,
    licenseDAL,
    keyStore,
    projectDAL,
    envConfig
  });

  // ----- HSM startup -----

  const { hsmService } = await getMigrationHsmService({ envConfig });

  const hsmStatus = await isHsmActiveAndEnabled({
    hsmService,
    kmsRootConfigDAL,
    licenseService
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
    keyStore,
    kmsDAL,
    internalKmsDAL,
    orgDAL,
    projectDAL,
    hsmService,
    envConfig
  });

  await kmsService.startService(hsmStatus);

  return { kmsService, hsmService };
};
