import { Knex } from "knex";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { folderCheckpointDALFactory } from "@app/services/folder-checkpoint/folder-checkpoint-dal";
import { folderCheckpointResourcesDALFactory } from "@app/services/folder-checkpoint-resources/folder-checkpoint-resources-dal";
import { folderCommitDALFactory } from "@app/services/folder-commit/folder-commit-dal";
import { folderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { folderCommitChangesDALFactory } from "@app/services/folder-commit-changes/folder-commit-changes-dal";
import { folderTreeCheckpointDALFactory } from "@app/services/folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { folderTreeCheckpointResourcesDALFactory } from "@app/services/folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { resourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { secretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { secretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { secretVersionV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { userDALFactory } from "@app/services/user/user-dal";

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

export const getMigrationPITServices = async ({
  db,
  keyStore,
  envConfig
}: {
  db: Knex;
  keyStore: TKeyStoreFactory;
  envConfig: TMigrationEnvConfig;
}) => {
  const projectDAL = projectDALFactory(db);
  const folderCommitDAL = folderCommitDALFactory(db);
  const folderCommitChangesDAL = folderCommitChangesDALFactory(db);
  const folderCheckpointDAL = folderCheckpointDALFactory(db);
  const folderTreeCheckpointDAL = folderTreeCheckpointDALFactory(db);
  const userDAL = userDALFactory(db);
  const identityDAL = identityDALFactory(db);
  const folderDAL = secretFolderDALFactory(db);
  const folderVersionDAL = secretFolderVersionDALFactory(db);
  const secretVersionV2BridgeDAL = secretVersionV2BridgeDALFactory(db);
  const folderCheckpointResourcesDAL = folderCheckpointResourcesDALFactory(db);
  const secretV2BridgeDAL = secretV2BridgeDALFactory({ db, keyStore });
  const folderTreeCheckpointResourcesDAL = folderTreeCheckpointResourcesDALFactory(db);
  const secretTagDAL = secretTagDALFactory(db);

  const orgDAL = orgDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
  const kmsDAL = kmskeyDALFactory(db);
  const internalKmsDAL = internalKmsDALFactory(db);
  const resourceMetadataDAL = resourceMetadataDALFactory(db);

  const hsmModule = initializeHsmModule(envConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig
  });

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

  const folderCommitService = folderCommitServiceFactory({
    folderCommitDAL,
    folderCommitChangesDAL,
    folderCheckpointDAL,
    folderTreeCheckpointDAL,
    userDAL,
    identityDAL,
    folderDAL,
    folderVersionDAL,
    secretVersionV2BridgeDAL,
    projectDAL,
    folderCheckpointResourcesDAL,
    secretV2BridgeDAL,
    folderTreeCheckpointResourcesDAL,
    kmsService,
    secretTagDAL,
    resourceMetadataDAL
  });

  return { folderCommitService };
};
