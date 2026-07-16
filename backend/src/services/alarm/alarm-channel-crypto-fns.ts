import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export type TAlarmEncryptor = (data: { plainText: Buffer }) => { cipherTextBlob: Buffer };
export type TAlarmDecryptor = (data: { cipherTextBlob: Buffer }) => Buffer;

export const getAlarmChannelCipher = (
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  scope: { orgId: string; projectId?: string | null }
) =>
  kmsService.createCipherPairWithDataKey(
    scope.projectId
      ? { type: KmsDataKey.SecretManager, projectId: scope.projectId }
      : { type: KmsDataKey.Organization, orgId: scope.orgId }
  );

export const encryptChannelConfig = (config: unknown, encryptor: TAlarmEncryptor): Buffer =>
  encryptor({ plainText: Buffer.from(JSON.stringify(config)) }).cipherTextBlob;

export const decryptChannelConfig = <T = unknown>(encryptedConfig: Buffer, decryptor: TAlarmDecryptor): T =>
  JSON.parse(decryptor({ cipherTextBlob: encryptedConfig }).toString()) as T;
