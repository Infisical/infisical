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

// The product an audit log belongs to. A log created inside a project belongs to that project's
// product (project `type` values are 1:1 with AuditLogStreamProduct); a log with no project is an
// org-level event. A project whose type can't be resolved (e.g. hard-deleted) falls back to
// Organization so it still reaches org-scoped streams rather than being silently dropped.
export const resolveAuditLogProduct = (
  log: Pick<TAuditLogs, "projectId">,
  projectTypeById: Map<string, string>
): AuditLogStreamProduct => {
  if (!log.projectId) return AuditLogStreamProduct.Organization;
  return (
    (projectTypeById.get(log.projectId) as AuditLogStreamProduct | undefined) ?? AuditLogStreamProduct.Organization
  );
};

// Whether a stream with the given filters should receive a log of the given product. A null filter
// or an absent/empty `products` list means "stream everything" (backwards-compatible default).
export const auditLogMatchesStreamFilter = (
  product: AuditLogStreamProduct,
  filters?: TAuditLogStreamFilters | null
): boolean => {
  const products = filters?.products;
  if (!products || products.length === 0) return true;
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
