/* eslint-disable no-await-in-loop */
import AWS from "aws-sdk";
import { z } from "zod";

import { TCertificateSyncs } from "@app/db/schemas";
import { delay } from "@app/lib/delay";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { AwsConnectionMethod } from "@app/services/app-connection/aws/aws-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import {
  AwsConnectionAccessTokenCredentialsSchema,
  AwsConnectionAssumeRoleCredentialsSchema
} from "@app/services/app-connection/aws/aws-connection-schemas";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { createConnectionQueue, RateLimitConfig } from "@app/services/connection-queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { awsCertificateManagerPkiSyncFactory } from "@app/services/pki-sync/aws-certificate-manager/aws-certificate-manager-pki-sync-fns";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { TPkiSyncWithCredentials } from "../pki-sync-types";
import {
  RemoveCertificatesResult,
  SyncCertificatesResult,
  TAwsElasticLoadBalancerPkiSyncConfig
} from "./aws-elastic-load-balancer-pki-sync-types";

type TAwsAssumeRoleCredentials = z.infer<typeof AwsConnectionAssumeRoleCredentialsSchema>;
type TAwsAccessKeyCredentials = z.infer<typeof AwsConnectionAccessTokenCredentialsSchema>;

const AWS_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 10,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

// Delay between removing certificate from listener and deleting from ACM
// AWS needs time to propagate the listener changes
const LISTENER_REMOVAL_PROPAGATION_DELAY_MS = 10000;

const awsConnectionQueue = createConnectionQueue(AWS_RATE_LIMIT_CONFIG);

const { withRateLimitRetry, executeWithConcurrencyLimit } = awsConnectionQueue;

type TAwsElasticLoadBalancerPkiSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateSyncStatus"
    | "updateById"
    | "findByPkiSyncId"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
};

const getAwsElbClient = async (
  connectionId: string,
  region: AWSRegion,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<AWS.ELBv2> => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AWS) {
    throw new BadRequestError({
      message: `Connection '${connectionId}' is not an AWS connection (found: ${appConnection.app})`
    });
  }

  const decryptedCredentials = await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials,
    projectId: appConnection.projectId
  });

  let awsConnectionConfig: TAwsConnectionConfig;
  switch (appConnection.method) {
    case AwsConnectionMethod.AssumeRole:
      awsConnectionConfig = {
        app: AppConnection.AWS,
        method: AwsConnectionMethod.AssumeRole,
        credentials: decryptedCredentials as TAwsAssumeRoleCredentials,
        orgId: appConnection.orgId
      };
      break;
    case AwsConnectionMethod.AccessKey:
      awsConnectionConfig = {
        app: AppConnection.AWS,
        method: AwsConnectionMethod.AccessKey,
        credentials: decryptedCredentials as TAwsAccessKeyCredentials,
        orgId: appConnection.orgId
      };
      break;
    default:
      throw new BadRequestError({
        message: `Unsupported AWS connection method: ${appConnection.method}`
      });
  }

  const awsConfig = await getAwsConnectionConfig(awsConnectionConfig, region);

  return new AWS.ELBv2(awsConfig);
};

const getAwsAcmClient = async (
  connectionId: string,
  region: AWSRegion,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<AWS.ACM> => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AWS) {
    throw new BadRequestError({
      message: `Connection '${connectionId}' is not an AWS connection (found: ${appConnection.app})`
    });
  }

  const decryptedCredentials = await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials,
    projectId: appConnection.projectId
  });

  let awsConnectionConfig: TAwsConnectionConfig;
  switch (appConnection.method) {
    case AwsConnectionMethod.AssumeRole:
      awsConnectionConfig = {
        app: AppConnection.AWS,
        method: AwsConnectionMethod.AssumeRole,
        credentials: decryptedCredentials as TAwsAssumeRoleCredentials,
        orgId: appConnection.orgId
      };
      break;
    case AwsConnectionMethod.AccessKey:
      awsConnectionConfig = {
        app: AppConnection.AWS,
        method: AwsConnectionMethod.AccessKey,
        credentials: decryptedCredentials as TAwsAccessKeyCredentials,
        orgId: appConnection.orgId
      };
      break;
    default:
      throw new BadRequestError({
        message: `Unsupported AWS connection method: ${appConnection.method}`
      });
  }

  const awsConfig = await getAwsConnectionConfig(awsConnectionConfig, region);

  return new AWS.ACM(awsConfig);
};

export const awsElasticLoadBalancerPkiSyncFactory = ({
  kmsService,
  appConnectionDAL,
  certificateSyncDAL,
  certificateDAL
}: TAwsElasticLoadBalancerPkiSyncFactoryDeps) => {
  const acmFactory = awsCertificateManagerPkiSyncFactory({
    kmsService,
    appConnectionDAL,
    certificateSyncDAL,
    certificateDAL
  });

  const attachCertificateToListener = async (
    elbClient: AWS.ELBv2,
    listenerArn: string,
    certificateArn: string,
    setAsDefault: boolean,
    syncId: string
  ): Promise<void> => {
    const listenerCertsResponse = await withRateLimitRetry(
      () => elbClient.describeListenerCertificates({ ListenerArn: listenerArn }).promise(),
      { operation: "describe-listener-certificates", syncId }
    );

    const existingCerts = listenerCertsResponse.Certificates || [];
    const isAlreadyAttached = existingCerts.some((cert) => cert.CertificateArn === certificateArn);
    const currentDefault = existingCerts.find((cert) => cert.IsDefault);
    const isAlreadyDefault = currentDefault?.CertificateArn === certificateArn;

    if (!isAlreadyAttached) {
      await withRateLimitRetry(
        () =>
          elbClient
            .addListenerCertificates({ ListenerArn: listenerArn, Certificates: [{ CertificateArn: certificateArn }] })
            .promise(),
        { operation: "add-listener-certificates", syncId }
      );
    }

    if (setAsDefault && !isAlreadyDefault) {
      await withRateLimitRetry(
        () =>
          elbClient
            .modifyListener({ ListenerArn: listenerArn, Certificates: [{ CertificateArn: certificateArn }] })
            .promise(),
        { operation: "modify-listener", syncId }
      );
    }
  };

  const removeCertificateFromListener = async (
    elbClient: AWS.ELBv2,
    listenerArn: string,
    certificateArn: string,
    syncId: string
  ): Promise<void> => {
    await withRateLimitRetry(
      () =>
        elbClient
          .removeListenerCertificates({ ListenerArn: listenerArn, Certificates: [{ CertificateArn: certificateArn }] })
          .promise(),
      { operation: "remove-listener-certificates", syncId }
    );
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<SyncCertificatesResult> => {
    const destinationConfig = pkiSync.destinationConfig as TAwsElasticLoadBalancerPkiSyncConfig;
    const { region, listeners } = destinationConfig;

    const existingSyncOptions = pkiSync.syncOptions || {};
    const acmPkiSync = {
      ...pkiSync,
      destinationConfig: { region },
      syncOptions: { ...existingSyncOptions, canRemoveCertificates: false }
    };

    const acmResult = await acmFactory.syncCertificates(acmPkiSync, certificateMap);

    const syncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
    syncRecords.forEach((record) => {
      if (record.certificateId) {
        syncRecordsByCertId.set(record.certificateId, record);
      }
    });

    const certificatesToAttach: Array<{ certName: string; certificateArn: string; isDefault: boolean }> = [];

    for (const [certName, certData] of Object.entries(certificateMap)) {
      const { certificateId } = certData;
      if (certificateId) {
        const syncRecord = syncRecordsByCertId.get(certificateId);
        if (syncRecord?.externalIdentifier) {
          const syncMetadata = syncRecord.syncMetadata as { isDefault?: boolean } | null;
          const isDefault = syncMetadata?.isDefault === true;

          certificatesToAttach.push({
            certName,
            certificateArn: syncRecord.externalIdentifier,
            isDefault
          });
        }
      }
    }

    if (certificatesToAttach.length === 0) {
      return acmResult;
    }

    // Attach certificates to ELB listeners
    const elbClient = await getAwsElbClient(pkiSync.connection.id, region as AWSRegion, appConnectionDAL, kmsService);
    const listenerAttachmentErrors: Array<{ name: string; error: string }> = [];
    let attachedCount = 0;

    for (const { certName, certificateArn, isDefault } of certificatesToAttach) {
      const listenerResults = await executeWithConcurrencyLimit(
        listeners,
        async (listener) => {
          try {
            await attachCertificateToListener(elbClient, listener.listenerArn, certificateArn, isDefault, pkiSync.id);
            return { success: true, listenerArn: listener.listenerArn };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return { success: false, listenerArn: listener.listenerArn, error: errorMessage };
          }
        },
        { operation: "attach-certificates-to-listeners", syncId: pkiSync.id }
      );

      const successfulAttachments = listenerResults.filter((r) => r.status === "fulfilled" && r.value.success);
      if (successfulAttachments.length > 0) attachedCount += 1;

      listenerResults.forEach((result) => {
        if (result.status === "fulfilled" && !result.value.success) {
          listenerAttachmentErrors.push({
            name: `${certName} -> ${result.value.listenerArn}`,
            error: result.value.error || "Unknown error"
          });
        } else if (result.status === "rejected") {
          listenerAttachmentErrors.push({
            name: certName,
            error: result.reason instanceof Error ? result.reason.message : "Unknown error"
          });
        }
      });
    }

    let removedCount = 0;
    let failedRemovalCount = 0;
    const removalErrors: Array<{ name: string; error: string }> = [];

    const syncOptions = pkiSync.syncOptions as { canRemoveCertificates?: boolean } | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;

    if (canRemoveCertificates) {
      const activeCertificateIds = new Set<string>();
      for (const certData of Object.values(certificateMap)) {
        if (certData.certificateId) activeCertificateIds.add(certData.certificateId);
      }

      const orphanedRecords = syncRecords.filter(
        (record) => record.externalIdentifier && !activeCertificateIds.has(record.certificateId)
      );

      if (orphanedRecords.length > 0) {
        const acmClient = await getAwsAcmClient(
          pkiSync.connection.id,
          region as AWSRegion,
          appConnectionDAL,
          kmsService
        );

        // Get default certificates for each listener to avoid removing them
        const defaultCertsByListener = new Map<string, string>();
        for (const listener of listeners) {
          try {
            const response = await withRateLimitRetry(
              () => elbClient.describeListenerCertificates({ ListenerArn: listener.listenerArn }).promise(),
              { operation: "describe-listener-certificates-for-cleanup", syncId: pkiSync.id }
            );
            const defaultCert = response.Certificates?.find((c) => c.IsDefault);
            if (defaultCert?.CertificateArn) {
              defaultCertsByListener.set(listener.listenerArn, defaultCert.CertificateArn);
            }
          } catch {
            // Continue - will handle failure during removal
          }
        }

        for (const orphanedRecord of orphanedRecords) {
          const certificateArn = orphanedRecord.externalIdentifier!;
          const { certificateId } = orphanedRecord;

          // Skip if certificate is the default on any listener
          const isDefaultOnListener = Array.from(defaultCertsByListener.values()).includes(certificateArn);
          if (isDefaultOnListener) {
            removalErrors.push({
              name: certificateArn,
              error: "Certificate is the default on a listener. Set a different certificate as default first."
            });
            failedRemovalCount += 1;
          } else {
            // Remove from all listeners first
            for (const listener of listeners) {
              try {
                await removeCertificateFromListener(elbClient, listener.listenerArn, certificateArn, pkiSync.id);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                if (!errorMessage.includes("CertificateNotFound") && !errorMessage.includes("not found")) {
                  logger.warn(`ELB PKI Sync [${pkiSync.id}]: Failed to remove cert from listener: ${errorMessage}`);
                }
              }
            }

            // Wait for AWS to propagate the listener changes
            await delay(LISTENER_REMOVAL_PROPAGATION_DELAY_MS);

            // Remove from ACM
            try {
              await withRateLimitRetry(
                () => acmClient.deleteCertificate({ CertificateArn: certificateArn }).promise(),
                {
                  operation: "delete-orphaned-certificate",
                  syncId: pkiSync.id
                }
              );
              await certificateSyncDAL.removeCertificates(pkiSync.id, [certificateId]);
              removedCount += 1;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              logger.error(`ELB PKI Sync [${pkiSync.id}]: Failed to delete certificate from ACM: ${errorMessage}`);
              if (errorMessage.includes("ResourceInUseException") || errorMessage.includes("in use")) {
                removalErrors.push({
                  name: certificateArn,
                  error: "Certificate is still in use. Please remove it manually."
                });
              } else {
                removalErrors.push({ name: certificateArn, error: errorMessage });
              }
              failedRemovalCount += 1;
            }
          }
        }
      }
    }

    const details = { ...acmResult.details };
    if (listenerAttachmentErrors.length > 0) {
      details.failedUploads = [...(details.failedUploads || []), ...listenerAttachmentErrors];
    }
    if (removalErrors.length > 0) {
      details.failedRemovals = [...(details.failedRemovals || []), ...removalErrors];
    }

    const uploadedCount = acmResult.uploaded > 0 ? acmResult.uploaded : attachedCount;

    return {
      uploaded: uploadedCount,
      removed: acmResult.removed + removedCount,
      failedRemovals: acmResult.failedRemovals + failedRemovalCount,
      skipped: acmResult.skipped,
      details: Object.keys(details).length > 0 ? details : undefined
    };
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateSyncDAL?: TCertificateSyncDALFactory; certificateMap?: TCertificateMap }
  ): Promise<RemoveCertificatesResult> => {
    const destinationConfig = pkiSync.destinationConfig as TAwsElasticLoadBalancerPkiSyncConfig;
    const { region, listeners } = destinationConfig;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const certificateArnsToRemove: Array<{ certName: string; certificateArn: string; certificateId: string }> = [];

    for (const certName of certificateNames) {
      const certificateData = deps?.certificateMap?.[certName];
      if (certificateData?.certificateId) {
        const { certificateId } = certificateData;
        const syncRecord = existingSyncRecords.find((r) => r.certificateId === certificateId);
        if (syncRecord?.externalIdentifier) {
          certificateArnsToRemove.push({ certName, certificateArn: syncRecord.externalIdentifier, certificateId });
        }
      }
    }

    if (certificateArnsToRemove.length === 0) {
      return { removed: 0, failed: 0, skipped: certificateNames.length };
    }

    const elbClient = await getAwsElbClient(pkiSync.connection.id, region as AWSRegion, appConnectionDAL, kmsService);
    const acmClient = await getAwsAcmClient(pkiSync.connection.id, region as AWSRegion, appConnectionDAL, kmsService);

    let removedCount = 0;
    let failedCount = 0;

    for (const { certName, certificateArn, certificateId } of certificateArnsToRemove) {
      // Remove from all listeners first
      for (const listener of listeners) {
        try {
          await removeCertificateFromListener(elbClient, listener.listenerArn, certificateArn, pkiSync.id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          if (!errorMessage.includes("CertificateNotFound") && !errorMessage.includes("not found")) {
            logger.warn(`ELB PKI Sync [${pkiSync.id}]: Failed to remove cert from listener: ${errorMessage}`);
          }
        }
      }

      // Wait for AWS to propagate
      await delay(LISTENER_REMOVAL_PROPAGATION_DELAY_MS);

      // Remove from ACM
      try {
        await withRateLimitRetry(() => acmClient.deleteCertificate({ CertificateArn: certificateArn }).promise(), {
          operation: "delete-certificate",
          syncId: pkiSync.id
        });
        await certificateSyncDAL.removeCertificates(pkiSync.id, [certificateId]);
        removedCount += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(`ELB PKI Sync [${pkiSync.id}]: Failed to delete "${certName}" from ACM: ${errorMessage}`);
        failedCount += 1;
      }
    }

    return {
      removed: removedCount,
      failed: failedCount,
      skipped: certificateNames.length - certificateArnsToRemove.length
    };
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
