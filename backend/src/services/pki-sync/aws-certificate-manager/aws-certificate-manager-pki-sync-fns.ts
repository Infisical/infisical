/* eslint-disable no-await-in-loop */
import AWS from "aws-sdk";
import RE2 from "re2";
import { z } from "zod";

import { TCertificateSyncs } from "@app/db/schemas/certificate-syncs";
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
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { createConnectionQueue, RateLimitConfig } from "@app/services/connection-queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import {
  ACMCertificateWithKey,
  CertificateImportRequest,
  RemoveCertificatesResult,
  SyncCertificatesResult,
  TAwsCertificateManagerPkiSyncConfig
} from "./aws-certificate-manager-pki-sync-types";

const INFISICAL_CERTIFICATE_TAG = "InfisicalCertificate";
const AWS_CERTIFICATE_ARN_PATTERN = new RE2("^arn:aws:acm:[a-z0-9-]+:\\d{12}:certificate/[a-f0-9-]{36}$");

type TAwsAssumeRoleCredentials = z.infer<typeof AwsConnectionAssumeRoleCredentialsSchema>;
type TAwsAccessKeyCredentials = z.infer<typeof AwsConnectionAccessTokenCredentialsSchema>;

const AWS_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 10,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

const awsConnectionQueue = createConnectionQueue(AWS_RATE_LIMIT_CONFIG);

const { withRateLimitRetry, executeWithConcurrencyLimit } = awsConnectionQueue;

const validateCertificateArn = (arn: string): boolean => {
  return AWS_CERTIFICATE_ARN_PATTERN.test(arn);
};

const extractCertificateNameFromArn = (certificateArn: string): string => {
  if (!validateCertificateArn(certificateArn)) {
    throw new Error(`Invalid AWS Certificate Manager ARN format: ${certificateArn}`);
  }
  const parts = certificateArn.split("/");
  return parts[parts.length - 1];
};

const sanitizeInput = (input: string): string => {
  return input.trim().replace(new RE2("[^\\w\\s-]", "g"), "");
};

const validateCertificateContent = (cert: string, privateKey: string): void => {
  if (!cert || cert.trim().length === 0) {
    throw new Error("Certificate content is empty or missing");
  }

  if (!privateKey || privateKey.trim().length === 0) {
    throw new Error("Private key content is empty or missing");
  }

  if (!cert.includes("-----BEGIN CERTIFICATE-----") || !cert.includes("-----END CERTIFICATE-----")) {
    throw new Error("Certificate is not in valid PEM format");
  }

  if (!privateKey.includes("-----BEGIN") || !privateKey.includes("-----END")) {
    throw new Error("Private key is not in valid PEM format");
  }
};

const isAwsIssuedCertificate = (certificate: AWS.ACM.CertificateSummary): boolean => {
  return certificate.Type === "AMAZON_ISSUED";
};

const shouldSkipCertificateExport = (certificate: AWS.ACM.CertificateSummary): boolean => {
  return isAwsIssuedCertificate(certificate);
};

const validateCertificateNameSchema = (schema: string): void => {
  if (!schema.includes("{{certificateId}}")) {
    throw new Error(
      "Certificate name schema must include {{certificateId}} placeholder for proper certificate identification"
    );
  }
};

const generateCertificateName = (certificateName: string, pkiSync: TPkiSyncWithCredentials): string => {
  if (!certificateName || typeof certificateName !== "string") {
    throw new Error("Certificate name must be a non-empty string");
  }

  const sanitizedCertificateName = sanitizeInput(certificateName);
  const syncOptions = pkiSync.syncOptions as { certificateNameSchema?: string } | undefined;
  const certificateNameSchema = syncOptions?.certificateNameSchema;

  if (certificateNameSchema) {
    validateCertificateNameSchema(certificateNameSchema);

    let certificateId: string;

    if (sanitizedCertificateName.startsWith("Infisical-")) {
      certificateId = sanitizedCertificateName.substring("Infisical-".length);
    } else {
      certificateId = sanitizedCertificateName;
    }

    if (!certificateId || certificateId.trim().length === 0) {
      throw new Error(`Certificate ID cannot be empty after processing certificate name: ${certificateName}`);
    }

    const environment = "global";
    const generatedName = certificateNameSchema
      .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), certificateId)
      .replace(new RE2("\\{\\{environment\\}\\}", "g"), environment);

    if (generatedName.length > 256 || generatedName.length < 1) {
      throw new Error(
        `Generated certificate name length (${generatedName.length}) must be between 1 and 256 characters`
      );
    }

    if (generatedName.includes("{{certificateId}}")) {
      throw new Error("Certificate name schema failed to properly replace {{certificateId}} placeholder");
    }

    return generatedName;
  }

  return sanitizedCertificateName;
};

type TAwsCertificateManagerPkiSyncFactoryDeps = {
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

export const awsCertificateManagerPkiSyncFactory = ({
  kmsService,
  appConnectionDAL,
  certificateSyncDAL,
  certificateDAL
}: TAwsCertificateManagerPkiSyncFactoryDeps) => {
  const deleteCertificateFromAcm = async (
    acm: AWS.ACM,
    certificateArn: string,
    operation: string,
    syncId: string,
    throwOnError = false
  ): Promise<{ arn: string; success: boolean; error?: Error }> => {
    try {
      await withRateLimitRetry(() => acm.deleteCertificate({ CertificateArn: certificateArn }).promise(), {
        operation,
        syncId
      });
      return { arn: certificateArn, success: true };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error("Unknown error");

      if (throwOnError) {
        throw new PkiSyncError({
          message: `Failed to remove certificate from AWS Certificate Manager: ${errorObj.message}`,
          cause: errorObj,
          context: {
            certificateArn,
            operation
          }
        });
      }

      return {
        arn: certificateArn,
        success: false,
        error: errorObj
      };
    }
  };
  const $getAwsAcmCertificates = async (
    acm: AWS.ACM,
    syncId = "unknown"
  ): Promise<{
    acmCertificates: Record<
      string,
      { cert: string; privateKey: string; certificateChain?: string; arn?: string; Tags?: AWS.ACM.TagList }
    >;
  }> => {
    const paginateAwsAcmCertificates = async () => {
      const certificates: AWS.ACM.CertificateSummary[] = [];
      let nextToken: string | undefined;

      do {
        const listParams: AWS.ACM.ListCertificatesRequest = {
          CertificateStatuses: ["ISSUED"],
          NextToken: nextToken,
          MaxItems: 100
        };

        const response = await withRateLimitRetry(() => acm.listCertificates(listParams).promise(), {
          operation: "list-certificates",
          syncId
        });

        if (response.CertificateSummaryList) {
          certificates.push(...response.CertificateSummaryList);
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return certificates;
    };

    const certificateSummaries = await paginateAwsAcmCertificates();

    const certificateResults = await executeWithConcurrencyLimit(
      certificateSummaries,
      async (certSummary) => {
        if (!certSummary.CertificateArn) {
          throw new Error("Certificate ARN is missing");
        }

        const [certificateDetails, tagsResponse] = await Promise.all([
          acm.describeCertificate({ CertificateArn: certSummary.CertificateArn }).promise(),
          acm.listTagsForCertificate({ CertificateArn: certSummary.CertificateArn }).promise()
        ]);

        let certificateContent: AWS.ACM.GetCertificateResponse | undefined;
        if (!shouldSkipCertificateExport(certSummary)) {
          try {
            certificateContent = await acm.getCertificate({ CertificateArn: certSummary.CertificateArn }).promise();
          } catch (error) {
            // Certificate content cannot be imported
          }
        }

        return {
          ...certificateDetails.Certificate,
          Tags: tagsResponse.Tags,
          key: extractCertificateNameFromArn(certSummary.CertificateArn),
          cert: certificateContent?.Certificate || "",
          certificateChain: certificateContent?.CertificateChain || "",
          privateKey: "", // Private keys cannot be exported from ACM
          arn: certSummary.CertificateArn
        };
      },
      { operation: "fetch-certificate-details", syncId }
    );

    const successfulCertificates: ACMCertificateWithKey[] = [];
    certificateResults.forEach((result) => {
      if (result.status === "fulfilled") {
        successfulCertificates.push(result.value as ACMCertificateWithKey);
      }
    });

    const failedFetches = certificateResults.filter((result) => result.status === "rejected");
    if (failedFetches.length > 0) {
      throw new PkiSyncError({
        message: `Failed to fetch ${failedFetches.length} certificate details from AWS Certificate Manager`,
        shouldRetry: true,
        context: {
          failedCount: failedFetches.length,
          totalCount: certificateSummaries.length
        }
      });
    }

    const res: Record<
      string,
      { cert: string; privateKey: string; certificateChain?: string; arn?: string; Tags?: AWS.ACM.TagList }
    > = successfulCertificates.reduce(
      (obj, certificate) => ({
        ...obj,
        [certificate.key]: {
          cert: certificate.cert,
          privateKey: certificate.privateKey,
          certificateChain: certificate.certificateChain,
          arn: certificate.CertificateArn,
          Tags: certificate.Tags
        }
      }),
      {} as Record<
        string,
        { cert: string; privateKey: string; certificateChain?: string; arn?: string; Tags?: AWS.ACM.TagList }
      >
    );

    return {
      acmCertificates: res
    };
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<SyncCertificatesResult> => {
    const destinationConfig = pkiSync.destinationConfig as TAwsCertificateManagerPkiSyncConfig;
    const acm = await getAwsAcmClient(
      pkiSync.connection.id,
      destinationConfig.region as AWSRegion,
      appConnectionDAL,
      kmsService
    );

    const {
      acmCertificates
    }: {
      acmCertificates: Record<
        string,
        { cert: string; privateKey: string; certificateChain?: string; arn?: string; Tags?: AWS.ACM.TagList }
      >;
    } = await $getAwsAcmCertificates(acm, pkiSync.id);

    const acmCertificatesByArn = new Map<string, (typeof acmCertificates)[string]>();
    Object.values(acmCertificates).forEach((acmCert) => {
      if (acmCert.arn) {
        acmCertificatesByArn.set(acmCert.arn, acmCert);
      }
    });

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

    const setCertificates: CertificateImportRequest[] = [];
    const validationErrors: Array<{ name: string; error: string }> = [];

    const syncOptions = pkiSync.syncOptions as { preserveArn?: boolean; canRemoveCertificates?: boolean } | undefined;
    const preserveArn = syncOptions?.preserveArn ?? true;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;

    const activeExternalIdentifiers = new Set<string>();

    for (const [certName, certData] of Object.entries(certificateMap)) {
      const { cert, privateKey, certificateChain, certificateId } = certData;

      try {
        validateCertificateContent(cert, privateKey);
      } catch (validationError) {
        const errorMessage = validationError instanceof Error ? validationError.message : String(validationError);
        validationErrors.push({
          name: certName,
          error: `Certificate validation failed: ${errorMessage}`
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (preserveArn && certificateId && typeof certificateId === "string") {
        const certificate = await certificateDAL.findById(certificateId);
        if (certificate?.renewedByCertificateId) {
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      const certificateName = generateCertificateName(certName, pkiSync);

      let targetArn: string | undefined;
      let shouldCreateNew = false;

      if (!certificateId || typeof certificateId !== "string") {
        shouldCreateNew = true;
      } else {
        const currentCertificate = await certificateDAL.findById(certificateId);
        const isRenewal = !!currentCertificate?.renewedFromCertificateId;

        if (isRenewal) {
          const currentSyncRecord = syncRecordsByCertId.get(certificateId);
          const oldCertificateId = currentCertificate.renewedFromCertificateId;
          const oldSyncRecord = oldCertificateId ? syncRecordsByCertId.get(oldCertificateId) : undefined;

          if (currentSyncRecord?.externalIdentifier) {
            const existingAcmCert = acmCertificatesByArn.get(currentSyncRecord.externalIdentifier);

            if (existingAcmCert) {
              if (!preserveArn && oldSyncRecord?.externalIdentifier === currentSyncRecord.externalIdentifier) {
                shouldCreateNew = true;
              } else if (preserveArn && oldSyncRecord?.externalIdentifier === currentSyncRecord.externalIdentifier) {
                targetArn = currentSyncRecord.externalIdentifier;
                shouldCreateNew = true;
                activeExternalIdentifiers.add(targetArn);

                if (oldCertificateId && oldSyncRecord) {
                  await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateId]);
                }
              } else {
                targetArn = currentSyncRecord.externalIdentifier;
                activeExternalIdentifiers.add(targetArn);
                shouldCreateNew = false;
              }
            } else {
              shouldCreateNew = true;
            }
          } else if (preserveArn && oldSyncRecord?.externalIdentifier) {
            const existingAcmCert = acmCertificatesByArn.get(oldSyncRecord.externalIdentifier);

            if (existingAcmCert) {
              targetArn = oldSyncRecord.externalIdentifier;
              shouldCreateNew = true;
              activeExternalIdentifiers.add(targetArn);
              if (oldCertificateId) {
                await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateId]);
              }
            } else {
              shouldCreateNew = true;
            }
          } else {
            shouldCreateNew = true;
          }
        } else {
          const existingSyncRecord = syncRecordsByCertId.get(certificateId);
          if (existingSyncRecord?.externalIdentifier) {
            const existingAcmCert = acmCertificatesByArn.get(existingSyncRecord.externalIdentifier);
            if (existingAcmCert) {
              targetArn = existingSyncRecord.externalIdentifier;
              activeExternalIdentifiers.add(targetArn);
              shouldCreateNew = false;
            } else {
              shouldCreateNew = true;
            }
          } else {
            shouldCreateNew = true;
          }
        }
      }

      if (shouldCreateNew) {
        setCertificates.push({
          key: certName,
          name: certificateName,
          cert,
          privateKey,
          certificateChain,
          existingArn: targetArn,
          certificateId: certificateId as string
        });
      }

      if (targetArn) {
        activeExternalIdentifiers.add(targetArn);
      }
    }

    const certificatesToRemove: string[] = [];

    if (canRemoveCertificates) {
      existingSyncRecords.forEach((syncRecord) => {
        if (syncRecord.externalIdentifier && !activeExternalIdentifiers.has(syncRecord.externalIdentifier)) {
          const acmCert = acmCertificatesByArn.get(syncRecord.externalIdentifier);
          if (acmCert?.arn) {
            certificatesToRemove.push(acmCert.arn);
          }
        }
      });

      Object.values(acmCertificates).forEach((acmCert) => {
        if (acmCert.arn && acmCert.Tags) {
          const hasInfisicalTag = acmCert.Tags.some((tag) => tag.Key === INFISICAL_CERTIFICATE_TAG && tag.Value);

          if (hasInfisicalTag) {
            const isTrackedInSyncRecords = existingSyncRecords.some(
              (record) => record.externalIdentifier === acmCert.arn
            );
            const isInActiveSet = activeExternalIdentifiers.has(acmCert.arn);
            if (!isTrackedInSyncRecords && !isInActiveSet && !certificatesToRemove.includes(acmCert.arn)) {
              certificatesToRemove.push(acmCert.arn);
            }
          }
        }
      });
    }

    const uploadResults = await executeWithConcurrencyLimit(
      setCertificates,
      async ({ key, name, cert, privateKey, certificateChain, existingArn, certificateId }) => {
        try {
          const importParams: AWS.ACM.ImportCertificateRequest = {
            Certificate: cert,
            PrivateKey: privateKey
          };

          if (!existingArn) {
            importParams.Tags = [
              {
                Key: INFISICAL_CERTIFICATE_TAG,
                Value: key
              }
            ];
          }

          if (certificateChain && certificateChain.trim().length > 0) {
            importParams.CertificateChain = certificateChain;
          }
          if (existingArn) {
            importParams.CertificateArn = existingArn;
          }

          const response = await withRateLimitRetry(() => acm.importCertificate(importParams).promise(), {
            operation: "import-certificate",
            syncId: pkiSync.id
          });

          if (existingArn && response.CertificateArn) {
            try {
              // Small delay to ensure AWS ACM has processed the certificate import
              await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 500);
              });

              await withRateLimitRetry(
                () =>
                  acm
                    .addTagsToCertificate({
                      CertificateArn: response.CertificateArn!,
                      Tags: [
                        {
                          Key: INFISICAL_CERTIFICATE_TAG,
                          Value: key
                        }
                      ]
                    })
                    .promise(),
                {
                  operation: "add-tags-to-certificate",
                  syncId: pkiSync.id
                }
              );
            } catch (tagError) {
              const errorMessage = tagError instanceof Error ? tagError.message : "Unknown tagging error";
              logger.warn(
                `Failed to add tags to certificate ${key} (ARN: ${response.CertificateArn}): ${errorMessage}`
              );
            }
          }

          if (response.CertificateArn && certificateId) {
            const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
            if (existingCertSync) {
              await certificateSyncDAL.updateById(existingCertSync.id, {
                externalIdentifier: response.CertificateArn,
                syncStatus: CertificateSyncStatus.Succeeded,
                lastSyncedAt: new Date()
              });
            } else {
              await certificateSyncDAL.addCertificates(pkiSync.id, [
                {
                  certificateId,
                  externalIdentifier: response.CertificateArn
                }
              ]);
            }
          }

          return { key, name, success: true, response };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new PkiSyncError({
            message: `Failed to import certificate ${key} to AWS Certificate Manager: ${errorMessage}`,
            cause: error instanceof Error ? error : new Error(errorMessage),
            context: {
              certificateKey: key,
              certificateName: name,
              region: destinationConfig.region
            }
          });
        }
      },
      { operation: "import-certificates", syncId: pkiSync.id }
    );

    const results = uploadResults;
    const failedUploads = results.filter((result) => result.status === "rejected");
    const successfulUploads = results.filter((result) => result.status === "fulfilled");

    let removedCertificates = 0;
    let failedRemovals = 0;
    let removeResults: PromiseSettledResult<{ arn: string; success: boolean; error?: Error }>[] = [];

    if (certificatesToRemove.length > 0) {
      removeResults = await executeWithConcurrencyLimit(
        certificatesToRemove,
        async (certificateArn) => deleteCertificateFromAcm(acm, certificateArn, "delete-certificate", pkiSync.id),
        { operation: "remove-certificates", syncId: pkiSync.id }
      );

      const successfulRemovals = removeResults.filter(
        (result) => result.status === "fulfilled" && result.value.success
      );
      removedCertificates = successfulRemovals.length;
      failedRemovals = removeResults.length - removedCertificates;
    }

    const details: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      validationErrors?: Array<{ name: string; error: string }>;
    } = {};

    if (validationErrors.length > 0) {
      details.validationErrors = validationErrors;
    }

    if (failedUploads.length > 0) {
      details.failedUploads = failedUploads.map((failure, index) => {
        const certificateRequest = setCertificates[index];
        const certificateName = certificateRequest?.name || certificateRequest?.key || "unknown";
        let errorMessage = "Unknown error";

        if (failure.status === "rejected") {
          errorMessage = failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
        }

        return {
          name: certificateName,
          error: errorMessage
        };
      });
    }

    if (failedRemovals > 0 && removeResults.length > 0) {
      const actualFailedRemovals = removeResults
        .map((result, index) => {
          if (result.status === "rejected") {
            const arn = certificatesToRemove[index] || "unknown";
            const errorMessage = result.reason instanceof Error ? result.reason.message : "Unknown error";
            return {
              name: arn.includes("certificate/") ? extractCertificateNameFromArn(arn) : arn,
              error: errorMessage
            };
          }
          return null;
        })
        .filter((item): item is { name: string; error: string } => item !== null);

      details.failedRemovals = actualFailedRemovals;
    }

    return {
      uploaded: successfulUploads.length,
      removed: removedCertificates,
      failedRemovals,
      skipped: Object.keys(certificateMap).length - setCertificates.length,
      details: Object.keys(details).length > 0 ? details : undefined
    };
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateSyncDAL?: TCertificateSyncDALFactory; certificateMap?: TCertificateMap }
  ): Promise<RemoveCertificatesResult> => {
    const destinationConfig = pkiSync.destinationConfig as TAwsCertificateManagerPkiSyncConfig;
    const acm = await getAwsAcmClient(
      pkiSync.connection.id,
      destinationConfig.region as AWSRegion,
      appConnectionDAL,
      kmsService
    );

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const certificateArnsToRemove: string[] = [];
    const certificateIdToArnMap = new Map<string, string>();
    for (const certName of certificateNames) {
      const certificateData = deps?.certificateMap?.[certName];
      if (certificateData?.certificateId) {
        const { certificateId } = certificateData;

        if (typeof certificateId === "string") {
          const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateId);

          if (syncRecord?.externalIdentifier) {
            certificateArnsToRemove.push(syncRecord.externalIdentifier);
            certificateIdToArnMap.set(certificateId, syncRecord.externalIdentifier);
          }
        }
      }
    }

    if (certificateArnsToRemove.length === 0) {
      return {
        removed: 0,
        failed: 0,
        skipped: certificateNames.length
      };
    }

    const results = await executeWithConcurrencyLimit(
      certificateArnsToRemove,
      async (certificateArn) =>
        deleteCertificateFromAcm(acm, certificateArn, "delete-specific-certificate", pkiSync.id, true),
      { operation: "remove-specific-certificates", syncId: pkiSync.id }
    );

    const failedRemovals = results.filter((result) => result.status === "rejected");

    if (failedRemovals.length > 0 && deps?.certificateSyncDAL) {
      for (const failure of failedRemovals) {
        if (failure.status === "rejected") {
          const failedArn = certificateArnsToRemove[results.indexOf(failure)];
          const certificateId = Array.from(certificateIdToArnMap.entries()).find(([, arn]) => arn === failedArn)?.[0];

          if (certificateId) {
            const errorMessage = failure.reason instanceof Error ? failure.reason.message : "Unknown error";
            await deps.certificateSyncDAL.updateSyncStatus(
              pkiSync.id,
              certificateId,
              CertificateSyncStatus.Failed,
              `Failed to remove from AWS: ${errorMessage}`
            );
          }
        }
      }
    }

    const successfulRemovals = results.filter((result) => result.status === "fulfilled");
    if (successfulRemovals.length > 0) {
      const successfulArns = new Set(successfulRemovals.map((_, index) => certificateArnsToRemove[index]));

      const certificateIdsToRemove = Array.from(certificateIdToArnMap.entries())
        .filter(([, arn]) => successfulArns.has(arn))
        .map(([certificateId]) => certificateId);

      if (certificateIdsToRemove.length > 0) {
        await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToRemove);
      }
    }

    if (failedRemovals.length > 0) {
      const failedReasons = failedRemovals.map((failure) => {
        if (failure.status === "rejected") {
          return failure.reason instanceof Error ? failure.reason.message : "Unknown error";
        }
        return "Unknown error";
      });

      throw new PkiSyncError({
        message: `Failed to remove ${failedRemovals.length} certificate(s) from AWS Certificate Manager`,
        context: {
          failedReasons,
          totalCertificates: certificateArnsToRemove.length,
          failedCount: failedRemovals.length
        }
      });
    }

    return {
      removed: certificateArnsToRemove.length - failedRemovals.length,
      failed: failedRemovals.length,
      skipped: certificateNames.length - certificateArnsToRemove.length
    };
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
