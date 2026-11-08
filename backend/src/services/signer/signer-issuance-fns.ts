/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";

import { TCertificates } from "@app/db/schemas";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { crypto } from "@app/lib/crypto/cryptography";
import { isPqcAlgorithm } from "@app/lib/crypto/pqc";
import { buildCsrWithExternalSigner } from "@app/lib/csr/build-csr-with-external-signer";
import { BadRequestError } from "@app/lib/errors";
import { isPkcs11Error, Pkcs11ErrorCode } from "@app/lib/gateway-v2/pkcs11-rpc";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "@app/services/certificate-authority/certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm
} from "@app/services/certificate/certificate-types";
import { certKeyAlgorithmToHsmKeyAlgorithm } from "@app/services/hsm-connector/hsm-connector-fns";
import type { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { CertKeySource, HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

type TIssueSignerCertificateDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsCoreDomain: TKmsCoreDomain;
};

type TVerifyCodeSigningEkuDeps = {
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  kmsCoreDomain: TKmsCoreDomain;
};

const codeSigningEkuMissing = () =>
  new BadRequestError({
    message: "The issued certificate does not have the codeSigning extended key usage set."
  });

// Checked on the row signCertFromCa writes, inside its transaction: the stored usages are the ones it put in the
// certificate's extension, so no decrypt is needed.
const assertIssuedWithCodeSigningEku = (cert: TCertificates) => {
  if (!cert.extendedKeyUsages?.includes(CertExtendedKeyUsage.CODE_SIGNING)) throw codeSigningEkuMissing();
};

export const verifyCodeSigningEku = async (
  { certificateBodyDAL, kmsCoreDomain }: TVerifyCodeSigningEkuDeps,
  { certificateId, projectId }: { certificateId: string; projectId: string }
): Promise<void> => {
  const certBody = await certificateBodyDAL.findOne({ certId: certificateId });
  if (!certBody?.encryptedCertificate) {
    throw new BadRequestError({
      message: "Cannot verify code-signing usage: certificate body is missing."
    });
  }

  const kmsId = await kmsCoreDomain.getProjectCertificateKmsKeyId(projectId);
  const kmsDecryptor = await kmsCoreDomain.decryptWithKmsKey({ kmsId });
  const decrypted = await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate });
  const cert = new x509.X509Certificate(decrypted);

  const ekuExtension = cert.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension | undefined;
  const hasCodeSigningEku =
    ekuExtension?.usages?.some(
      (oid) => CertExtendedKeyUsageOIDToName[oid as string] === CertExtendedKeyUsage.CODE_SIGNING
    ) ?? false;

  if (!hasCodeSigningEku) throw codeSigningEkuMissing();
};

type TIssueSignerCertificateInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  keyAlgorithm?: CertKeyAlgorithm;
};

export const issueSignerCertificate = async (
  {
    certificateAuthorityDAL,
    internalCertificateAuthorityService,
    certificateSecretDAL,
    kmsCoreDomain
  }: TIssueSignerCertificateDeps,
  { caId, projectId, commonName, certificateTtlDays, keyAlgorithm }: TIssueSignerCertificateInput
): Promise<{ certificateId: string }> => {
  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
  if (!ca || ca.projectId !== projectId) {
    throw new BadRequestError({
      message: `Certificate authority '${caId}' is not in this organization.`
    });
  }
  if (ca.status !== CaStatus.ACTIVE) {
    throw new BadRequestError({ message: "The selected certificate authority is not active." });
  }
  if (!ca.internalCa?.id) {
    throw new BadRequestError({
      message: "Internal CA record is missing its internal-CA association; cannot issue a signer certificate from it."
    });
  }

  const caKeyAlgorithm = ca.internalCa.keyAlgorithm as CertKeyAlgorithm;
  if (isPqcAlgorithm(caKeyAlgorithm)) {
    throw new BadRequestError({
      message: "PQC certificate authorities cannot back code signers in this version."
    });
  }

  const leafKeyAlgorithm = keyAlgorithm ?? CertKeyAlgorithm.RSA_2048;
  if (isPqcAlgorithm(leafKeyAlgorithm)) {
    throw new BadRequestError({
      message: "PQC leaf key algorithms are not supported for code signers in this version."
    });
  }
  const alg = keyAlgorithmToAlgCfg(leafKeyAlgorithm);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg as any, true, ["sign", "verify"]);

  const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
    name: [{ CN: [commonName] }],
    keys: leafKeys,
    signingAlgorithm: alg,
    extensions: [
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment
      )
    ]
  });
  const csrPem = csrObj.toString("pem");

  // Encrypted before signing, so the key is stored in the same transaction as the certificate.
  const certificateManagerKmsId = await kmsCoreDomain.getProjectCertificateKmsKeyId(ca.projectId);
  const kmsEncryptor = await kmsCoreDomain.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
  const skLeafPem = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey).export({
    format: "pem",
    type: "pkcs8"
  }) as string;
  const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({ plainText: Buffer.from(skLeafPem) });

  const signResult = await internalCertificateAuthorityService.signCertFromCa({
    isInternal: true,
    isFromProfile: true,
    caId: ca.id,
    csr: csrPem,
    commonName,
    ttl: `${certificateTtlDays}d`,
    extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
    onPersisted: async (newCert, tx) => {
      assertIssuedWithCodeSigningEku(newCert);
      await certificateSecretDAL.create({ certId: newCert.id, encryptedPrivateKey }, tx);
    }
  });

  if (!signResult.certificateId) {
    throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
  }

  return { certificateId: signResult.certificateId };
};

type THsmBackedDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateDAL: Pick<TCertificateDALFactory, "updateById">;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign">;
};

type THsmBackedInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  hsmConnectorId: string;
  hsmKeyAlgorithm: HsmKeyAlgorithm;
};

export const hsmKeyAlgorithmToCertKeyAlgorithm = (hsmAlg: HsmKeyAlgorithm): CertKeyAlgorithm => {
  switch (hsmAlg) {
    case HsmKeyAlgorithm.RSA_2048:
      return CertKeyAlgorithm.RSA_2048;
    case HsmKeyAlgorithm.RSA_3072:
      return CertKeyAlgorithm.RSA_3072;
    case HsmKeyAlgorithm.RSA_4096:
      return CertKeyAlgorithm.RSA_4096;
    case HsmKeyAlgorithm.ECC_P256:
      return CertKeyAlgorithm.ECDSA_P256;
    case HsmKeyAlgorithm.ECC_P384:
      return CertKeyAlgorithm.ECDSA_P384;
    case HsmKeyAlgorithm.ML_DSA_44:
      return CertKeyAlgorithm.ML_DSA_44;
    case HsmKeyAlgorithm.ML_DSA_65:
      return CertKeyAlgorithm.ML_DSA_65;
    case HsmKeyAlgorithm.ML_DSA_87:
      return CertKeyAlgorithm.ML_DSA_87;
    default: {
      const exhaustive: never = hsmAlg;
      throw new BadRequestError({ message: `Unsupported HSM key algorithm: ${exhaustive as string}` });
    }
  }
};

export const mapCertKeyAlgorithmToHsmKeyAlgorithm = (certAlg: string): HsmKeyAlgorithm => {
  const hsmKeyAlgorithm = isPqcAlgorithm(certAlg) ? undefined : certKeyAlgorithmToHsmKeyAlgorithm(certAlg);
  if (!hsmKeyAlgorithm) {
    throw new BadRequestError({
      message: `Cannot route HSM renewal: cert keyAlgorithm "${certAlg}" is not supported by the HSM Connector.`
    });
  }
  return hsmKeyAlgorithm;
};

export const issueHsmBackedSignerCertificate = async (
  deps: THsmBackedDeps,
  input: THsmBackedInput
): Promise<{ certificateId: string; hsmKeyLabel: string; hsmKeyId: string | null }> => {
  const ca = await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(input.caId);
  if (!ca || ca.projectId !== input.projectId) {
    throw new BadRequestError({
      message: `Certificate authority '${input.caId}' is not in this organization.`
    });
  }
  if (ca.status !== CaStatus.ACTIVE) {
    throw new BadRequestError({ message: "The selected certificate authority is not active." });
  }
  if (!ca.internalCa?.id) {
    throw new BadRequestError({
      message: "Internal CA record is missing its internal-CA association; cannot issue a signer certificate from it."
    });
  }

  const keyLabelSuffix = `signer-${crypto.nativeCrypto.randomUUID()}`;

  const { publicKeySpkiDer, keyLabel, keyId } = await deps.hsmConnectorService.generateKeyPair({
    connectorId: input.hsmConnectorId,
    projectId: input.projectId,
    keyLabel: keyLabelSuffix,
    keyAlgorithm: input.hsmKeyAlgorithm
  });
  const built = await buildCsrWithExternalSigner({
    publicKeySpkiDer,
    keyAlgorithm: input.hsmKeyAlgorithm,
    subjectCommonName: input.commonName,
    signCallback: async (tbsBytes, mechanism, isDigest) =>
      deps.hsmConnectorService.sign({
        connectorId: input.hsmConnectorId,
        projectId: input.projectId,
        keyLabel,
        keyId,
        publicKeySpki: publicKeySpkiDer,
        mechanism,
        data: tbsBytes,
        isDigest
      })
  });

  const issued = await deps.internalCertificateAuthorityService.signCertFromCa({
    isInternal: true,
    isFromProfile: true,
    caId: ca.id,
    csr: built.csrPem,
    commonName: input.commonName,
    ttl: `${input.certificateTtlDays}d`,
    extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
    onPersisted: async (newCert, tx) => {
      assertIssuedWithCodeSigningEku(newCert);
      await deps.certificateDAL.updateById(
        newCert.id,
        {
          keySource: CertKeySource.Hsm,
          hsmConnectorId: input.hsmConnectorId,
          hsmKeyLabel: keyLabel,
          hsmKeyId: keyId,
          hsmPublicKeySpki: publicKeySpkiDer,
          keyAlgorithm: hsmKeyAlgorithmToCertKeyAlgorithm(input.hsmKeyAlgorithm)
        },
        tx
      );
    }
  });
  if (!issued.certificateId) {
    throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
  }

  return { certificateId: issued.certificateId, hsmKeyLabel: keyLabel, hsmKeyId: keyId };
};

type THsmBackedRenewInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  hsmConnectorId: string;
  hsmKeyLabel: string;
  hsmKeyId?: string | null;
  hsmKeyAlgorithm: HsmKeyAlgorithm;
  expectedPublicKeySpkiDer?: Buffer;
};

type THsmBackedRenewDeps = THsmBackedDeps & {
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign" | "getPublicKey">;
};

export const renewHsmBackedSignerCertificate = async (
  deps: THsmBackedRenewDeps,
  input: THsmBackedRenewInput
): Promise<{ certificateId: string; hsmKeyLabel: string; hsmKeyId: string | null }> => {
  const ca = await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(input.caId);
  if (!ca || ca.projectId !== input.projectId) {
    throw new BadRequestError({ message: `Certificate authority '${input.caId}' was not found.` });
  }
  if (ca.status !== CaStatus.ACTIVE) {
    throw new BadRequestError({ message: "The selected certificate authority is not active." });
  }
  if (!ca.internalCa?.id) {
    throw new BadRequestError({
      message: "Internal CA record is missing its internal-CA association; cannot renew a signer certificate from it."
    });
  }

  const publicKeySpkiDer = await deps.hsmConnectorService.getPublicKey({
    connectorId: input.hsmConnectorId,
    projectId: input.projectId,
    keyLabel: input.hsmKeyLabel,
    keyId: input.hsmKeyId
  });
  if (input.expectedPublicKeySpkiDer) {
    const stored = input.expectedPublicKeySpkiDer;
    if (stored.length !== publicKeySpkiDer.length || !stored.equals(publicKeySpkiDer)) {
      throw new BadRequestError({
        message:
          "HSM returned a different public key for the recorded key label. This typically means the key was deleted and recreated under the same label on the HSM, or the HSM Connector now routes to a different HSM. Renewal aborted: verify the key label on the HSM and the Connector's routing."
      });
    }
  }
  const built = await buildCsrWithExternalSigner({
    publicKeySpkiDer,
    keyAlgorithm: input.hsmKeyAlgorithm,
    subjectCommonName: input.commonName,
    signCallback: async (tbsBytes, mechanism, isDigest) =>
      deps.hsmConnectorService.sign({
        connectorId: input.hsmConnectorId,
        projectId: input.projectId,
        keyLabel: input.hsmKeyLabel,
        keyId: input.hsmKeyId,
        publicKeySpki: publicKeySpkiDer,
        mechanism,
        data: tbsBytes,
        isDigest
      })
  });

  const signResult = await deps.internalCertificateAuthorityService.signCertFromCa({
    isInternal: true,
    isFromProfile: true,
    caId: ca.id,
    csr: built.csrPem,
    commonName: input.commonName,
    ttl: `${input.certificateTtlDays}d`,
    extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
    onPersisted: async (newCert, tx) => {
      assertIssuedWithCodeSigningEku(newCert);
      await deps.certificateDAL.updateById(
        newCert.id,
        {
          keySource: CertKeySource.Hsm,
          hsmConnectorId: input.hsmConnectorId,
          hsmKeyLabel: input.hsmKeyLabel,
          hsmKeyId: input.hsmKeyId ?? null,
          hsmPublicKeySpki: publicKeySpkiDer,
          keyAlgorithm: hsmKeyAlgorithmToCertKeyAlgorithm(input.hsmKeyAlgorithm)
        },
        tx
      );
    }
  });
  if (!signResult.certificateId) {
    throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
  }

  return { certificateId: signResult.certificateId, hsmKeyLabel: input.hsmKeyLabel, hsmKeyId: input.hsmKeyId ?? null };
};

const PUBLIC_KEY_PRECHECK_FALLBACK_CODES = [
  Pkcs11ErrorCode.KeyNotFound,
  Pkcs11ErrorCode.MechanismInvalid,
  Pkcs11ErrorCode.Internal
];

export const assertHsmKeyMatchesCertificate = async (
  deps: { hsmConnectorService: Pick<THsmConnectorServiceFactory, "signWithKeyId" | "getPublicKey"> },
  input: {
    hsmConnectorId: string;
    projectId: string;
    hsmKeyLabel: string;
    hsmKeyId?: string | null;
    certificate: x509.X509Certificate;
  }
): Promise<{ hsmKeyId: string | null }> => {
  const keyMismatchError = () =>
    new BadRequestError({
      message: input.hsmKeyId
        ? `The HSM key with the label '${input.hsmKeyLabel}' and key ID '${input.hsmKeyId}' does not match the certificate's public key. Select the private key the certificate was issued for.`
        : `The HSM key labeled '${input.hsmKeyLabel}' does not match the certificate's public key. Check that the label points to the private key the certificate was issued for.`
    });

  const keyRejectedError = () =>
    new BadRequestError({
      message: `The HSM rejected the key labeled '${input.hsmKeyLabel}'. Check that exactly one private key in the HSM Connector's slot has this label.`
    });

  const publicKey = crypto.nativeCrypto.createPublicKey({
    key: Buffer.from(input.certificate.publicKey.rawData),
    format: "der",
    type: "spki"
  });
  const isEcdsa = publicKey.asymmetricKeyType === "ec";
  if (!isEcdsa && publicKey.asymmetricKeyType !== "rsa") {
    throw new BadRequestError({
      message: `The certificate uses an unsupported key type '${publicKey.asymmetricKeyType}'. Only RSA and ECDSA keys are supported.`
    });
  }

  const hsmPublicKey = await deps.hsmConnectorService
    .getPublicKey({
      connectorId: input.hsmConnectorId,
      projectId: input.projectId,
      keyLabel: input.hsmKeyLabel,
      keyId: input.hsmKeyId
    })
    .then((spki) => crypto.nativeCrypto.createPublicKey({ key: spki, format: "der", type: "spki" }))
    .catch((err: unknown) => {
      if (PUBLIC_KEY_PRECHECK_FALLBACK_CODES.some((code) => isPkcs11Error(err, code))) return null;
      if (isPkcs11Error(err, Pkcs11ErrorCode.BadRequest)) throw keyRejectedError();
      throw err;
    });
  if (hsmPublicKey && !hsmPublicKey.equals(publicKey)) {
    throw keyMismatchError();
  }

  const challenge = crypto.randomBytes(32);
  const signed = await deps.hsmConnectorService
    .signWithKeyId({
      connectorId: input.hsmConnectorId,
      projectId: input.projectId,
      keyLabel: input.hsmKeyLabel,
      keyId: input.hsmKeyId,
      publicKeySpki: Buffer.from(input.certificate.publicKey.rawData),
      mechanism: isEcdsa ? "CKM_ECDSA_SHA256" : "CKM_SHA256_RSA_PKCS",
      data: challenge,
      isDigest: false
    })
    .catch((err: unknown) => {
      if (isPkcs11Error(err, Pkcs11ErrorCode.KeyTypeMismatch)) {
        throw keyMismatchError();
      }
      if (isPkcs11Error(err, Pkcs11ErrorCode.BadRequest)) {
        throw keyRejectedError();
      }
      throw err;
    });

  const isMatch = crypto.nativeCrypto.verify(
    "sha256",
    challenge,
    isEcdsa ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey,
    signed.signature
  );
  if (!isMatch) {
    throw keyMismatchError();
  }
  return { hsmKeyId: signed.keyId };
};
