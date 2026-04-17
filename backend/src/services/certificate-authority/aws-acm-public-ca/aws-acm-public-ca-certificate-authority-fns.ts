/* eslint-disable no-await-in-loop */
import {
  ACMClient,
  CertificateExport,
  CertificateStatus,
  DescribeCertificateCommand,
  ExportCertificateCommand,
  ListCertificatesCommand,
  RenewCertificateCommand,
  RequestCertificateCommand,
  RevocationReason,
  RevokeCertificateCommand,
  ValidationMethod
} from "@aws-sdk/client-acm";
import * as x509 from "@peculiar/x509";

import { TableName } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ProcessedPermissionRules } from "@app/lib/knex/permission-filter-utils";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { extractCertificateFields } from "@app/services/certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertKeyAlgorithm,
  CertStatus,
  CertSubjectAlternativeNameType,
  CrlReason
} from "@app/services/certificate/certificate-types";
import { ExternalMetadataSchema } from "@app/services/certificate-common/external-metadata-schemas";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { createAcmClient, resolveDnsAwsConnection } from "./aws-acm-public-ca-certificate-authority-client";
import { AwsAcmValidationMethod } from "./aws-acm-public-ca-certificate-authority-enums";
import {
  TAwsAcmPublicCaCertificateAuthority,
  TCreateAwsAcmPublicCaCertificateAuthorityDTO,
  TUpdateAwsAcmPublicCaCertificateAuthorityDTO
} from "./aws-acm-public-ca-certificate-authority-types";
import {
  acmValidationFailedError,
  AcmValidationPendingError,
  buildIdempotencyToken,
  calculateAcmRenewBeforeDays,
  generateAcmPassphrase,
  mapCertKeyAlgorithmToAcm,
  validateAcmIssuanceInputs
} from "./aws-acm-public-ca-certificate-authority-validators";
import { route53GetHostedZone, route53UpsertRecord } from "./dns-providers/route53";

const CRL_REASON_TO_ACM_REVOCATION_REASON_MAP: Record<CrlReason, RevocationReason> = {
  [CrlReason.UNSPECIFIED]: RevocationReason.UNSPECIFIED,
  [CrlReason.KEY_COMPROMISE]: RevocationReason.KEY_COMPROMISE,
  [CrlReason.CA_COMPROMISE]: RevocationReason.CA_COMPROMISE,
  [CrlReason.AFFILIATION_CHANGED]: RevocationReason.AFFILIATION_CHANGED,
  [CrlReason.SUPERSEDED]: RevocationReason.SUPERSEDED,
  [CrlReason.CESSATION_OF_OPERATION]: RevocationReason.CESSATION_OF_OPERATION,
  [CrlReason.CERTIFICATE_HOLD]: RevocationReason.CERTIFICATE_HOLD,
  [CrlReason.PRIVILEGE_WITHDRAWN]: RevocationReason.PRIVILEGE_WITHDRAWN,
  [CrlReason.A_A_COMPROMISE]: RevocationReason.A_A_COMPROMISE
};

type TAwsAcmPublicCaCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "findById" | "findOne" | "transaction" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
};

export const castDbEntryToAwsAcmPublicCaCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TAwsAcmPublicCaCertificateAuthority => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed AWS ACM Public Certificate Authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "AWS app connection ID is missing from certificate authority configuration"
    });
  }

  const configuration = ca.externalCa.configuration as {
    dnsAppConnectionId?: string;
    hostedZoneId?: string;
    region: AWSRegion;
  };

  if (!configuration.region || !configuration.dnsAppConnectionId || !configuration.hostedZoneId) {
    throw new BadRequestError({
      message: "AWS ACM configuration is incomplete — region, Route 53 connection, and hosted zone ID are required"
    });
  }

  return {
    id: ca.id,
    type: CaType.AWS_ACM_PUBLIC_CA,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      dnsAppConnectionId: configuration.dnsAppConnectionId,
      hostedZoneId: configuration.hostedZoneId,
      region: configuration.region
    },
    status: ca.status as CaStatus
  };
};

export const AwsAcmPublicCaCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL,
  certificateProfileDAL
}: TAwsAcmPublicCaCertificateAuthorityFnsDeps) => {
  const validateAwsConnection = async ({
    appConnectionId,
    dnsAppConnectionId,
    projectId,
    actor
  }: {
    appConnectionId: string;
    dnsAppConnectionId?: string;
    projectId: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await appConnectionDAL.findById(appConnectionId);
    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
    }
    if (appConnection.app !== AppConnection.AWS) {
      throw new BadRequestError({
        message: `App connection with ID '${appConnectionId}' is not an AWS connection`
      });
    }
    await appConnectionService.validateAppConnectionUsageById(
      appConnection.app as AppConnection,
      { connectionId: appConnectionId, projectId },
      actor
    );

    if (dnsAppConnectionId && dnsAppConnectionId !== appConnectionId) {
      const dnsAppConnection = await appConnectionDAL.findById(dnsAppConnectionId);
      if (!dnsAppConnection) {
        throw new NotFoundError({ message: `DNS app connection with ID '${dnsAppConnectionId}' not found` });
      }
      if (dnsAppConnection.app !== AppConnection.AWS) {
        throw new BadRequestError({
          message: `DNS app connection with ID '${dnsAppConnectionId}' is not an AWS connection`
        });
      }
      await appConnectionService.validateAppConnectionUsageById(
        dnsAppConnection.app as AppConnection,
        { connectionId: dnsAppConnectionId, projectId },
        actor
      );
    }
  };

  const createCertificateAuthority = async ({
    name,
    projectId,
    configuration,
    actor,
    status
  }: {
    status: CaStatus;
    name: string;
    projectId: string;
    configuration: TCreateAwsAcmPublicCaCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { appConnectionId, dnsAppConnectionId, hostedZoneId, region } = configuration;

    await validateAwsConnection({ appConnectionId, dnsAppConnectionId, projectId, actor });

    // Smoke-test both connections up front — ACM via ListCertificates (no single "get CA" resource),
    // and Route 53 via GetHostedZone so a misconfigured DNS connection / wrong zone ID fails
    // synchronously here instead of mid-issuance.
    const acmClient = await createAcmClient({ appConnectionId, region, appConnectionDAL, kmsService });
    await acmClient.send(new ListCertificatesCommand({ MaxItems: 1 }));

    const dnsConnection = await resolveDnsAwsConnection({ dnsAppConnectionId, appConnectionDAL, kmsService });
    await route53GetHostedZone(dnsConnection, hostedZoneId);

    const caEntity = await certificateAuthorityDAL.transaction(async (tx) => {
      try {
        const ca = await certificateAuthorityDAL.create(
          {
            projectId,
            enableDirectIssuance: false,
            name,
            status
          },
          tx
        );

        await externalCertificateAuthorityDAL.create(
          {
            caId: ca.id,
            appConnectionId,
            type: CaType.AWS_ACM_PUBLIC_CA,
            configuration: {
              dnsAppConnectionId,
              hostedZoneId,
              region
            }
          },
          tx
        );

        return await certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        if ((error as any)?.error?.code === "23505") {
          throw new BadRequestError({
            message: "Certificate authority with the same name already exists in your project"
          });
        }
        throw error;
      }
    });

    if (!caEntity.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to create external certificate authority" });
    }

    return castDbEntryToAwsAcmPublicCaCertificateAuthority(caEntity);
  };

  const updateCertificateAuthority = async ({
    id,
    status,
    configuration,
    actor,
    name
  }: {
    id: string;
    status?: CaStatus;
    configuration: TUpdateAwsAcmPublicCaCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { appConnectionId, dnsAppConnectionId, hostedZoneId, region } = configuration;

        const ca = await certificateAuthorityDAL.findById(id);
        if (!ca) {
          throw new NotFoundError({ message: `Could not find Certificate Authority with ID "${id}"` });
        }

        await validateAwsConnection({ appConnectionId, dnsAppConnectionId, projectId: ca.projectId, actor });

        const acmClient = await createAcmClient({ appConnectionId, region, appConnectionDAL, kmsService });
        await acmClient.send(new ListCertificatesCommand({ MaxItems: 1 }));

        const dnsConnection = await resolveDnsAwsConnection({ dnsAppConnectionId, appConnectionDAL, kmsService });
        await route53GetHostedZone(dnsConnection, hostedZoneId);

        await externalCertificateAuthorityDAL.update(
          {
            caId: id,
            type: CaType.AWS_ACM_PUBLIC_CA
          },
          {
            appConnectionId,
            configuration: {
              dnsAppConnectionId,
              hostedZoneId,
              region
            }
          },
          tx
        );
      }

      if (name || status) {
        await certificateAuthorityDAL.updateById(
          id,
          {
            name,
            status
          },
          tx
        );
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(id, tx);
    });

    if (!updatedCa.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to update external certificate authority" });
    }

    return castDbEntryToAwsAcmPublicCaCertificateAuthority(updatedCa);
  };

  const listCertificateAuthorities = async ({
    projectId,
    permissionFilters
  }: {
    projectId: string;
    permissionFilters?: ProcessedPermissionRules;
  }) => {
    const cas = await certificateAuthorityDAL.findWithAssociatedCa(
      {
        [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.AWS_ACM_PUBLIC_CA
      },
      {},
      permissionFilters
    );

    return cas.map(castDbEntryToAwsAcmPublicCaCertificateAuthority);
  };

  /**
   * Issues (or renews) a certificate from AWS Certificate Manager.
   *
   * Idempotent via AWS's IdempotencyToken: retrying the same certificateId within
   * AWS's 1-hour window returns the same certificate ARN, so we don't need to persist
   * intermediate state across retries. The cert record is only created when everything
   * completes, in a single DB transaction. If DNS validation is still pending, this
   * function throws AcmValidationPendingError and the queue retries.
   */
  const orderCertificateFromProfile = async ({
    caId,
    profileId,
    commonName,
    altNames = [],
    keyAlgorithm = CertKeyAlgorithm.RSA_2048,
    signatureAlgorithm,
    isRenewal,
    originalCertificateId,
    certificateId,
    csr,
    validity,
    organization,
    organizationalUnit,
    country,
    state,
    locality,
    keyUsages = [],
    extendedKeyUsages = []
  }: {
    caId: string;
    profileId: string;
    commonName: string;
    altNames?: Array<{ type: CertSubjectAlternativeNameType; value: string }>;
    keyAlgorithm?: CertKeyAlgorithm;
    signatureAlgorithm?: string;
    isRenewal?: boolean;
    originalCertificateId?: string;
    certificateId: string;
    csr?: string;
    validity?: { ttl?: string };
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    keyUsages?: string[];
    extendedKeyUsages?: string[];
  }) => {
    validateAcmIssuanceInputs({
      csr,
      keyAlgorithm,
      altNames,
      ttl: validity?.ttl,
      organization,
      organizationalUnit,
      country,
      state,
      locality
    });

    if (keyUsages.length > 0 || extendedKeyUsages.length > 0) {
      logger.info(
        `[caId=${caId}] AWS ACM overrides caller-specified key usages and extended key usages with its own current policy.`
      );
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.AWS_ACM_PUBLIC_CA) {
      throw new BadRequestError({ message: "CA is not an AWS ACM Public Certificate Authority" });
    }

    const acmCa = castDbEntryToAwsAcmPublicCaCertificateAuthority(ca);
    if (acmCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA is disabled" });
    }

    const { appConnectionId, dnsAppConnectionId, hostedZoneId, region } = acmCa.configuration;

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
    let certificateArn: string;
    let acmClient: ACMClient;

    if (isRenewal && originalCertificateId) {
      const originalCert = await certificateDAL.findById(originalCertificateId);
      if (!originalCert) {
        throw new BadRequestError({ message: `Original certificate ${originalCertificateId} not found` });
      }
      const parsedMetadata = ExternalMetadataSchema.safeParse(originalCert.externalMetadata);
      if (
        !parsedMetadata.success ||
        parsedMetadata.data.type !== CaType.AWS_ACM_PUBLIC_CA ||
        !parsedMetadata.data.arn
      ) {
        throw new BadRequestError({
          message: "Original certificate is missing AWS ACM metadata — cannot renew"
        });
      }
      certificateArn = parsedMetadata.data.arn;

      // ARNs are region-locked. Use the cert's stored region, not the CA's current region
      // (the CA's region may have been edited since the cert was issued).
      acmClient = await createAcmClient({
        appConnectionId,
        region: parsedMetadata.data.region,
        appConnectionDAL,
        kmsService
      });

      const describe = await acmClient.send(new DescribeCertificateCommand({ CertificateArn: certificateArn }));
      const detail = describe.Certificate;
      if (!detail) {
        throw new BadRequestError({ message: `ACM did not return details for certificate ${certificateArn}` });
      }

      const awsNotAfter = detail.NotAfter;
      const storedNotAfter = originalCert.notAfter;
      const alreadyRenewedByAws = awsNotAfter && storedNotAfter && awsNotAfter.getTime() > storedNotAfter.getTime();

      if (!alreadyRenewedByAws) {
        if (detail.DomainValidationOptions) {
          const dnsConnection = await resolveDnsAwsConnection({
            dnsAppConnectionId,
            appConnectionDAL,
            kmsService
          });
          for (const dv of detail.DomainValidationOptions) {
            if (dv.ResourceRecord?.Name && dv.ResourceRecord?.Value) {
              await route53UpsertRecord(dnsConnection, hostedZoneId, {
                name: dv.ResourceRecord.Name,
                type: "CNAME",
                value: dv.ResourceRecord.Value
              });
            }
          }
        }

        const renewalInProgress = detail.RenewalSummary?.RenewalStatus === "PENDING_VALIDATION";
        if (!renewalInProgress) {
          await acmClient.send(new RenewCertificateCommand({ CertificateArn: certificateArn }));
        }

        const afterRenew = await acmClient.send(new DescribeCertificateCommand({ CertificateArn: certificateArn }));
        const renewStatus = afterRenew.Certificate?.RenewalSummary?.RenewalStatus;
        if (renewStatus === "PENDING_VALIDATION") {
          throw new AcmValidationPendingError(
            `AWS ACM renewal for ${certificateArn} is still pending validation — will retry`
          );
        }
        if (renewStatus === "FAILED") {
          throw acmValidationFailedError(`AWS ACM renewal failed for ${certificateArn}`);
        }
      }
    } else {
      // New issuance — use the CA's configured region.
      acmClient = await createAcmClient({ appConnectionId, region, appConnectionDAL, kmsService });

      const domainName = commonName || (altNames.length > 0 ? altNames[0].value : "");
      if (!domainName) {
        throw new BadRequestError({ message: "AWS ACM requires a DomainName (common name or first SAN)" });
      }
      const subjectAlternativeNames = altNames.map((s) => s.value);

      const idempotencyToken = buildIdempotencyToken(certificateId);

      const requestResult = await acmClient.send(
        new RequestCertificateCommand({
          DomainName: domainName,
          SubjectAlternativeNames: subjectAlternativeNames.length > 0 ? subjectAlternativeNames : undefined,
          KeyAlgorithm: mapCertKeyAlgorithmToAcm(keyAlgorithm),
          ValidationMethod: ValidationMethod.DNS,
          IdempotencyToken: idempotencyToken,
          Options: { Export: CertificateExport.ENABLED }
        })
      );

      if (!requestResult.CertificateArn) {
        throw new BadRequestError({ message: "AWS ACM did not return a certificate ARN" });
      }
      certificateArn = requestResult.CertificateArn;

      const describe = await acmClient.send(new DescribeCertificateCommand({ CertificateArn: certificateArn }));
      const detail = describe.Certificate;
      if (!detail) {
        throw new BadRequestError({ message: `ACM did not return details for certificate ${certificateArn}` });
      }

      if (detail.DomainValidationOptions) {
        const dnsConnection = await resolveDnsAwsConnection({
          dnsAppConnectionId,
          appConnectionDAL,
          kmsService
        });
        for (const dv of detail.DomainValidationOptions) {
          if (dv.ResourceRecord?.Name && dv.ResourceRecord?.Value) {
            await route53UpsertRecord(dnsConnection, hostedZoneId, {
              name: dv.ResourceRecord.Name,
              type: "CNAME",
              value: dv.ResourceRecord.Value
            });
          }
        }
      }

      if (detail.Status === CertificateStatus.PENDING_VALIDATION) {
        throw new AcmValidationPendingError(
          `AWS ACM certificate ${certificateArn} is still pending DNS validation — will retry`
        );
      }
      if (
        detail.Status === CertificateStatus.FAILED ||
        detail.Status === CertificateStatus.VALIDATION_TIMED_OUT ||
        detail.Status === CertificateStatus.REVOKED ||
        detail.Status === CertificateStatus.EXPIRED
      ) {
        throw acmValidationFailedError(`AWS ACM certificate ${certificateArn} is in terminal status: ${detail.Status}`);
      }
    }

    const passphrase = generateAcmPassphrase();
    const exportResult = await acmClient.send(
      new ExportCertificateCommand({
        CertificateArn: certificateArn,
        Passphrase: Buffer.from(passphrase, "utf8")
      })
    );

    if (!exportResult.Certificate || !exportResult.PrivateKey) {
      throw new BadRequestError({
        message: `AWS ACM ExportCertificate did not return certificate body or private key for ${certificateArn}`
      });
    }

    const certificatePem = exportResult.Certificate;
    const certificateChainPem = exportResult.CertificateChain || "";
    const encryptedPrivateKeyPem = exportResult.PrivateKey;

    // Decrypt AWS's encrypted private key with the ephemeral passphrase, then re-serialize as plain PKCS8.
    const privateKeyObj = crypto.nativeCrypto.createPrivateKey({
      key: encryptedPrivateKeyPem,
      format: "pem",
      passphrase
    });
    const privateKeyPem = privateKeyObj.export({ format: "pem", type: "pkcs8" }) as string;

    let certObj: x509.X509Certificate;
    try {
      certObj = new x509.X509Certificate(certificatePem);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to parse certificate from AWS ACM: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(privateKeyPem)
    });

    const parsedFields = extractCertificateFields(Buffer.from(certificatePem));

    const externalMetadata = ExternalMetadataSchema.parse({
      type: CaType.AWS_ACM_PUBLIC_CA,
      arn: certificateArn,
      region,
      validationMethod: AwsAcmValidationMethod.DNS
    });

    let newCertId: string;
    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          profileId,
          status: CertStatus.ACTIVE,
          friendlyName: commonName,
          commonName,
          altNames: altNames.map((san) => san.value).join(","),
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyAlgorithm,
          signatureAlgorithm,
          projectId: ca.projectId,
          externalMetadata,
          renewedFromCertificateId: isRenewal && originalCertificateId ? originalCertificateId : null,
          ...parsedFields
        },
        tx
      );

      newCertId = cert.id;

      if (isRenewal && originalCertificateId) {
        await certificateDAL.updateById(originalCertificateId, { renewedByCertificateId: cert.id }, tx);
      }

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        tx
      );

      if (profileId && certificateProfileDAL) {
        const profile = await certificateProfileDAL.findByIdWithConfigs(profileId, tx);
        if (profile) {
          const finalRenewBeforeDays = calculateAcmRenewBeforeDays(profile);
          if (finalRenewBeforeDays !== undefined) {
            await certificateDAL.updateById(cert.id, { renewBeforeDays: finalRenewBeforeDays }, tx);
          }
        }
      }
    });

    return {
      certificate: certificatePem,
      certificateChain: certificateChainPem,
      privateKey: privateKeyPem,
      serialNumber: certObj.serialNumber,
      certificateId: newCertId!,
      ca: acmCa
    };
  };

  const revokeCertificate = async ({
    caId,
    serialNumber,
    reason
  }: {
    caId: string;
    serialNumber: string;
    reason: CrlReason;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.AWS_ACM_PUBLIC_CA) {
      throw new BadRequestError({ message: "CA is not an AWS ACM Public Certificate Authority" });
    }

    const acmCa = castDbEntryToAwsAcmPublicCaCertificateAuthority(ca);
    const { appConnectionId } = acmCa.configuration;

    // ACM revokes by ARN, not serial number. Look up the ARN from the cert's externalMetadata.
    const cert = await certificateDAL.findOne({ caId, serialNumber });
    if (!cert) {
      throw new NotFoundError({
        message: `Certificate with serial number '${serialNumber}' not found under CA '${caId}'`
      });
    }
    const parsedMetadata = ExternalMetadataSchema.safeParse(cert.externalMetadata);
    if (!parsedMetadata.success || parsedMetadata.data.type !== CaType.AWS_ACM_PUBLIC_CA || !parsedMetadata.data.arn) {
      throw new BadRequestError({
        message: `Certificate '${cert.id}' is missing AWS ACM metadata — cannot resolve ARN for revocation`
      });
    }

    // ARNs are region-locked — use the cert's stored region, not the CA's current region.
    const acmClient = await createAcmClient({
      appConnectionId,
      region: parsedMetadata.data.region,
      appConnectionDAL,
      kmsService
    });
    const revocationReason = CRL_REASON_TO_ACM_REVOCATION_REASON_MAP[reason];

    const result = await acmClient.send(
      new RevokeCertificateCommand({
        CertificateArn: parsedMetadata.data.arn,
        RevocationReason: revocationReason
      })
    );
    logger.info(result, "AWS ACM RevokeCertificate result");
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderCertificateFromProfile,
    revokeCertificate
  };
};

// Re-export for existing callers (queue, v3 service, approval fns, etc.).
export { acmValidationFailedError, AcmValidationPendingError, validateAcmIssuanceInputs };
