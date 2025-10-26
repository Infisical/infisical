/* eslint-disable no-await-in-loop */
import * as AWS from "aws-sdk";
import RE2 from "re2";
import { z } from "zod";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
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

const findTagByKey = (tags: AWS.ACM.TagList | undefined, key: string): AWS.ACM.Tag | undefined => {
  if (!tags || !Array.isArray(tags)) {
    return undefined;
  }
  return tags.find((tag: AWS.ACM.Tag) => tag.Key === key && tag.Value);
};

const findInfisicalCertificateTag = (tags: AWS.ACM.TagList | undefined): AWS.ACM.Tag | undefined => {
  return findTagByKey(tags, INFISICAL_CERTIFICATE_TAG);
};

const validateCertificateIdentification = (
  certName: string,
  existingCert: { arn?: string; Tags?: AWS.ACM.TagList; cert?: string; privateKey?: string; certificateChain?: string }
): boolean => {
  if (!existingCert?.arn || !existingCert?.Tags) {
    return false;
  }

  const certNameTag = findInfisicalCertificateTag(existingCert.Tags);

  if (!certNameTag || !certNameTag.Value) {
    return false;
  }

  return certNameTag.Value === certName;
};

type TAwsCertificateManagerPkiSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  appConnectionDAL
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

    const { acmCertificates } = await $getAwsAcmCertificates(acm, pkiSync.id);

    const setCertificates: CertificateImportRequest[] = [];

    const activeCertificateNames = Object.keys(certificateMap);

    Object.entries(certificateMap).forEach(([certName, certData]) => {
      const { cert, privateKey, certificateChain } = certData;
      const certificateName = generateCertificateName(certName, pkiSync);

      const existingCert = Object.values(acmCertificates).find((acmCert) =>
        validateCertificateIdentification(certName, acmCert)
      );

      const shouldUpdateCert = !existingCert || existingCert.cert !== cert;

      try {
        validateCertificateContent(cert, privateKey);
      } catch (validationError) {
        throw new PkiSyncError({
          message: `Certificate validation failed for ${certName}: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
          shouldRetry: false,
          context: {
            certificateName,
            certName
          }
        });
      }

      if (shouldUpdateCert) {
        setCertificates.push({
          key: certName,
          name: certificateName,
          cert,
          privateKey,
          certificateChain,
          existingArn: existingCert?.arn
        });
      }
    });

    // Identify expired/removed certificates that need to be cleaned up from ACM
    const certificatesToRemove = Object.values(acmCertificates)
      .filter((acmCert) => {
        if (!acmCert.arn || !acmCert.Tags) {
          return false;
        }

        const certNameTag = findInfisicalCertificateTag(acmCert.Tags);
        if (!certNameTag || !certNameTag.Value) {
          return false;
        }

        const isActive = activeCertificateNames.includes(certNameTag.Value);
        return !isActive;
      })
      .map((acmCert) => acmCert.arn!)
      .filter((arn) => arn);

    const uploadResults = await executeWithConcurrencyLimit(
      setCertificates,
      async ({ key, name, cert, privateKey, certificateChain, existingArn }) => {
        try {
          const importParams: AWS.ACM.ImportCertificateRequest = {
            Certificate: cert,
            PrivateKey: privateKey,
            Tags: [
              {
                Key: INFISICAL_CERTIFICATE_TAG,
                Value: key
              }
            ]
          };

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
    } = {};

    if (failedUploads.length > 0) {
      details.failedUploads = failedUploads.map((failure, index) => {
        const certificateName = setCertificates[index]?.name || "unknown";
        let errorMessage = "Unknown error";

        if (failure.status === "rejected") {
          errorMessage = failure.reason instanceof Error ? failure.reason.message : "Unknown error";
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
    certificateNames: string[]
  ): Promise<RemoveCertificatesResult> => {
    const destinationConfig = pkiSync.destinationConfig as TAwsCertificateManagerPkiSyncConfig;
    const acm = await getAwsAcmClient(
      pkiSync.connection.id,
      destinationConfig.region as AWSRegion,
      appConnectionDAL,
      kmsService
    );

    const { acmCertificates } = await $getAwsAcmCertificates(acm, pkiSync.id);

    const certificateArnsToRemove: string[] = [];

    for (const certName of certificateNames) {
      const matchingCerts = Object.values(acmCertificates).filter((acmCert) =>
        validateCertificateIdentification(certName, acmCert)
      );

      for (const acmCert of matchingCerts) {
        if (acmCert.arn) {
          certificateArnsToRemove.push(acmCert.arn);
        }
      }
    }

    const results = await executeWithConcurrencyLimit(
      certificateArnsToRemove,
      async (certificateArn) =>
        deleteCertificateFromAcm(acm, certificateArn, "delete-specific-certificate", pkiSync.id, true),
      { operation: "remove-specific-certificates", syncId: pkiSync.id }
    );

    const failedRemovals = results.filter((result) => result.status === "rejected");

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
