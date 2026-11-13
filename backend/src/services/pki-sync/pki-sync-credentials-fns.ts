import { KmsDataKey, TDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPkiSyncRaw, TPkiSyncWithCredentials } from "./pki-sync-types";

export type TPkiSyncCredentials = {
  exportPassword?: string;
};

export const encryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  credentials,
  dataKeyService
}: {
  orgId: string;
  projectId: string | null | undefined;
  credentials: TPkiSyncCredentials;
  dataKeyService: TDataKeyService;
}): Promise<Buffer> => {
  const { encryptor } = await dataKeyService.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

const decryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  encryptedCredentials,
  dataKeyService
}: {
  orgId: string;
  projectId: string | null | undefined;
  encryptedCredentials: Buffer;
  dataKeyService: TDataKeyService;
}): Promise<TPkiSyncCredentials> => {
  const { decryptor } = await dataKeyService.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const decrypted = decryptor({ cipherTextBlob: encryptedCredentials });
  return JSON.parse(decrypted.toString()) as TPkiSyncCredentials;
};

export const hydratePkiSyncCredentials = async ({
  pkiSync,
  appConnectionDAL,
  projectDAL,
  dataKeyService
}: {
  pkiSync: TPkiSyncRaw;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  dataKeyService: TDataKeyService;
}): Promise<TPkiSyncWithCredentials> => {
  const {
    connection: { id: connectionId, orgId, projectId: appConnectionProjectId }
  } = pkiSync;

  const appConnection = await appConnectionDAL.findById(connectionId);
  if (!appConnection) {
    throw new Error(`App connection not found: ${connectionId}`);
  }

  const project = appConnectionProjectId ? await projectDAL.findById(appConnectionProjectId) : null;

  const credentials = await decryptAppConnectionCredentials({
    orgId,
    encryptedCredentials: appConnection.encryptedCredentials,
    dataKeyService,
    projectId: appConnectionProjectId
  });

  const syncCredentials = pkiSync.encryptedCredentials
    ? await decryptPkiSyncCredentials({
        orgId,
        projectId: pkiSync.projectId,
        encryptedCredentials: pkiSync.encryptedCredentials,
        dataKeyService
      })
    : undefined;

  return {
    ...pkiSync,
    connection: {
      ...pkiSync.connection,
      credentials,
      projectType: project?.type
    },
    syncCredentials
  } as TPkiSyncWithCredentials;
};
