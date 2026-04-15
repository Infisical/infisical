/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import { AxiosError } from "axios";
import RE2 from "re2";

import { TableName } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ProcessedPermissionRules } from "@app/lib/knex/permission-filter-utils";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import {
  authenticateVenafiTpp,
  getVenafiTppHeaders,
  revokeVenafiTppToken
} from "@app/services/app-connection/venafi-tpp/venafi-tpp-connection-fns";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  TAltNameType
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
  TCreateVenafiTppCertificateAuthorityDTO,
  TUpdateVenafiTppCertificateAuthorityDTO,
  TVenafiTppCertificateAuthority
} from "./venafi-tpp-certificate-authority-types";

// -- SAN type codes for Venafi TPP SubjectAltNames --
const VENAFI_SAN_TYPE_DNS = 2;
const VENAFI_SAN_TYPE_IP = 7;
const VENAFI_SAN_TYPE_EMAIL = 1;
const VENAFI_SAN_TYPE_URI = 6;

type TVenafiTppCertificateRequest = {
  PolicyDN: string;
  PKCS10: string;
  ObjectName: string;
  SubjectAltNames?: Array<{ Type: number; Name: string }>;
  Origin?: string;
  CASpecificAttributes?: Array<{ Name: string; Value: string }>;
  WorkToDoTimeout?: number;
  DisableAutomaticRenewal?: boolean;
};

type TVenafiTppRequestResponse = {
  CertificateDN: string;
  Guid: string;
  CertificateData?: string;
  Filename?: string;
  Format?: string;
};

type TVenafiTppRetrieveResponse = {
  CertificateData: string;
  Filename: string;
  Format: string;
};

const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({
      message: `Invalid TTL format: ${ttl}. Expected format like '365d', '24h', or '60m'.`
    });
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "d":
      return value;
    case "h":
      return Math.max(1, Math.ceil(value / 24));
    case "m":
      return Math.max(1, Math.ceil(value / (24 * 60)));
    default:
      return value;
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

const normalizeTppUrl = (tppUrl: string): string => {
  return tppUrl.replace(new RE2("\\/+$"), "");
};

/**
 * Parses a SAN string (e.g., "dns:example.com" or just "example.com") into Venafi TPP SAN format.
 */
const parseSanToVenafiFormat = (san: string): { Type: number; Name: string } | null => {
  const colonIdx = san.indexOf(":");
  if (colonIdx > 0) {
    const prefix = san.substring(0, colonIdx).toLowerCase();
    const value = san.substring(colonIdx + 1);
    switch (prefix) {
      case "dns":
        return { Type: VENAFI_SAN_TYPE_DNS, Name: value };
      case "ip":
        return { Type: VENAFI_SAN_TYPE_IP, Name: value };
      case "email":
        return { Type: VENAFI_SAN_TYPE_EMAIL, Name: value };
      case "uri":
        return { Type: VENAFI_SAN_TYPE_URI, Name: value };
      default:
        return { Type: VENAFI_SAN_TYPE_DNS, Name: san };
    }
  }

  if (san.match(new RE2("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$"))) {
    return { Type: VENAFI_SAN_TYPE_IP, Name: san };
  }

  return { Type: VENAFI_SAN_TYPE_DNS, Name: san };
};

const getVenafiTppConnectionCredentials = async (
  appConnectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    logger.error({ appConnectionId }, "Venafi TPP: App connection not found for credential decryption");
    throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.VenafiTpp) {
    logger.error(
      { appConnectionId, actualApp: appConnection.app },
      "Venafi TPP: App connection is not a Venafi TPP connection"
    );
    throw new BadRequestError({
      message: `Connection with ID '${appConnectionId}' is not a Venafi TPP connection`
    });
  }

  if (!appConnection.encryptedCredentials) {
    logger.error({ appConnectionId }, "Venafi TPP: App connection has no encrypted credentials");
    throw new BadRequestError({ message: "App connection has no stored credentials" });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials,
    projectId: appConnection.projectId
  })) as {
    tppUrl: string;
    clientId: string;
    username: string;
    password: string;
  };

  return credentials;
};

const submitCertificateToTpp = async ({
  baseUrl,
  accessToken,
  policyDN,
  csrPem,
  objectName,
  altNames,
  workToDoTimeout = 30
}: {
  baseUrl: string;
  accessToken: string;
  policyDN: string;
  csrPem: string;
  objectName: string;
  altNames?: string[];
  workToDoTimeout?: number;
}): Promise<TVenafiTppRequestResponse> => {
  const requestBody: TVenafiTppCertificateRequest = {
    PolicyDN: policyDN,
    PKCS10: csrPem,
    ObjectName: objectName,
    Origin: "Infisical",
    DisableAutomaticRenewal: true,
    WorkToDoTimeout: workToDoTimeout
  };

  if (altNames && altNames.length > 0) {
    const venafiSans = altNames.map((san) => parseSanToVenafiFormat(san)).filter(Boolean) as Array<{
      Type: number;
      Name: string;
    }>;
    if (venafiSans.length > 0) {
      requestBody.SubjectAltNames = venafiSans;
    }
  }

  logger.info(
    {
      policyDN,
      objectName,
      sanCount: requestBody.SubjectAltNames?.length ?? 0
    },
    "Venafi TPP: Submitting certificate request"
  );

  const { data, status } = await request.post<TVenafiTppRequestResponse>(
    `${baseUrl}/vedsdk/certificates/request`,
    requestBody,
    {
      headers: getVenafiTppHeaders(accessToken),
      validateStatus: (s) => s === 200 || s === 202
    }
  );

  logger.info(
    {
      certificateDN: data.CertificateDN,
      guid: data.Guid,
      httpStatus: status,
      hasCertificateData: !!data.CertificateData
    },
    "Venafi TPP: Certificate request submitted"
  );

  return data;
};

const retrieveCertificateFromTpp = async ({
  baseUrl,
  accessToken,
  certificateDN,
  includeChain = true
}: {
  baseUrl: string;
  accessToken: string;
  certificateDN: string;
  includeChain?: boolean;
}): Promise<{ certificate: string; chain: string }> => {
  logger.info({ certificateDN, includeChain }, "Venafi TPP: Retrieving certificate");

  const { data, status } = await request.post<TVenafiTppRetrieveResponse>(
    `${baseUrl}/vedsdk/certificates/retrieve`,
    {
      CertificateDN: certificateDN,
      Format: "Base64",
      IncludeChain: includeChain,
      IncludePrivateKey: false,
      RootFirstOrder: false
    },
    {
      headers: getVenafiTppHeaders(accessToken),
      validateStatus: (s) => s === 200 || s === 202
    }
  );

  if (status === 202) {
    logger.info({ certificateDN }, "Venafi TPP: Certificate not yet ready (202 Accepted)");
    throw new BadRequestError({
      message: "Certificate is not yet ready for retrieval. It may still be pending processing or approval."
    });
  }

  if (!data.CertificateData) {
    throw new BadRequestError({ message: "Venafi TPP returned empty certificate data" });
  }

  const decodedData = Buffer.from(data.CertificateData, "base64").toString("utf8");

  const certBlocks = decodedData.match(new RE2("-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----", "g"));

  if (!certBlocks || certBlocks.length === 0) {
    throw new BadRequestError({ message: "Failed to parse certificate data from Venafi TPP response" });
  }

  const leafCert = certBlocks[0];
  const chainCerts = certBlocks.length > 1 ? certBlocks.slice(1).join("\n") : "";

  logger.info(
    {
      certificateDN,
      chainCertCount: certBlocks.length - 1
    },
    "Venafi TPP: Certificate retrieved successfully"
  );

  return {
    certificate: leafCert,
    chain: chainCerts
  };
};

export const castDbEntryToVenafiTppCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TVenafiTppCertificateAuthority & { credentials: Buffer | null | undefined } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed Venafi TPP certificate authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "Venafi TPP app connection ID is missing from certificate authority configuration"
    });
  }

  const configuration = ca.externalCa.configuration as { policyDN?: string } | null;

  if (!configuration?.policyDN) {
    throw new BadRequestError({
      message: "Venafi TPP policy DN is missing from certificate authority configuration"
    });
  }

  return {
    id: ca.id,
    type: CaType.VENAFI_TPP,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      policyDN: configuration.policyDN
    },
    status: ca.status as CaStatus
  };
};

type TVenafiTppCertificateAuthorityFnsDeps = {
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
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById">;
};

export const VenafiTppCertificateAuthorityFns = ({
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
}: TVenafiTppCertificateAuthorityFnsDeps) => {
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
    configuration: TCreateVenafiTppCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { appConnectionId, policyDN } = configuration;
    const appConnection = await appConnectionDAL.findById(appConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
    }

    if (appConnection.app !== AppConnection.VenafiTpp) {
      throw new BadRequestError({
        message: `App connection with ID '${appConnectionId}' is not a Venafi TPP connection`
      });
    }

    await appConnectionService.validateAppConnectionUsageById(
      appConnection.app as AppConnection,
      { connectionId: appConnectionId, projectId },
      actor
    );

    logger.info({ projectId, appConnectionId, policyDN }, "Venafi TPP: Creating certificate authority");

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
            type: CaType.VENAFI_TPP,
            configuration: { policyDN }
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
      throw new BadRequestError({ message: "Failed to create Venafi TPP certificate authority" });
    }

    logger.info({ caId: caEntity.id, projectId }, "Venafi TPP: Certificate authority created successfully");

    return castDbEntryToVenafiTppCertificateAuthority(caEntity);
  };

  const updateCertificateAuthority = async ({
    id,
    configuration,
    actor,
    status,
    name
  }: {
    id: string;
    configuration?: TUpdateVenafiTppCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    status?: CaStatus;
    name?: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);
    if (!ca || !ca.externalCa) {
      throw new NotFoundError({ message: `Certificate authority with ID '${id}' not found` });
    }

    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        if (configuration.appConnectionId) {
          const appConnection = await appConnectionDAL.findById(configuration.appConnectionId);
          if (!appConnection) {
            throw new NotFoundError({
              message: `App connection with ID '${configuration.appConnectionId}' not found`
            });
          }
          if (appConnection.app !== AppConnection.VenafiTpp) {
            throw new BadRequestError({
              message: `App connection with ID '${configuration.appConnectionId}' is not a Venafi TPP connection`
            });
          }

          await appConnectionService.validateAppConnectionUsageById(
            appConnection.app as AppConnection,
            { connectionId: configuration.appConnectionId, projectId: ca.projectId },
            actor
          );
        }

        const existingConfig = (ca.externalCa?.configuration as { policyDN?: string } | null) || {};
        await externalCertificateAuthorityDAL.update(
          { caId: id, type: CaType.VENAFI_TPP },
          {
            ...(configuration.appConnectionId && { appConnectionId: configuration.appConnectionId }),
            configuration: {
              ...existingConfig,
              ...(configuration.policyDN && { policyDN: configuration.policyDN })
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
      throw new BadRequestError({ message: "Failed to update Venafi TPP certificate authority" });
    }

    return castDbEntryToVenafiTppCertificateAuthority(updatedCa);
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
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.VENAFI_TPP
      },
      {},
      permissionFilters
    );

    return cas.map(castDbEntryToVenafiTppCertificateAuthority);
  };

  const orderCertificateFromProfile = async ({
    caId,
    profileId,
    commonName,
    altNames = [],
    keyUsages = [],
    extendedKeyUsages = [],
    validity,
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
    altNames?: string[];
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
    validity: { ttl: string };
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
    if (!ca.externalCa || ca.externalCa.type !== CaType.VENAFI_TPP) {
      logger.error(
        { caId, externalCaType: ca.externalCa?.type },
        "Venafi TPP: CA is not a Venafi TPP certificate authority"
      );
      throw new BadRequestError({ message: "CA is not a Venafi TPP certificate authority" });
    }

    const venafiCa = castDbEntryToVenafiTppCertificateAuthority(ca);
    if (venafiCa.status !== CaStatus.ACTIVE) {
      logger.error({ caId, status: venafiCa.status }, "Venafi TPP: Certificate authority is disabled");
      throw new BadRequestError({ message: "Certificate authority is disabled" });
    }

    logger.info(
      {
        caId,
        profileId,
        commonName,
        policyDN: venafiCa.configuration.policyDN,
        altNameCount: altNames.length
      },
      "Venafi TPP: Starting certificate order from profile"
    );

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const credentials = await getVenafiTppConnectionCredentials(
      venafiCa.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );

    const baseUrl = normalizeTppUrl(credentials.tppUrl);

    let csrPem: string;
    let skLeaf: string | undefined;

    if (csr) {
      csrPem = csr;
      skLeaf = undefined;
      logger.info({ caId, commonName }, "Venafi TPP: Using user-provided CSR");
    } else {
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

      const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
      skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

      const dnParts: string[] = [`CN=${commonName}`];
      if (organization) dnParts.push(`O=${organization}`);
      if (organizationalUnit) dnParts.push(`OU=${organizationalUnit}`);
      if (locality) dnParts.push(`L=${locality}`);
      if (state) dnParts.push(`ST=${state}`);
      if (country) dnParts.push(`C=${country}`);
      const subjectDN = dnParts.join(", ");

      const sanExtensions: x509.SubjectAlternativeNameExtension[] = [];
      if (altNames.length > 0) {
        const sanEntries: Array<{ type: TAltNameType; value: string }> = altNames.map((name) => {
          const colonIdx = name.indexOf(":");
          if (colonIdx > 0) {
            const prefix = name.substring(0, colonIdx).toLowerCase();
            const value = name.substring(colonIdx + 1);
            switch (prefix) {
              case "ip":
                return { type: "ip" as TAltNameType, value };
              case "email":
                return { type: "email" as TAltNameType, value };
              case "uri":
                return { type: "url" as TAltNameType, value };
              default:
                return { type: "dns" as TAltNameType, value: name };
            }
          }
          if (name.match(new RE2("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$"))) {
            return { type: "ip" as TAltNameType, value: name };
          }
          return { type: "dns" as TAltNameType, value: name };
        });

        sanExtensions.push(new x509.SubjectAlternativeNameExtension(sanEntries, false));
      }

      const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
        name: subjectDN,
        keys: leafKeys,
        signingAlgorithm: alg,
        ...(sanExtensions.length > 0 && { extensions: sanExtensions })
      });

      csrPem = csrObj.toString("pem");
    }

    let accessToken: string | undefined;

    try {
      const authResponse = await authenticateVenafiTpp({
        tppUrl: credentials.tppUrl,
        clientId: credentials.clientId,
        username: credentials.username,
        password: credentials.password
      });
      accessToken = authResponse.access_token;

      const requestResponse = await submitCertificateToTpp({
        baseUrl,
        accessToken,
        policyDN: venafiCa.configuration.policyDN,
        csrPem,
        objectName: commonName,
        altNames,
        workToDoTimeout: 60
      });

      let certificateResult: { certificate: string; chain: string } | undefined;

      if (requestResponse.CertificateData) {
        const decodedData = Buffer.from(requestResponse.CertificateData, "base64").toString("utf8");
        const certBlocks = decodedData.match(
          new RE2("-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----", "g")
        );

        if (certBlocks && certBlocks.length > 0) {
          certificateResult = {
            certificate: certBlocks[0],
            chain: certBlocks.length > 1 ? certBlocks.slice(1).join("\n") : ""
          };
        }
      }

      if (!certificateResult) {
        const maxRetries = 10;
        const initialDelay = 3000;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
          try {
            certificateResult = await retrieveCertificateFromTpp({
              baseUrl,
              accessToken,
              certificateDN: requestResponse.CertificateDN,
              includeChain: true
            });
            break;
          } catch (error) {
            lastError = error as Error;
            logger.warn(
              {
                attempt: attempt + 1,
                maxRetries,
                certificateDN: requestResponse.CertificateDN,
                error: (error as Error).message
              },
              "Venafi TPP: Certificate not yet available, retrying"
            );

            if (attempt < maxRetries - 1) {
              const delay = initialDelay * 2 ** attempt;
              await new Promise((resolve) => {
                setTimeout(resolve, Math.min(delay, 30000));
              });
            }
          }
        }

        if (!certificateResult) {
          logger.error(
            {
              caId,
              commonName,
              certificateDN: requestResponse.CertificateDN,
              maxRetries,
              lastError: lastError?.message
            },
            "Venafi TPP: Failed to retrieve certificate after all retry attempts"
          );
          throw new BadRequestError({
            message: `Certificate request submitted to Venafi TPP (DN: ${requestResponse.CertificateDN}) but failed to retrieve after ${maxRetries} attempts. The certificate may still be pending approval or processing. Last error: ${lastError?.message || "Unknown error"}`
          });
        }
      }

      let cleanedCertificatePem = certificateResult.certificate.trim();
      cleanedCertificatePem = cleanedCertificatePem
        .replace(new RE2("\\r\\n", "g"), "\n")
        .replace(new RE2("\\r", "g"), "\n")
        .trim();

      let certObj: x509.X509Certificate;
      try {
        certObj = new x509.X509Certificate(cleanedCertificatePem);
      } catch (error) {
        logger.error(
          {
            caId,
            commonName,
            certPemLength: cleanedCertificatePem.length,
            certPemStart: cleanedCertificatePem.substring(0, 100),
            parseError: error instanceof Error ? error.message : "Unknown error"
          },
          "Venafi TPP: Failed to parse certificate returned from TPP"
        );
        throw new BadRequestError({
          message: `Failed to parse certificate from Venafi TPP: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }

      logger.info(
        {
          serialNumber: certObj.serialNumber,
          subject: certObj.subject,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          caId
        },
        "Venafi TPP: Certificate issued successfully"
      );

      const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
        plainText: Buffer.from(new Uint8Array(certObj.rawData))
      });

      const certificateChainPem = certificateResult.chain || "";

      const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
        plainText: Buffer.from(certificateChainPem)
      });

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
            signatureAlgorithm,
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
            const finalRenewBeforeDays = calculateFinalRenewBeforeDays(undefined, validity.ttl);
            if (finalRenewBeforeDays !== undefined) {
              await certificateDAL.updateById(cert.id, { renewBeforeDays: finalRenewBeforeDays }, tx);
            }
          }
        }
      });

      logger.info(
        {
          certificateId: certificateId!,
          caId,
          commonName,
          serialNumber: certObj.serialNumber
        },
        "Venafi TPP: Certificate stored in database"
      );

      return {
        certificate: cleanedCertificatePem,
        certificateChain: certificateChainPem,
        privateKey: skLeaf || "",
        serialNumber: certObj.serialNumber,
        certificateId: certificateId!,
        ca: venafiCa
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }
      if (error instanceof AxiosError) {
        const statusCode = error.response?.status;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const responseData = error.response?.data;

        logger.error(
          {
            statusCode,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            responseData,
            caId,
            commonName
          },
          "Venafi TPP: Failed to issue certificate"
        );

        throw new BadRequestError({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          message: `Venafi TPP certificate issuance failed: ${responseData?.Error || error.message}`
        });
      }
      logger.error(error, "Venafi TPP: Unexpected error during certificate issuance");
      throw new BadRequestError({
        message: `Venafi TPP certificate issuance failed: ${(error as Error)?.message || "Unknown error"}`
      });
    } finally {
      if (accessToken) {
        await revokeVenafiTppToken(baseUrl, accessToken);
      }
    }
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderCertificateFromProfile
  };
};
