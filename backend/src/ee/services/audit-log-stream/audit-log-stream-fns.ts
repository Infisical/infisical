import { TAuditLogStreams } from "@app/db/schemas/audit-log-streams";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TAuditLogStream, TAuditLogStreamCredentials } from "./audit-log-stream-types";
import { getAzureProviderListItem } from "./azure/azure-provider-fns";
import { getCriblProviderListItem } from "./cribl/cribl-provider-fns";
import { getCustomProviderListItem } from "./custom/custom-provider-fns";
import { getDatadogProviderListItem } from "./datadog/datadog-provider-fns";
import { getSplunkProviderListItem } from "./splunk/splunk-provider-fns";

export const listProviderOptions = () => {
  return [
    getDatadogProviderListItem(),
    getSplunkProviderListItem(),
    getCustomProviderListItem(),
    getAzureProviderListItem(),
    getCriblProviderListItem()
  ].sort((a, b) => a.name.localeCompare(b.name));
};

export const encryptLogStreamCredentials = async ({
  orgId,
  credentials,
  kmsService
}: {
  orgId: string;
  credentials: TAuditLogStreamCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptLogStreamCredentials = async ({
  orgId,
  encryptedCredentials,
  kmsService
}: {
  orgId: string;
  encryptedCredentials: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TAuditLogStreamCredentials;
};

export const decryptLogStream = async (
  logStream: TAuditLogStreams,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  return {
    ...logStream,
    credentials: await decryptLogStreamCredentials({
      encryptedCredentials: logStream.encryptedCredentials,
      orgId: logStream.orgId,
      kmsService
    })
  } as TAuditLogStream;
};
