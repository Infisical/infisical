import { Knex } from "knex";

import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export type TAlertEncryptor = (data: { plainText: Buffer }) => { cipherTextBlob: Buffer };
export type TAlertDecryptor = (data: { cipherTextBlob: Buffer }) => Buffer;

export const getAlertChannelCipher = (
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  scope: { orgId: string; projectId?: string | null },
  tx?: Knex
) =>
  kmsService.createCipherPairWithDataKey(
    scope.projectId
      ? { type: KmsDataKey.SecretManager, projectId: scope.projectId }
      : { type: KmsDataKey.Organization, orgId: scope.orgId },
    tx
  );

export const encryptChannelConfig = (config: unknown, encryptor: TAlertEncryptor): Buffer =>
  encryptor({ plainText: Buffer.from(JSON.stringify(config)) }).cipherTextBlob;

export const decryptChannelConfig = <T = unknown>(encryptedConfig: Buffer, decryptor: TAlertDecryptor): T =>
  JSON.parse(decryptor({ cipherTextBlob: encryptedConfig }).toString()) as T;
