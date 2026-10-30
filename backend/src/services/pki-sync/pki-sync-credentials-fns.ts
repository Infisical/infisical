import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPkiSyncRaw, TPkiSyncWithCredentials } from "./pki-sync-types";

export type TPkiSyncCredentials = {
  exportPassword?: string;
};

type TKmsService = Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

export const encryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  credentials,
  kmsService
}: {
  orgId: string;
  projectId: string | null | undefined;
  credentials: TPkiSyncCredentials;
  kmsService: TKmsService;
}): Promise<Buffer> => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

const decryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  encryptedCredentials,
  kmsService
}: {
  orgId: string;
  projectId: string | null | undefined;
  encryptedCredentials: Buffer;
  kmsService: TKmsService;
}): Promise<TPkiSyncCredentials> => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const decrypted = decryptor({ cipherTextBlob: encryptedCredentials });
  return JSON.parse(decrypted.toString()) as TPkiSyncCredentials;
};

export const hydratePkiSyncCredentials = async ({
  pkiSync,
  appConnectionDAL,
  projectDAL,
  kmsService
}: {
  pkiSync: TPkiSyncRaw;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
    kmsService,
    projectId: appConnectionProjectId
  });

  const syncCredentials = pkiSync.encryptedCredentials
    ? await decryptPkiSyncCredentials({
        orgId,
        projectId: pkiSync.projectId,
        encryptedCredentials: pkiSync.encryptedCredentials,
        kmsService
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
