/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  SecretsManagerClient,
  UpdateSecretCommand
} from "@aws-sdk/client-secrets-manager";
import RE2 from "re2";

import { TCertificateSyncs } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { createConnectionQueue, RateLimitConfig } from "@app/services/connection-queue";
import { matchesCertificateNameSchema } from "@app/services/pki-sync/pki-sync-fns";
import { TCertificateMap, TPkiSyncWithCredentials } from "@app/services/pki-sync/pki-sync-types";

import { AWS_SECRETS_MANAGER_PKI_SYNC_DEFAULTS } from "./aws-secrets-manager-pki-sync-constants";
import {
  AwsSecretsManagerCertificateSecret,
  SyncCertificatesResult,
  TAwsSecretsManagerPkiSyncWithCredentials
} from "./aws-secrets-manager-pki-sync-types";

const AWS_SECRETS_MANAGER_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 10,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

const awsSecretsManagerConnectionQueue = createConnectionQueue(AWS_SECRETS_MANAGER_RATE_LIMIT_CONFIG);
const { withRateLimitRetry } = awsSecretsManagerConnectionQueue;

const MAX_RETRIES = 10;

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

const isInfisicalManagedCertificate = (secretName: string, pkiSync: TPkiSyncWithCredentials): boolean => {
  const syncOptions = pkiSync.syncOptions as { certificateNameSchema?: string } | undefined;
  const certificateNameSchema = syncOptions?.certificateNameSchema;

  if (certificateNameSchema) {
    const environment = AWS_SECRETS_MANAGER_PKI_SYNC_DEFAULTS.DEFAULT_ENVIRONMENT;
    return matchesCertificateNameSchema(secretName, environment, certificateNameSchema);
  }

  return secretName.startsWith(AWS_SECRETS_MANAGER_PKI_SYNC_DEFAULTS.INFISICAL_PREFIX);
};

const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown error occurred";
};

const getSecretsManagerClient = async (pkiSync: TAwsSecretsManagerPkiSyncWithCredentials) => {
  const { destinationConfig, connection } = pkiSync;

  const config = await getAwsConnectionConfig(
    connection as TAwsConnectionConfig,
    destinationConfig.region as AWSRegion
  );

  if (!config.credentials) {
    throw new Error("AWS credentials not found in connection configuration");
  }

  const secretsManagerClient = new SecretsManagerClient({
    region: config.region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials: config.credentials
  });

  return secretsManagerClient;
};

type TAwsSecretsManagerPkiSyncFactoryDeps = {
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateById"
    | "findByPkiSyncId"
    | "updateSyncStatus"
  >;
};

export const awsSecretsManagerPkiSyncFactory = ({
  certificateDAL,
  certificateSyncDAL
}: TAwsSecretsManagerPkiSyncFactoryDeps) => {
  const $getSecretsManagerSecrets = async (
    pkiSync: TAwsSecretsManagerPkiSyncWithCredentials,
    syncId = "unknown"
  ): Promise<Record<string, string>> => {
    const client = await getSecretsManagerClient(pkiSync);
    const secrets: Record<string, string> = {};
    let hasNext = true;
    let nextToken: string | undefined;
    let attempt = 0;

    while (hasNext) {
      try {
        const currentToken = nextToken;
        const output = await withRateLimitRetry(
          () => client.send(new ListSecretsCommand({ NextToken: currentToken })),
          {
            operation: "list-secrets-manager-secrets",
            syncId
          }
        );

        attempt = 0;

        if (output.SecretList) {
          output.SecretList.forEach((secretEntry) => {
            if (
              secretEntry.Name &&
              isInfisicalManagedCertificate(secretEntry.Name, pkiSync as unknown as TPkiSyncWithCredentials)
            ) {
              secrets[secretEntry.Name] = secretEntry.ARN || secretEntry.Name;
            }
          });
        }

        hasNext = Boolean(output.NextToken);
        nextToken = output.NextToken;
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "name" in e &&
          (e as { name: string }).name === "ThrottlingException" &&
          attempt < MAX_RETRIES
        ) {
          attempt += 1;
          await sleep();
          continue;
        }
        throw e;
      }
    }

    return secrets;
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<SyncCertificatesResult> => {
    const awsPkiSync = pkiSync as unknown as TAwsSecretsManagerPkiSyncWithCredentials;
    const client = await getSecretsManagerClient(awsPkiSync);

    const existingSecrets = await $getSecretsManagerSecrets(awsPkiSync, pkiSync.id);

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
    const syncRecordsByExternalId = new Map<string, TCertificateSyncs>();

    existingSyncRecords.forEach((record: TCertificateSyncs) => {
      if (record.certificateId) {
        syncRecordsByCertId.set(record.certificateId, record);
      }
      if (record.externalIdentifier) {
        syncRecordsByExternalId.set(record.externalIdentifier, record);
      }
    });

    type CertificateUploadData = {
      secretName: string;
      certificateData: AwsSecretsManagerCertificateSecret;
      certificateId: string;
      isUpdate: boolean;
      targetSecretName: string;
      oldCertificateIdToRemove?: string;
    };

    const setCertificates: CertificateUploadData[] = [];
    const validationErrors: Array<{ name: string; error: string }> = [];

    const syncOptions = pkiSync.syncOptions as
      | {
          canRemoveCertificates?: boolean;
          preserveSecretOnRenewal?: boolean;
          fieldMappings?: {
            certificate?: string;
            privateKey?: string;
            certificateChain?: string;
            caCertificate?: string;
          };
          certificateNameSchema?: string;
        }
      | undefined;

    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const preserveSecretOnRenewal = syncOptions?.preserveSecretOnRenewal ?? true;

    const fieldMappings = {
      certificate: syncOptions?.fieldMappings?.certificate ?? "certificate",
      privateKey: syncOptions?.fieldMappings?.privateKey ?? "private_key",
      certificateChain: syncOptions?.fieldMappings?.certificateChain ?? "certificate_chain",
      caCertificate: syncOptions?.fieldMappings?.caCertificate ?? "ca_certificate"
    };

    const activeExternalIdentifiers = new Set<string>();

    for (const [certName, certData] of Object.entries(certificateMap)) {
      const { cert, privateKey: certPrivateKey, certificateChain, caCertificate, certificateId } = certData;

      if (!cert || cert.trim().length === 0) {
        validationErrors.push({
          name: certName,
          error: "Certificate content is empty or missing"
        });
        continue;
      }

      if (!certPrivateKey || certPrivateKey.trim().length === 0) {
        validationErrors.push({
          name: certName,
          error: "Private key content is empty or missing"
        });
        continue;
      }

      if (!certificateId || typeof certificateId !== "string") {
        continue;
      }

      const certificateData: AwsSecretsManagerCertificateSecret = {
        [fieldMappings.certificate]: cert,
        [fieldMappings.privateKey]: certPrivateKey
      };

      if (certificateChain && certificateChain.trim().length > 0) {
        certificateData[fieldMappings.certificateChain] = certificateChain;
      }

      if (caCertificate && typeof caCertificate === "string" && caCertificate.trim().length > 0) {
        certificateData[fieldMappings.caCertificate] = caCertificate;
      }

      let targetSecretName = certName;
      if (syncOptions?.certificateNameSchema) {
        const extendedCertData = certData as Record<string, unknown>;
        const safeCommonName = typeof extendedCertData.commonName === "string" ? extendedCertData.commonName : "";

        targetSecretName = syncOptions.certificateNameSchema
          .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), certificateId)
          .replace(new RE2("\\{\\{commonName\\}\\}", "g"), safeCommonName);
      } else {
        targetSecretName = `${AWS_SECRETS_MANAGER_PKI_SYNC_DEFAULTS.INFISICAL_PREFIX}${certificateId}`;
      }

      const certificate = await certificateDAL.findById(certificateId);

      if (certificate?.renewedByCertificateId) {
        continue;
      }

      const syncRecordLookupId = certificate?.renewedFromCertificateId || certificateId;
      const existingRecord = syncRecordsByCertId.get(syncRecordLookupId);

      let shouldProcess = true;
      let isUpdate = false;

      if (existingRecord?.externalIdentifier) {
        const existingSecret = existingSecrets[existingRecord.externalIdentifier];

        if (existingSecret) {
          if (certificate?.renewedFromCertificateId && preserveSecretOnRenewal) {
            targetSecretName = existingRecord.externalIdentifier;
            isUpdate = true;
          } else if (certificate?.renewedFromCertificateId && !preserveSecretOnRenewal) {
            activeExternalIdentifiers.add(existingRecord.externalIdentifier);
          } else if (!certificate?.renewedFromCertificateId) {
            activeExternalIdentifiers.add(existingRecord.externalIdentifier);
            shouldProcess = false;
          }
        }
      }

      if (!shouldProcess) {
        continue;
      }

      if (existingSecrets[targetSecretName]) {
        isUpdate = true;
      }

      activeExternalIdentifiers.add(targetSecretName);

      setCertificates.push({
        secretName: certName,
        certificateData,
        certificateId,
        isUpdate,
        targetSecretName,
        oldCertificateIdToRemove:
          certificate?.renewedFromCertificateId && preserveSecretOnRenewal
            ? certificate.renewedFromCertificateId
            : undefined
      });
    }

    const result: SyncCertificatesResult = {
      uploaded: 0,
      updated: 0,
      removed: 0,
      failedRemovals: 0,
      skipped: 0,
      details: {
        failedUploads: [],
        failedRemovals: [],
        validationErrors
      }
    };

    for (const certData of setCertificates) {
      const { secretName, certificateData, certificateId, isUpdate, targetSecretName, oldCertificateIdToRemove } =
        certData;

      try {
        const secretValue = JSON.stringify(certificateData);
        const configKeyId: unknown = awsPkiSync.destinationConfig.keyId;
        const keyId: string = typeof configKeyId === "string" ? configKeyId : "alias/aws/secretsmanager";

        if (isUpdate) {
          await withRateLimitRetry(
            () =>
              client.send(
                new UpdateSecretCommand({
                  SecretId: targetSecretName,
                  SecretString: secretValue,
                  KmsKeyId: keyId
                })
              ),
            {
              operation: "update-secret",
              syncId: pkiSync.id
            }
          );
          result.updated += 1;
        } else {
          await withRateLimitRetry(
            () =>
              client.send(
                new CreateSecretCommand({
                  Name: targetSecretName,
                  SecretString: secretValue,
                  KmsKeyId: keyId,
                  Description: `Certificate managed by Infisical`
                })
              ),
            {
              operation: "create-secret",
              syncId: pkiSync.id
            }
          );
          result.uploaded += 1;
        }

        const existingRecord = syncRecordsByCertId.get(certificateId);
        if (existingRecord?.id) {
          await certificateSyncDAL.updateById(existingRecord.id, {
            externalIdentifier: targetSecretName,
            syncStatus: CertificateSyncStatus.Succeeded,
            lastSyncedAt: new Date(),
            lastSyncMessage: "Certificate successfully synced to AWS Secrets Manager"
          });

          if (oldCertificateIdToRemove && oldCertificateIdToRemove !== certificateId) {
            await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateIdToRemove]);
          }
        } else {
          await certificateSyncDAL.addCertificates(pkiSync.id, [
            {
              certificateId,
              externalIdentifier: targetSecretName
            }
          ]);

          const newCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
          if (newCertSync?.id) {
            await certificateSyncDAL.updateById(newCertSync.id, {
              syncStatus: CertificateSyncStatus.Succeeded,
              lastSyncedAt: new Date(),
              lastSyncMessage: "Certificate successfully synced to AWS Secrets Manager"
            });
          }
        }
      } catch (error) {
        result.details?.failedUploads?.push({
          name: secretName,
          error: parseErrorMessage(error)
        });
        logger.error(
          {
            secretName,
            certificateId,
            error: parseErrorMessage(error),
            pkiSyncId: pkiSync.id
          },
          "Failed to sync certificate"
        );

        const existingRecord = syncRecordsByCertId.get(certificateId);
        if (existingRecord?.id) {
          await certificateSyncDAL.updateById(existingRecord.id, {
            syncStatus: CertificateSyncStatus.Failed,
            lastSyncMessage: parseErrorMessage(error)
          });
        }
      }
    }

    if (canRemoveCertificates) {
      for (const [secretName] of Object.entries(existingSecrets)) {
        if (!activeExternalIdentifiers.has(secretName)) {
          try {
            await withRateLimitRetry(
              () =>
                client.send(
                  new DeleteSecretCommand({
                    SecretId: secretName,
                    ForceDeleteWithoutRecovery: true
                  })
                ),
              {
                operation: "delete-secret",
                syncId: pkiSync.id
              }
            );

            result.removed += 1;

            const recordToRemove = syncRecordsByExternalId.get(secretName);
            if (recordToRemove?.id) {
              await certificateSyncDAL.updateById(recordToRemove.id, {
                syncStatus: CertificateSyncStatus.Failed
              });
            }
          } catch (error) {
            result.failedRemovals += 1;
            result.details?.failedRemovals?.push({
              name: secretName,
              error: parseErrorMessage(error)
            });
            logger.error(
              {
                secretName,
                error: parseErrorMessage(error),
                pkiSyncId: pkiSync.id
              },
              "Failed to remove certificate secret"
            );
          }
        }
      }
    }

    return result;
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<{ removed: number; failed: number }> => {
    const awsPkiSync = pkiSync as unknown as TAwsSecretsManagerPkiSyncWithCredentials;
    const client = await getSecretsManagerClient(awsPkiSync);

    const existingSecrets = await $getSecretsManagerSecrets(awsPkiSync, pkiSync.id);
    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);

    let removed = 0;
    let failed = 0;

    for (const [, certData] of Object.entries(certificateMap)) {
      if (!certData.certificateId) continue;

      const syncRecord = existingSyncRecords.find((record) => record.certificateId === certData.certificateId);
      if (!syncRecord?.externalIdentifier) continue;

      const secretName = syncRecord.externalIdentifier;

      if (existingSecrets[secretName]) {
        try {
          await withRateLimitRetry(
            () =>
              client.send(
                new DeleteSecretCommand({
                  SecretId: secretName,
                  ForceDeleteWithoutRecovery: true
                })
              ),
            {
              operation: "delete-secret",
              syncId: pkiSync.id
            }
          );

          if (syncRecord.id) {
            await certificateSyncDAL.updateById(syncRecord.id, {
              syncStatus: CertificateSyncStatus.Failed
            });
          }

          removed += 1;
        } catch (error) {
          failed += 1;
          logger.error(
            {
              secretName,
              certificateId: certData.certificateId,
              error: parseErrorMessage(error),
              pkiSyncId: pkiSync.id
            },
            "Failed to remove certificate secret"
          );
        }
      }
    }

    return { removed, failed };
  };

  return {
    syncCertificates,
    removeCertificates
  };
};

export type TAwsSecretsManagerPkiSyncFactory = ReturnType<typeof awsSecretsManagerPkiSyncFactory>;
