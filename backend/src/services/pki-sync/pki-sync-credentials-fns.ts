import { KmsDataKey, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPkiSyncRaw, TPkiSyncWithCredentials } from "./pki-sync-types";

export type TPkiSyncCredentials = {
  exportPassword?: string;
};

type TKmsService = TKmsCoreDomain;

export const encryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  credentials,
  kmsCoreDomain
}: {
  orgId: string;
  projectId: string | null | undefined;
  credentials: TPkiSyncCredentials;
  kmsCoreDomain: TKmsService;
}): Promise<Buffer> => {
  const { encryptor } = await kmsCoreDomain.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

const decryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  encryptedCredentials,
  kmsCoreDomain
}: {
  orgId: string;
  projectId: string | null | undefined;
  encryptedCredentials: Buffer;
  kmsCoreDomain: TKmsService;
}): Promise<TPkiSyncCredentials> => {
  const { decryptor } = await kmsCoreDomain.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const decrypted = decryptor({ cipherTextBlob: encryptedCredentials });
  return JSON.parse(decrypted.toString()) as TPkiSyncCredentials;
};

export const hydratePkiSyncCredentials = async ({
  pkiSync,
  appConnectionDAL,
  projectDAL,
  kmsCoreDomain
}: {
  pkiSync: TPkiSyncRaw;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsCoreDomain: TKmsCoreDomain;
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
    kmsCoreDomain,
    projectId: appConnectionProjectId
  });

  const syncCredentials = pkiSync.encryptedCredentials
    ? await decryptPkiSyncCredentials({
        orgId,
        projectId: pkiSync.projectId,
        encryptedCredentials: pkiSync.encryptedCredentials,
        kmsCoreDomain
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
