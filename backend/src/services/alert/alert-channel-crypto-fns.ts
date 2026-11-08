import { KmsDataKey, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";

export type TAlertEncryptor = (data: { plainText: Buffer }) => { cipherTextBlob: Buffer };
export type TAlertDecryptor = (data: { cipherTextBlob: Buffer }) => Buffer;

export const getAlertChannelCipher = (
  kmsCoreDomain: TKmsCoreDomain,
  scope: { orgId: string; projectId?: string | null }
) =>
  kmsCoreDomain.createCipherPairWithDataKey(
    scope.projectId
      ? { type: KmsDataKey.SecretManager, projectId: scope.projectId }
      : { type: KmsDataKey.Organization, orgId: scope.orgId }
  );

export const encryptChannelConfig = (config: unknown, encryptor: TAlertEncryptor): Buffer =>
  encryptor({ plainText: Buffer.from(JSON.stringify(config)) }).cipherTextBlob;

export const decryptChannelConfig = <T = unknown>(encryptedConfig: Buffer, decryptor: TAlertDecryptor): T =>
  JSON.parse(decryptor({ cipherTextBlob: encryptedConfig }).toString()) as T;
