import { TPamSessionEventBatches, TPamSessions } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamSanitizedSession, TPamSessionCommandLog, TTerminalEvent } from "./pam-session-types";

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

  return JSON.parse(decryptedPlainTextBlob.toString()) as (TPamSessionCommandLog | TTerminalEvent)[];
};

export const decryptBatches = async (
  batches: TPamSessionEventBatches[],
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const events: (TPamSessionCommandLog | TTerminalEvent)[] = [];
  for (const batch of batches) {
    const plain = decryptor({ cipherTextBlob: batch.encryptedEventsBlob });
    const batchEvents = JSON.parse(plain.toString()) as (TPamSessionCommandLog | TTerminalEvent)[];
    events.push(...batchEvents);
  }
  return events;
};

export const decryptSession = async (
  session: TPamSessions,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const { encryptedAiInsights } = session;

  let aiInsights: { summary: string; warnings: { text: string; logIndex?: number }[] } | null = null;
  if (encryptedAiInsights) {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    aiInsights = JSON.parse(decryptor({ cipherTextBlob: encryptedAiInsights }).toString()) as {
      summary: string;
      warnings: { text: string; logIndex?: number }[];
    };
  }

  return {
    ...session,
    logs: session.encryptedLogsBlob
      ? await decryptSessionCommandLogs({
          projectId,
          encryptedLogs: session.encryptedLogsBlob,
          kmsService
        })
      : [],
    aiInsights
  } as TPamSanitizedSession;
};
