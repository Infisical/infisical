import { TPamSessions } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamSanitizedSession, TPamSessionCommandLog } from "./pam-session.types";

export const decryptSessionCommandLogs = async ({
  orgId,
  encryptedLogs,
  kmsService
}: {
  orgId: string;
  encryptedLogs: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedLogs
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamSessionCommandLog;
};

export const decryptSession = async (
  session: TPamSessions,
  orgId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  return {
    ...session,
    commandLogs: session.encryptedLogsBlob
      ? await decryptSessionCommandLogs({
          orgId,
          encryptedLogs: session.encryptedLogsBlob,
          kmsService
        })
      : []
  } as TPamSanitizedSession;
};
