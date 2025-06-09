import { Knex } from "knex";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";

import { TMigrationEnvConfig } from "./env-config";

type TDependencies = {
  envConfig: TMigrationEnvConfig;
  db: Knex;
  keyStore: TKeyStoreFactory;
};

export const getMigrationEncryptionServices = async ({ envConfig, db, keyStore }: TDependencies) => {
  // eslint-disable-next-line no-param-reassign
  const hsmModule = initializeHsmModule(envConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig
  });

  const orgDAL = orgDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
  const kmsDAL = kmskeyDALFactory(db);
  const internalKmsDAL = internalKmsDALFactory(db);
  const projectDAL = projectDALFactory(db);

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

  await hsmService.startService();
  await kmsService.startService();

  return { kmsService };
};
