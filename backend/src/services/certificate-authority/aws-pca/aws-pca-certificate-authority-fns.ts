/* eslint-disable no-await-in-loop */
import {
  ACMPCAClient,
  CertificateAuthorityStatus,
  DescribeCertificateAuthorityCommand,
  GetCertificateCommand,
  IssueCertificateCommand,
  RequestInProgressException,
  RevokeCertificateCommand,
  ValidityPeriodType
} from "@aws-sdk/client-acm-pca";
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TableName } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ProcessedPermissionRules } from "@app/lib/knex/permission-filter-utils";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { extractCertificateFields } from "@app/services/certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  CertSubjectAlternativeNameType,
  CrlReason,
  mapSanTypeToX509Type
} from "@app/services/certificate/certificate-types";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import {
  API_CSR_PASSTHROUGH_TEMPLATE_ARN,
  CA_KEY_ALGORITHM_TO_SIGNING_ALGORITHM_MAP,
  CRL_REASON_TO_REVOCATION_REASON_MAP
} from "./aws-pca-certificate-authority-enums";
import {
  TAwsPcaCertificateAuthority,
  TCreateAwsPcaCertificateAuthorityDTO,
  TUpdateAwsPcaCertificateAuthorityDTO
} from "./aws-pca-certificate-authority-types";

const base64UrlToBase64 = (base64url: string): string => {
  let base64 = base64url.replace(new RE2(/-/g), "+").replace(new RE2(/_/g), "/");

  const padding = base64.length % 4;
  if (padding === 2) {
    base64 += "==";
  } else if (padding === 3) {
    base64 += "=";
  }

  return base64;
};

const ensureCsrPemFormat = (csr: string): string => {
  const trimmedCsr = csr.trim();

  if (
    trimmedCsr.includes("-----BEGIN CERTIFICATE REQUEST-----") ||
    trimmedCsr.includes("-----BEGIN NEW CERTIFICATE REQUEST-----")
  ) {
    return trimmedCsr;
  }

  const standardBase64 = base64UrlToBase64(trimmedCsr);

  const base64Lines = standardBase64.match(new RE2(".{1,64}", "g")) || [standardBase64];
  return `-----BEGIN CERTIFICATE REQUEST-----\n${base64Lines.join("\n")}\n-----END CERTIFICATE REQUEST-----`;
};

const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "d":
      return num;
    case "h":
      return Math.ceil(num / 24);
    case "m":
      return Math.ceil(num / (24 * 60));
    default:
      throw new BadRequestError({ message: `Invalid TTL unit: ${unit}` });
  }
};

const calculateFinalRenewBeforeDays = (
  profile: { apiConfig?: { autoRenew?: boolean; renewBeforeDays?: number } } | undefined,
  ttl: string
): number | undefined => {
  const hasAutoRenewEnabled = profile?.apiConfig?.autoRenew === true;
  if (!hasAutoRenewEnabled) {
    return undefined;
  }

  const profileRenewBeforeDays = profile?.apiConfig?.renewBeforeDays;
  if (profileRenewBeforeDays !== undefined) {
    const certificateTtlInDays = parseTtlToDays(ttl);
    if (profileRenewBeforeDays >= certificateTtlInDays) {
      return Math.max(1, certificateTtlInDays - 1);
    }
    return profileRenewBeforeDays;
  }

  return undefined;
};

type TAwsPcaCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById">;
};

/**
 * Creates an ACMPCAClient from an app connection ID by decrypting credentials
 * and resolving AWS configuration.
 */
const createPcaClient = async ({
  appConnectionId,
  region,
  appConnectionDAL,
  kmsService
}: {
  appConnectionId: string;
  region: AWSRegion;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
}) => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
  }

  const decryptedConnection = (await decryptAppConnection(appConnection, kmsService)) as TAwsConnection;
  const awsConfig = await getAwsConnectionConfig(decryptedConnection, region);

  return new ACMPCAClient({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: awsConfig.credentials!,
    region: awsConfig.region
  });
};

/**
 * Polls GetCertificateCommand with exponential backoff until the certificate is ready.
 */
const pollForCertificate = async (
  pcaClient: ACMPCAClient,
  certificateAuthorityArn: string,
  certificateArn: string
): Promise<{ certificate: string; certificateChain: string }> => {
  const maxRetries = 10;
  const initialDelayMs = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const result = await pcaClient.send(
        new GetCertificateCommand({
          CertificateAuthorityArn: certificateAuthorityArn,
          CertificateArn: certificateArn
        })
      );

      if (result.Certificate) {
        return {
          certificate: result.Certificate,
          certificateChain: result.CertificateChain || ""
        };
      }
    } catch (error) {
      if (error instanceof RequestInProgressException) {
        // Certificate not yet issued, wait and retry
        const delay = initialDelayMs * 2 ** attempt;
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
        // eslint-disable-next-line no-continue
        continue;
      }
      throw error;
    }

    // Delay between retries
    const delay = initialDelayMs * 2 ** attempt;
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }

  throw new BadRequestError({
    message: `Certificate was not ready after ${maxRetries} polling attempts. The certificate ARN is ${certificateArn} — it may still be processing.`
  });
};

/**
 * Queries the CA's key algorithm via DescribeCertificateAuthority and returns
 * a compatible signing algorithm. The signing algorithm in IssueCertificateCommand
 * must match the CA's key type, not the leaf certificate's key type.
 */
const getSigningAlgorithmForCa = async (pcaClient: ACMPCAClient, certificateAuthorityArn: string) => {
  const describeResult = await pcaClient.send(
    new DescribeCertificateAuthorityCommand({
      CertificateAuthorityArn: certificateAuthorityArn
    })
  );

  const caKeyAlgorithm = describeResult.CertificateAuthority?.CertificateAuthorityConfiguration?.KeyAlgorithm;

  if (!caKeyAlgorithm) {
    throw new BadRequestError({
      message: "Could not determine the CA's key algorithm from AWS PCA"
    });
  }

  const signingAlgorithm = CA_KEY_ALGORITHM_TO_SIGNING_ALGORITHM_MAP[caKeyAlgorithm];
  if (!signingAlgorithm) {
    throw new BadRequestError({
      message: `Unsupported CA key algorithm: ${caKeyAlgorithm}`
    });
  }

  return signingAlgorithm;
};

export const castDbEntryToAwsPcaCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TAwsPcaCertificateAuthority => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed AWS Private Certificate Authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "AWS app connection ID is missing from certificate authority configuration"
    });
  }

  const configuration = ca.externalCa.configuration as {
    certificateAuthorityArn: string;
    region: AWSRegion;
  };

  if (!configuration.certificateAuthorityArn || !configuration.region) {
    throw new BadRequestError({
      message: "AWS PCA configuration is incomplete — missing ARN or region"
    });
  }

  return {
    id: ca.id,
    type: CaType.AWS_PCA,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      certificateAuthorityArn: configuration.certificateAuthorityArn,
      region: configuration.region
    },
    status: ca.status as CaStatus
  };
};

export const AwsPcaCertificateAuthorityFns = ({
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
}: TAwsPcaCertificateAuthorityFnsDeps) => {
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
    configuration: TCreateAwsPcaCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { appConnectionId, certificateAuthorityArn, region } = configuration;

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

    // Verify the CA exists and is ACTIVE in AWS
    const pcaClient = await createPcaClient({ appConnectionId, region, appConnectionDAL, kmsService });
    const describeResult = await pcaClient.send(
      new DescribeCertificateAuthorityCommand({
        CertificateAuthorityArn: certificateAuthorityArn
      })
    );

    if (describeResult.CertificateAuthority?.Status !== CertificateAuthorityStatus.ACTIVE) {
      throw new BadRequestError({
        message: `AWS Private CA '${certificateAuthorityArn}' is not ACTIVE (current status: ${describeResult.CertificateAuthority?.Status || "unknown"})`
      });
    }

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
            type: CaType.AWS_PCA,
            configuration: {
              certificateAuthorityArn,
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

    return castDbEntryToAwsPcaCertificateAuthority(caEntity);
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
    configuration: TUpdateAwsPcaCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { appConnectionId, certificateAuthorityArn, region } = configuration;

        const appConnection = await appConnectionDAL.findById(appConnectionId);
        if (!appConnection) {
          throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
        }

        if (appConnection.app !== AppConnection.AWS) {
          throw new BadRequestError({
            message: `App connection with ID '${appConnectionId}' is not an AWS connection`
          });
        }

        const ca = await certificateAuthorityDAL.findById(id);
        if (!ca) {
          throw new NotFoundError({ message: `Could not find Certificate Authority with ID "${id}"` });
        }

        await appConnectionService.validateAppConnectionUsageById(
          appConnection.app as AppConnection,
          { connectionId: appConnectionId, projectId: ca.projectId },
          actor
        );

        // Verify the new CA exists and is ACTIVE in AWS
        const pcaClient = await createPcaClient({ appConnectionId, region, appConnectionDAL, kmsService });
        const describeResult = await pcaClient.send(
          new DescribeCertificateAuthorityCommand({
            CertificateAuthorityArn: certificateAuthorityArn
          })
        );

        if (describeResult.CertificateAuthority?.Status !== CertificateAuthorityStatus.ACTIVE) {
          throw new BadRequestError({
            message: `AWS Private CA '${certificateAuthorityArn}' is not ACTIVE (current status: ${describeResult.CertificateAuthority?.Status || "unknown"})`
          });
        }

        await externalCertificateAuthorityDAL.update(
          {
            caId: id,
            type: CaType.AWS_PCA
          },
          {
            appConnectionId,
            configuration: {
              certificateAuthorityArn,
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

    return castDbEntryToAwsPcaCertificateAuthority(updatedCa);
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
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.AWS_PCA
      },
      {},
      permissionFilters
    );

    return cas.map(castDbEntryToAwsPcaCertificateAuthority);
  };

  const orderCertificateFromProfile = async ({
    caId,
    profileId,
    commonName,
    altNames = [],
    keyUsages = [],
    extendedKeyUsages = [],
    validity,
    notBefore,
    notAfter,
    signatureAlgorithm,
    keyAlgorithm = CertKeyAlgorithm.RSA_2048,
    isRenewal,
    originalCertificateId,
    csr,
    organization,
    organizationalUnit,
    country,
    state,
    locality
  }: {
    caId: string;
    profileId: string;
    commonName: string;
    altNames?: Array<{ type: CertSubjectAlternativeNameType; value: string }>;
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
    validity: { ttl: string };
    notBefore?: Date;
    notAfter?: Date;
    signatureAlgorithm?: string;
    keyAlgorithm?: CertKeyAlgorithm;
    isRenewal?: boolean;
    originalCertificateId?: string;
    csr?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.AWS_PCA) {
      throw new BadRequestError({ message: "CA is not an AWS Private Certificate Authority" });
    }

    const awsPcaCa = castDbEntryToAwsPcaCertificateAuthority(ca);
    if (awsPcaCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA is disabled" });
    }

    const { appConnectionId, certificateAuthorityArn, region } = awsPcaCa.configuration;

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const pcaClient = await createPcaClient({ appConnectionId, region, appConnectionDAL, kmsService });

    // Get signing algorithm from the CA's key type (not the leaf key type)
    const awsSigningAlgorithm = await getSigningAlgorithmForCa(pcaClient, certificateAuthorityArn);

    let csrPem: string;
    let skLeaf: string | undefined;

    if (csr) {
      // CSR provided — use it directly, no keypair generation
      csrPem = ensureCsrPemFormat(csr);
      skLeaf = undefined;
    } else {
      // No CSR — generate keypair and build CSR with full subject DN
      const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
      const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
      skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

      // Build CSR extensions
      const extensions: x509.Extension[] = [];
      if (altNames && altNames.length > 0) {
        // RFC 5280: SAN must be critical when the subject is empty
        const isSanCritical = !commonName;
        extensions.push(
          new x509.SubjectAlternativeNameExtension(
            altNames.map((san) => ({ type: mapSanTypeToX509Type(san.type), value: san.value })),
            isSanCritical
          )
        );
      }

      if (keyUsages && keyUsages.length > 0) {
        // eslint-disable-next-line no-bitwise
        const keyUsagesBitValue = keyUsages.reduce((accum, ku) => accum | x509.KeyUsageFlags[ku], 0);
        if (keyUsagesBitValue) {
          extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
        }
      }

      if (extendedKeyUsages && extendedKeyUsages.length > 0) {
        extensions.push(
          new x509.ExtendedKeyUsageExtension(
            extendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku]),
            true
          )
        );
      }

      const dnParts: string[] = [];
      if (commonName) dnParts.push(`CN=${commonName}`);
      if (organization) dnParts.push(`O=${organization}`);
      if (organizationalUnit) dnParts.push(`OU=${organizationalUnit}`);
      if (locality) dnParts.push(`L=${locality}`);
      if (state) dnParts.push(`ST=${state}`);
      if (country) dnParts.push(`C=${country}`);
      const subjectDn = dnParts.join(", ") || `CN=${commonName}`;

      const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
        name: subjectDn,
        keys: leafKeys,
        signingAlgorithm: alg,
        ...(extensions.length > 0 && { extensions })
      });

      csrPem = csrObj.toString("pem");
    }

    let validityDays: number;
    if (notBefore && notAfter) {
      if (notAfter <= notBefore) {
        throw new BadRequestError({ message: "Certificate notAfter date must be after notBefore date" });
      }
      const diffMs = notAfter.getTime() - notBefore.getTime();
      validityDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    } else if (notAfter) {
      const diffMs = notAfter.getTime() - Date.now();
      if (diffMs <= 0) {
        throw new BadRequestError({ message: "Certificate notAfter date must be in the future" });
      }
      validityDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    } else {
      validityDays = parseTtlToDays(validity.ttl);
    }

    const sanToGeneralName = (san: { type: CertSubjectAlternativeNameType; value: string }) => {
      switch (san.type) {
        case CertSubjectAlternativeNameType.DNS_NAME:
          return { DnsName: san.value };
        case CertSubjectAlternativeNameType.IP_ADDRESS:
          return { IpAddress: san.value };
        case CertSubjectAlternativeNameType.EMAIL:
          return { Rfc822Name: san.value };
        case CertSubjectAlternativeNameType.URI:
          return { UniformResourceIdentifier: san.value };
        default:
          return { DnsName: san.value };
      }
    };

    const issueResult = await pcaClient.send(
      new IssueCertificateCommand({
        CertificateAuthorityArn: certificateAuthorityArn,
        Csr: Buffer.from(csrPem),
        SigningAlgorithm: awsSigningAlgorithm,
        TemplateArn: API_CSR_PASSTHROUGH_TEMPLATE_ARN,
        ...(altNames &&
          altNames.length > 0 && {
            ApiPassthrough: {
              Extensions: {
                SubjectAlternativeNames: altNames.map(sanToGeneralName)
              }
            }
          }),
        Validity: {
          Type: ValidityPeriodType.DAYS,
          Value: validityDays
        }
      })
    );

    if (!issueResult.CertificateArn) {
      throw new BadRequestError({ message: "AWS PCA did not return a certificate ARN" });
    }

    // Poll for the certificate
    const { certificate: certificatePem, certificateChain: certificateChainPem } = await pollForCertificate(
      pcaClient,
      certificateAuthorityArn,
      issueResult.CertificateArn
    );

    let certObj: x509.X509Certificate;
    try {
      certObj = new x509.X509Certificate(certificatePem);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to parse certificate from AWS PCA: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    let certificateId: string;

    const parsedFields = extractCertificateFields(Buffer.from(certificatePem));

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
          keyUsages,
          extendedKeyUsages,
          keyAlgorithm,
          signatureAlgorithm,
          projectId: ca.projectId,
          renewedFromCertificateId: isRenewal && originalCertificateId ? originalCertificateId : null,
          ...parsedFields
        },
        tx
      );

      certificateId = cert.id;

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

      if (skLeaf) {
        const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
          plainText: Buffer.from(skLeaf)
        });

        await certificateSecretDAL.create(
          {
            certId: cert.id,
            encryptedPrivateKey
          },
          tx
        );
      }

      if (profileId && validity?.ttl && certificateProfileDAL) {
        const profile = await certificateProfileDAL.findById(profileId, tx);
        if (profile) {
          const finalRenewBeforeDays = calculateFinalRenewBeforeDays(undefined, validity.ttl);

          if (finalRenewBeforeDays !== undefined) {
            await certificateDAL.updateById(
              cert.id,
              {
                renewBeforeDays: finalRenewBeforeDays
              },
              tx
            );
          }
        }
      }
    });

    return {
      certificate: certificatePem,
      certificateChain: certificateChainPem,
      privateKey: skLeaf || "",
      serialNumber: certObj.serialNumber,
      certificateId: certificateId!,
      ca: awsPcaCa
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
    if (!ca.externalCa || ca.externalCa.type !== CaType.AWS_PCA) {
      throw new BadRequestError({ message: "CA is not an AWS Private Certificate Authority" });
    }

    const awsPcaCa = castDbEntryToAwsPcaCertificateAuthority(ca);
    const { appConnectionId, certificateAuthorityArn, region } = awsPcaCa.configuration;

    const pcaClient = await createPcaClient({ appConnectionId, region, appConnectionDAL, kmsService });

    const revocationReason = CRL_REASON_TO_REVOCATION_REASON_MAP[reason];

    const revokeResult = await pcaClient.send(
      new RevokeCertificateCommand({
        CertificateAuthorityArn: certificateAuthorityArn,
        CertificateSerial: serialNumber,
        RevocationReason: revocationReason
      })
    );

    logger.info(revokeResult, "AWS PCA RevokeCertificate result");
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderCertificateFromProfile,
    revokeCertificate
  };
};
