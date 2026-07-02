import { TAuditLogs, TAuditLogStreams } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AuditLogStreamProduct } from "./audit-log-stream-enums";
import { TAuditLogStreamFilters } from "./audit-log-stream-schemas";
import { TAuditLogStream, TAuditLogStreamCredentials } from "./audit-log-stream-types";
import { getAzureProviderListItem } from "./azure/azure-provider-fns";
import { getCriblProviderListItem } from "./cribl/cribl-provider-fns";
import { getCustomProviderListItem } from "./custom/custom-provider-fns";
import { getDatadogProviderListItem } from "./datadog/datadog-provider-fns";
import { getSplunkProviderListItem } from "./splunk/splunk-provider-fns";
import { getSumoLogicProviderListItem } from "./sumo-logic/sumo-logic-provider-fns";

export const listProviderOptions = () => {
  return [
    getDatadogProviderListItem(),
    getSplunkProviderListItem(),
    getCustomProviderListItem(),
    getAzureProviderListItem(),
    getCriblProviderListItem(),
    getSumoLogicProviderListItem()
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

export const streamHasProductFilter = (stream: Pick<TAuditLogStreams, "filters">): boolean =>
  ((stream.filters as TAuditLogStreamFilters | null)?.products?.length ?? 0) > 0;

export const resolveAuditLogProduct = (
  log: Pick<TAuditLogs, "projectId">,
  projectTypeById: Map<string, string>
): AuditLogStreamProduct | null => {
  if (!log.projectId) return AuditLogStreamProduct.Organization;
  return (projectTypeById.get(log.projectId) as AuditLogStreamProduct | undefined) ?? null;
};

export const auditLogMatchesStreamFilter = (
  product: AuditLogStreamProduct | null,
  filters?: TAuditLogStreamFilters | null
): boolean => {
  const products = filters?.products;
  if (!products || products.length === 0) return true;
  if (product === null) return false;
  return products.includes(product);
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
