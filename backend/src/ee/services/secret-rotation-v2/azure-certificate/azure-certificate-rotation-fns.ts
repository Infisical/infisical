/* eslint-disable no-bitwise */
/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import { AxiosError } from "axios";
import * as nodeCrypto from "crypto";

import {
  AzureCertificateInfo,
  CertificateData,
  TAzureCertificateRotationGeneratedCredentials,
  TAzureCertificateRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/azure-certificate/azure-certificate-rotation-types";
import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-certificate";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const EXPIRY_PADDING_IN_DAYS = 3;

type AzureErrorResponse = {
  error: {
    message: string;
    code?: string;
  };
};

type AzureApplicationResponse = {
  keyCredentials: AzureCertificateInfo[];
};

const KEY_USAGE_FLAGS = {
  digitalSignature: x509.KeyUsageFlags.digitalSignature,
  keyEncipherment: x509.KeyUsageFlags.keyEncipherment
};

export const azureCertificateRotationFactory: TRotationFactory<
  TAzureCertificateRotationWithConnection,
  TAzureCertificateRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { objectId, appName, privateKey: providedPrivateKey, distinguishedName, keyAlgorithm = "RSA_2048" },
    secretsMapping,
    rotationInterval
  } = secretRotation;

  const getKeyAlgorithmConfig = (algorithm: string) => {
    switch (algorithm) {
      case "RSA_2048":
        return keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      case "RSA_4096":
        return keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_4096);
      case "ECDSA_P256":
        return keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P256);
      case "ECDSA_P384":
        return keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P384);
      default:
        return keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    }
  };

  const getKeyUsageFlags = (usages: string[]): x509.KeyUsageFlags => {
    return usages.reduce((flags, usage) => {
      const flag = KEY_USAGE_FLAGS[usage as keyof typeof KEY_USAGE_FLAGS];
      return flag ? flags | flag : flags;
    }, 0 as x509.KeyUsageFlags);
  };

  const derToPem = (derBase64: string): string => {
    const lines = derBase64.match(/.{1,64}/g) || [];
    return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
  };

  const generateX509Certificate = async (
    validityDays: number,
    customPrivateKey?: string
  ): Promise<CertificateData & { notAfter: Date; notBefore: Date }> => {
    const alg = getKeyAlgorithmConfig(keyAlgorithm);

    let keys: CryptoKeyPair;
    let privateKeyPem: string;

    if (customPrivateKey) {
      try {
        const keyObject = crypto.nativeCrypto.createPrivateKey(customPrivateKey);
        const publicKeyObject = crypto.nativeCrypto.createPublicKey(keyObject);

        const privateKey = await crypto.nativeCrypto.subtle.importKey(
          "pkcs8",
          keyObject.export({ format: "der", type: "pkcs8" }),
          alg,
          true,
          ["sign"]
        );

        const publicKey = await crypto.nativeCrypto.subtle.importKey(
          "spki",
          publicKeyObject.export({ format: "der", type: "spki" }),
          alg,
          true,
          ["verify"]
        );

        keys = { privateKey, publicKey };
        privateKeyPem = customPrivateKey;
      } catch (error) {
        throw new BadRequestError({
          message: "Invalid private key format. Please provide a valid PEM formatted private key."
        });
      }
    } else {
      keys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const skObj = crypto.nativeCrypto.KeyObject.from(keys.privateKey);
      privateKeyPem = skObj.export({ format: "pem", type: "pkcs8" }) as string;
    }

    const notBefore = new Date();
    notBefore.setSeconds(0, 0);

    const notAfter = new Date(notBefore);
    notAfter.setDate(notBefore.getDate() + validityDays);
    notAfter.setSeconds(0, 0);

    const serialNumber = createSerialNumber();
    const dn = distinguishedName || `CN=Infisical`;
    const keyUsageFlags = getKeyUsageFlags(["digitalSignature", "keyEncipherment"]);

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      name: dn,
      serialNumber,
      notBefore,
      notAfter,
      signingAlgorithm: alg,
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, false),
        new x509.KeyUsagesExtension(keyUsageFlags, true),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
      ]
    });

    const certificateBase64 = Buffer.from(new Uint8Array(cert.rawData)).toString("base64");
    const thumbprint = nodeCrypto.createHash("sha1").update(new Uint8Array(cert.rawData)).digest("base64");

    return {
      publicKey: certificateBase64,
      privateKey: privateKeyPem,
      thumbprint,
      notAfter,
      notBefore
    };
  };

  const generateCertificate = async (): Promise<CertificateData> => {
    const validityDays = rotationInterval * 2 + EXPIRY_PADDING_IN_DAYS;

    if (validityDays > 1095) {
      throw new BadRequestError({
        message: "Certificate validity period exceeds Azure maximum of 3 years (1095 days)"
      });
    }

    const certificate = await generateX509Certificate(validityDays, providedPrivateKey);
    return certificate;
  };

  const getExistingCertificates = async (): Promise<AzureCertificateInfo[]> => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);

    try {
      const { data } = await request.get<AzureApplicationResponse>(
        `${GRAPH_API_BASE}/applications/${objectId}?$select=keyCredentials`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      const certificates: AzureCertificateInfo[] = data.keyCredentials || [];
      return certificates;
    } catch (error) {
      logger.error(error, "Failed to get existing certificates from Azure");
      return [];
    }
  };

  const addCertificateWithPatch = async (certificate: CertificateData): Promise<string> => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${objectId}`;

    if (!certificate.notAfter || !certificate.notBefore) {
      throw new BadRequestError({
        message: "Certificate notAfter and notBefore dates are required"
      });
    }

    const existingCertificates = await getExistingCertificates();

    const keyId = nodeCrypto.randomUUID();
    const now = new Date();
    const formattedDate = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(
      2,
      "0"
    )}-${now.getFullYear()}`;

    const newCertificate = {
      keyId,
      type: "AsymmetricX509Cert",
      usage: "Verify",
      displayName: appName || `Infisical Certificate (${formattedDate})`,
      startDateTime: certificate.notBefore.toISOString(),
      endDateTime: certificate.notAfter.toISOString(),
      key: certificate.publicKey
    };

    const allCertificates = [
      ...existingCertificates.map((cert) => ({
        keyId: cert.keyId,
        type: cert.type,
        usage: cert.usage,
        displayName: cert.displayName,
        startDateTime: cert.startDateTime,
        endDateTime: cert.endDateTime,
        key: cert.key,
        customKeyIdentifier: cert.customKeyIdentifier
      })),
      newCertificate
    ];

    const requestPayload = {
      keyCredentials: allCertificates
    };

    try {
      await request.patch(endpoint, requestPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      return keyId;
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as AzureErrorResponse;
        logger.error(
          {
            objectId,
            existingCount: existingCertificates.length,
            totalCount: allCertificates.length,
            error: errorData.error?.message || "Unknown error",
            code: errorData.error?.code || error.response.status
          },
          "Failed to add certificate to Azure application via PATCH"
        );

        throw new BadRequestError({
          message: `Failed to add certificate to Azure app ${objectId}: ${errorData.error?.message || "Unknown error"} (Code: ${errorData.error?.code || error.response.status})`
        });
      }

      logger.error(error, "Failed to add certificate to Azure application");

      throw new BadRequestError({
        message: `Failed to add certificate to Azure app ${objectId}: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  const removeCertificateById = async (keyIdToRemove: string): Promise<void> => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);

    const existingCertificates = await getExistingCertificates();
    const remainingCertificates = existingCertificates.filter((cert) => cert.keyId !== keyIdToRemove);

    if (remainingCertificates.length === existingCertificates.length) {
      logger.error(
        {
          objectId,
          keyIdToRemove,
          existingKeyIds: existingCertificates.map((cert) => cert.keyId),
          totalExistingCertificates: existingCertificates.length
        },
        "Certificate not found for removal"
      );

      throw new BadRequestError({
        message: `Certificate with keyId ${keyIdToRemove} not found in Azure application`
      });
    }

    const requestPayload = {
      keyCredentials: remainingCertificates.map((cert) => ({
        keyId: cert.keyId,
        type: cert.type,
        usage: cert.usage,
        displayName: cert.displayName,
        startDateTime: cert.startDateTime,
        endDateTime: cert.endDateTime,
        key: cert.key,
        customKeyIdentifier: cert.customKeyIdentifier
      }))
    };

    try {
      await request.patch(`${GRAPH_API_BASE}/applications/${objectId}`, requestPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as AzureErrorResponse;
        logger.error(
          {
            objectId,
            keyIdToRemove,
            error: errorData.error?.message || "Unknown error",
            code: errorData.error?.code || error.response.status
          },
          "Failed to remove certificate from Azure application"
        );

        throw new BadRequestError({
          message: `Failed to remove certificate ${keyIdToRemove}: ${errorData.error?.message || "Unknown error"} (Code: ${errorData.error?.code || error.response.status})`
        });
      }

      logger.error(
        {
          objectId,
          keyIdToRemove,
          error: error instanceof Error ? error.message : "Unknown error"
        },
        "Failed to remove certificate from Azure application"
      );

      throw error;
    }
  };

  const $rotateCertificate = async (
    oldCredentials?: TAzureCertificateRotationGeneratedCredentials[0]
  ): Promise<TAzureCertificateRotationGeneratedCredentials> => {
    try {
      const newCertificate = await generateCertificate();
      const keyId = await addCertificateWithPatch(newCertificate);

      if (oldCredentials?.keyId) {
        try {
          await removeCertificateById(oldCredentials.keyId);
        } catch (error) {
          logger.error(
            {
              objectId,
              oldKeyId: oldCredentials.keyId,
              newKeyId: keyId,
              error: error instanceof Error ? error.message : "Unknown error"
            },
            "Failed to remove old certificate during rotation"
          );
        }
      }

      return [
        {
          publicKey: newCertificate.publicKey,
          privateKey: newCertificate.privateKey,
          keyId
        }
      ];
    } catch (error: unknown) {
      logger.error(
        {
          objectId,
          error: error instanceof Error ? error.message : "Unknown error"
        },
        "Certificate rotation failed"
      );
      throw error;
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TAzureCertificateRotationGeneratedCredentials> = async (
    callback
  ) => {
    const maxValidityDays = rotationInterval * 2 + EXPIRY_PADDING_IN_DAYS;

    if (maxValidityDays > 1095) {
      throw new BadRequestError({
        message: "Azure does not support certificate duration over 3 years (1095 days)"
      });
    }

    const credentials = await $rotateCertificate();
    return callback(credentials[0]);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TAzureCertificateRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    try {
      for (const credential of credentials) {
        if (credential.keyId) {
          await removeCertificateById(credential.keyId);
        }
      }
    } catch (error) {
      logger.error(
        {
          objectId,
          credentialCount: credentials.length,
          error: error instanceof Error ? error.message : "Unknown error"
        },
        "Failed to revoke certificates"
      );
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TAzureCertificateRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    const newCredentials = await $rotateCertificate(oldCredentials);
    return callback(newCredentials[0]);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TAzureCertificateRotationGeneratedCredentials> = (
    credentials
  ) => {
    const certificatePem = derToPem(credentials.publicKey);

    return [
      { key: secretsMapping.publicKey, value: certificatePem },
      { key: secretsMapping.privateKey, value: credentials.privateKey }
    ];
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
