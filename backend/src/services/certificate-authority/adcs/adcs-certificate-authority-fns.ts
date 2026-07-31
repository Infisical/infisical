import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TableName } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  ADCS_DISPOSITION_ISSUED,
  AdcsEnrollResult,
  AdcsRevokeResult,
  AdcsTemplatesResult,
  describeAdcsDisposition
} from "@app/lib/gateway-v2/adcs-rpc";
import { ProcessedPermissionRules } from "@app/lib/knex/permission-filter-utils";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { executeAdcsGatewayOperation, resolveAdcsCaName } from "@app/services/app-connection/adcs";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm,
  CertStatus,
  CrlReason
} from "@app/services/certificate/certificate-types";
import { generateLeafKeypairAndCsr } from "@app/services/certificate-common/certificate-csr-utils";
import { calculateFinalRenewBeforeDays } from "@app/services/certificate-common/certificate-issuance-utils";
import { CertificateRequestCancelledError } from "@app/services/certificate-common/certificate-request-errors";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import {
  TADCSCertificateAuthority,
  TCreateADCSCertificateAuthorityDTO,
  TUpdateADCSCertificateAuthorityDTO
} from "./adcs-certificate-authority-types";
import { getAdcsConnectionCredentials } from "./adcs-connection-credentials";

// @peculiar/x509 reports the signature algorithm as { name, hash }; map it to the stored enum.
const SIG_ALG_MAP: Record<string, Record<string, CertSignatureAlgorithm>> = {
  "RSASSA-PKCS1-v1_5": {
    "SHA-256": CertSignatureAlgorithm.RSA_SHA256,
    "SHA-384": CertSignatureAlgorithm.RSA_SHA384,
    "SHA-512": CertSignatureAlgorithm.RSA_SHA512
  },
  ECDSA: {
    "SHA-256": CertSignatureAlgorithm.ECDSA_SHA256,
    "SHA-384": CertSignatureAlgorithm.ECDSA_SHA384,
    "SHA-512": CertSignatureAlgorithm.ECDSA_SHA512
  }
};

// RFC 5280 section 5.3.1 CRLReason codes, which MS-CSRA ICertAdminD::RevokeCertificate expects as `Reason`.
const ADCS_CRL_REASON_CODES: Record<CrlReason, number> = {
  [CrlReason.UNSPECIFIED]: 0,
  [CrlReason.KEY_COMPROMISE]: 1,
  [CrlReason.CA_COMPROMISE]: 2,
  [CrlReason.AFFILIATION_CHANGED]: 3,
  [CrlReason.SUPERSEDED]: 4,
  [CrlReason.CESSATION_OF_OPERATION]: 5,
  [CrlReason.CERTIFICATE_HOLD]: 6,
  [CrlReason.PRIVILEGE_WITHDRAWN]: 9,
  [CrlReason.A_A_COMPROMISE]: 10
};

// The CA (not the request) decides how it signs, so read the algorithm off the issued certificate.
const extractIssuedSignatureAlgorithm = (certObj: x509.X509Certificate): CertSignatureAlgorithm | undefined => {
  try {
    const { name } = certObj.signatureAlgorithm;
    const hashName = (certObj.signatureAlgorithm as { hash?: { name?: string } }).hash?.name;
    if (!hashName) return undefined;
    return SIG_ALG_MAP[name]?.[hashName];
  } catch {
    return undefined;
  }
};

const buildSubjectDN = (commonName: string): string => {
  if (!commonName || !commonName.trim()) {
    throw new BadRequestError({ message: "Common Name is required and cannot be empty" });
  }

  const trimmedCN = commonName.trim();

  const invalidCharsRegex = new RE2("[,=+<>#;\\\\\\]]");
  if (invalidCharsRegex.test(trimmedCN)) {
    throw new BadRequestError({
      message: "Common Name contains invalid characters: , = + < > # ; \\ ]"
    });
  }

  return `CN=${trimmedCN}`;
};

export const castDbEntryToADCSCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TADCSCertificateAuthority & { credentials: Buffer | null | undefined } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed Active Directory Certificate Service certificate authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "ADCS app connection ID is missing from certificate authority configuration"
    });
  }

  const configuration = ca.externalCa.configuration as { caName?: string } | null;

  if (!configuration?.caName) {
    throw new BadRequestError({
      message: "ADCS CA name is missing from certificate authority configuration"
    });
  }

  return {
    id: ca.id,
    type: CaType.ADCS,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      caName: configuration.caName
    },
    status: ca.status as CaStatus
  };
};

type TADCSCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "findOne" | "transaction" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export const ADCSCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL,
  certificateProfileDAL,
  gatewayV2Service,
  gatewayPoolService
}: TADCSCertificateAuthorityFnsDeps) => {
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
    configuration: TCreateADCSCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { appConnectionId, caName } = configuration;
    const appConnection = await appConnectionDAL.findById(appConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
    }

    if (appConnection.app !== AppConnection.ADCS) {
      throw new BadRequestError({
        message: `App connection with ID '${appConnectionId}' is not an ADCS connection`
      });
    }

    await appConnectionService.validateAppConnectionUsageById(
      appConnection.app as AppConnection,
      { connectionId: appConnectionId, projectId },
      actor
    );

    // The CA name is optional on input: when omitted, it is discovered from the CA host over the
    // gateway (before the transaction, since discovery is a network call).
    const resolvedCaName = await resolveAdcsCaName(
      caName,
      () => getAdcsConnectionCredentials(appConnectionId, appConnectionDAL, kmsService),
      { gatewayV2Service, gatewayPoolService },
      { ensureReachable: true }
    );

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
            type: CaType.ADCS,
            configuration: { caName: resolvedCaName }
          },
          tx
        );

        return await certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
      } catch (error) {
        // 23505 = unique constraint violation
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
      throw new BadRequestError({ message: "Failed to create ADCS certificate authority" });
    }

    return castDbEntryToADCSCertificateAuthority(caEntity);
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
    configuration?: TUpdateADCSCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);
    if (!ca || !ca.externalCa) {
      throw new NotFoundError({ message: `Certificate authority with ID '${id}' not found` });
    }

    if (configuration) {
      const { appConnectionId } = configuration;
      const appConnection = await appConnectionDAL.findById(appConnectionId);

      if (!appConnection) {
        throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
      }

      if (appConnection.app !== AppConnection.ADCS) {
        throw new BadRequestError({
          message: `App connection with ID '${appConnectionId}' is not an ADCS connection`
        });
      }

      await appConnectionService.validateAppConnectionUsageById(
        appConnection.app as AppConnection,
        { connectionId: appConnectionId, projectId: ca.projectId },
        actor
      );
    }

    let resolvedUpdateCaName: string | undefined;
    if (configuration) {
      const existingConfig = ca.externalCa.configuration as { caName?: string } | null;
      const existingCaName = existingConfig?.caName;
      const normalizedNewCaName = configuration.caName?.trim() || undefined;
      const configChanged =
        configuration.appConnectionId !== ca.externalCa.appConnectionId || normalizedNewCaName !== existingCaName;

      if (!configChanged && existingCaName) {
        resolvedUpdateCaName = existingCaName;
      } else {
        resolvedUpdateCaName = await resolveAdcsCaName(
          configuration.caName,
          () => getAdcsConnectionCredentials(configuration.appConnectionId, appConnectionDAL, kmsService),
          { gatewayV2Service, gatewayPoolService },
          { ensureReachable: true }
        );
      }
    }

    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { appConnectionId } = configuration;

        await externalCertificateAuthorityDAL.update(
          { caId: id, type: CaType.ADCS },
          {
            appConnectionId,
            configuration: { caName: resolvedUpdateCaName }
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
      throw new BadRequestError({ message: "Failed to update ADCS certificate authority" });
    }

    return castDbEntryToADCSCertificateAuthority(updatedCa);
  };

  const getCertificateAuthority = async ({ caId, projectId }: { caId: string; projectId: string }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca || ca.projectId !== projectId) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    return castDbEntryToADCSCertificateAuthority(ca);
  };

  const deleteCertificateAuthority = async ({ caId, projectId }: { caId: string; projectId: string }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca || ca.projectId !== projectId) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    const adcsCa = castDbEntryToADCSCertificateAuthority(ca);
    await certificateAuthorityDAL.updateById(caId, { status: CaStatus.DISABLED });

    return adcsCa;
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
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.ADCS
      },
      {},
      permissionFilters
    );

    return cas.map(castDbEntryToADCSCertificateAuthority);
  };

  const orderCertificate = async ({
    caId,
    profileId,
    commonName,
    altNames = [],
    keyUsages = [],
    extendedKeyUsages = [],
    template,
    validity,
    signatureAlgorithm,
    keyAlgorithm = CertKeyAlgorithm.RSA_2048,
    csr,
    isRenewal,
    originalCertificateId,
    isCancelled
  }: {
    caId: string;
    profileId?: string;
    commonName: string;
    altNames?: string[];
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
    template?: string;
    validity: { ttl: string };
    signatureAlgorithm?: string;
    keyAlgorithm?: CertKeyAlgorithm;
    csr?: string;
    isRenewal?: boolean;
    originalCertificateId?: string;
    isCancelled?: () => Promise<boolean>;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.ADCS) {
      throw new BadRequestError({ message: "CA is not an Active Directory Certificate Service CA" });
    }

    const adcsCa = castDbEntryToADCSCertificateAuthority(ca);
    if (adcsCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA is disabled" });
    }

    const templateInput = template?.trim();
    if (!templateInput) {
      throw new BadRequestError({
        message: "A certificate template is required to issue through Active Directory Certificate Service."
      });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const { credentials, gatewayId, gatewayPoolId } = await getAdcsConnectionCredentials(
      adcsCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );

    let alg;
    if (signatureAlgorithm) {
      switch (signatureAlgorithm.toUpperCase()) {
        case "RSA-SHA256":
        case "SHA256WITHRSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
          break;
        case "RSA-SHA384":
        case "SHA384WITHRSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_3072);
          break;
        case "RSA-SHA512":
        case "SHA512WITHRSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_4096);
          break;
        case "ECDSA-SHA256":
        case "SHA256WITHECDSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P256);
          break;
        case "ECDSA-SHA384":
        case "SHA384WITHECDSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P384);
          break;
        case "ECDSA-SHA512":
        case "SHA512WITHECDSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P521);
          break;
        default:
          alg = keyAlgorithmToAlgCfg(keyAlgorithm);
          break;
      }
    } else {
      alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    }

    // MS-WCCE expects the CSR as base64-encoded DER PKCS#10.
    let skLeaf: string | undefined;
    let csrDerBase64: string;
    if (csr) {
      csrDerBase64 = Buffer.from(new Uint8Array(new x509.Pkcs10CertificateRequest(csr).rawData)).toString("base64");
    } else {
      const generated = await generateLeafKeypairAndCsr({
        subjectName: buildSubjectDN(commonName),
        algorithm: alg,
        altNames
      });
      skLeaf = generated.privateKeyPem;
      csrDerBase64 = generated.csrDerBase64;
    }

    const enrollResult = await executeAdcsGatewayOperation<AdcsEnrollResult>(
      {
        gatewayId,
        gatewayPoolId,
        credentials,
        endpoint: "/v1/enroll",
        caName: adcsCa.configuration.caName,
        params: { template: templateInput, csr: csrDerBase64 }
      },
      { gatewayV2Service, gatewayPoolService }
    );

    if (enrollResult.disposition !== ADCS_DISPOSITION_ISSUED || !enrollResult.certificatePem) {
      throw new BadRequestError({
        message: describeAdcsDisposition(enrollResult.disposition, {
          requestId: enrollResult.requestId,
          dispositionMessage: enrollResult.dispositionMessage,
          hresult: enrollResult.hresult
        })
      });
    }

    let cleanedCertificatePem = enrollResult.certificatePem.trim();
    cleanedCertificatePem = cleanedCertificatePem
      .replace(new RE2("\\r\\n", "g"), "\n")
      .replace(new RE2("\\r", "g"), "\n")
      .trim();

    let certObj: x509.X509Certificate;
    try {
      certObj = new x509.X509Certificate(cleanedCertificatePem);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to parse certificate from Active Directory Certificate Service: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const certificateChainPem = enrollResult.chainPem || "";

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    if (isCancelled && (await isCancelled())) {
      throw new CertificateRequestCancelledError();
    }

    let certificateId: string;

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          profileId,
          status: CertStatus.ACTIVE,
          friendlyName: commonName,
          commonName,
          altNames: altNames.join(","),
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyUsages,
          extendedKeyUsages,
          keyAlgorithm,
          signatureAlgorithm: extractIssuedSignatureAlgorithm(certObj) ?? signatureAlgorithm,
          projectId: ca.projectId,
          renewedFromCertificateId: isRenewal && originalCertificateId ? originalCertificateId : null
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
          const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
            profile as { apiConfig?: { autoRenew?: boolean; renewBeforeDays?: number } },
            validity.ttl,
            certObj.notAfter
          );
          if (finalRenewBeforeDays !== undefined) {
            await certificateDAL.updateById(cert.id, { renewBeforeDays: finalRenewBeforeDays }, tx);
          }
        }
      }
    });

    return {
      certificate: cleanedCertificatePem,
      certificateChain: certificateChainPem,
      privateKey: skLeaf,
      serialNumber: certObj.serialNumber,
      certificateId: certificateId!,
      ca: adcsCa
    };
  };

  const getCertificateTemplates = async ({ caId, projectId }: { caId: string; projectId: string }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca || ca.projectId !== projectId) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    const adcsCa = castDbEntryToADCSCertificateAuthority(ca);

    const { credentials, gatewayId, gatewayPoolId } = await getAdcsConnectionCredentials(
      adcsCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );

    const { templates } = await executeAdcsGatewayOperation<AdcsTemplatesResult>(
      {
        gatewayId,
        gatewayPoolId,
        credentials,
        endpoint: "/v1/templates",
        caName: adcsCa.configuration.caName
      },
      { gatewayV2Service, gatewayPoolService }
    );

    // The enrollment path sends `CertificateTemplate:<name>`, so the stored value must be the template name.
    return templates.map((template) => ({
      id: template.name,
      name: template.name
    }));
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
    if (!ca.externalCa || ca.externalCa.type !== CaType.ADCS) {
      throw new BadRequestError({ message: `CA is not a Microsoft ADCS certificate authority [caId=${caId}]` });
    }

    const cert = await certificateDAL.findOne({ caId, serialNumber });
    if (!cert) {
      throw new NotFoundError({
        message: `Certificate not found for revocation [caId=${caId}] [serialNumber=${serialNumber}]`
      });
    }

    const adcsCa = castDbEntryToADCSCertificateAuthority(ca);
    const { credentials, gatewayId, gatewayPoolId } = await getAdcsConnectionCredentials(
      adcsCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );

    // Unlike issuance, revocation is an MS-CSRA (ICertAdminD::RevokeCertificate) operation,
    // so it targets /v1/revoke and requires the connection account to hold Manage CA (Certificate Manager)
    // rights rather than just Enroll. AD CS identifies the certificate by its serial number as plain hex
    // with no leading "0x" — the form it is already stored in — so it is forwarded unchanged.
    await executeAdcsGatewayOperation<AdcsRevokeResult>(
      {
        gatewayId,
        gatewayPoolId,
        credentials,
        endpoint: "/v1/revoke",
        caName: adcsCa.configuration.caName,
        params: { serialNumber, reason: ADCS_CRL_REASON_CODES[reason] }
      },
      { gatewayV2Service, gatewayPoolService }
    );

    logger.info(
      `Microsoft ADCS certificate revocation submitted [caId=${caId}] [certificateId=${cert.id}] [serialNumber=${serialNumber}] [reason=${reason}]`
    );
  };

  return {
    createCertificateAuthority,
    getCertificateAuthority,
    updateCertificateAuthority,
    deleteCertificateAuthority,
    listCertificateAuthorities,
    orderCertificate,
    getCertificateTemplates,
    revokeCertificate
  };
};
