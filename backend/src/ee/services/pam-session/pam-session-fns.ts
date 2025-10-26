import { TPamSessions } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamSanitizedSession, TPamSessionCommandLog } from "./pam-session.types";

export const decryptSessionCommandLogs = async ({
  projectId,
  encryptedLogs,
  kmsService
}: {
  projectId: string;
  encryptedLogs: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedLogs
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamSessionCommandLog;
};

export const decryptSession = async (
  session: TPamSessions,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  return {
    ...session,
    commandLogs: session.encryptedLogsBlob
      ? await decryptSessionCommandLogs({
          projectId,
          encryptedLogs: session.encryptedLogsBlob,
          kmsService
        })
      : []
  } as TPamSanitizedSession;
};
