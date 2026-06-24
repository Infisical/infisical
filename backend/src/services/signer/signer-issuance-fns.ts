/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";

import { crypto } from "@app/lib/crypto/cryptography";
import { isPqcAlgorithm } from "@app/lib/crypto/pqc";
import { buildCsrWithExternalSigner } from "@app/lib/csr/build-csr-with-external-signer";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm
} from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "@app/services/certificate-authority/certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import type { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { CertKeySource, HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

type TIssueSignerCertificateDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "encryptWithKmsKey" | "generateKmsKey">;
};

type TVerifyCodeSigningEkuDeps = {
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export const verifyCodeSigningEku = async (
  { certificateBodyDAL, projectDAL, kmsService }: TVerifyCodeSigningEkuDeps,
  { certificateId, projectId, tx }: { certificateId: string; projectId: string; tx?: Knex }
): Promise<void> => {
  const certBody = await certificateBodyDAL.findOne({ certId: certificateId }, tx);
  if (!certBody?.encryptedCertificate) {
    throw new BadRequestError({
      message: "Cannot verify code-signing usage: certificate body is missing."
    });
  }

  const kmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
  const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId });
  const decrypted = await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate });
  const cert = new x509.X509Certificate(decrypted);

  const ekuExtension = cert.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension | undefined;
  const hasCodeSigningEku =
    ekuExtension?.usages?.some(
      (oid) => CertExtendedKeyUsageOIDToName[oid as string] === CertExtendedKeyUsage.CODE_SIGNING
    ) ?? false;

  if (!hasCodeSigningEku) {
    throw new BadRequestError({
      message: "The issued certificate does not have the codeSigning extended key usage set."
    });
  }
};

type TIssueSignerCertificateInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  keyAlgorithm?: CertKeyAlgorithm;
  tx?: Knex;
};

export const issueSignerCertificate = async (
  {
    certificateAuthorityDAL,
    internalCertificateAuthorityService,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService
  }: TIssueSignerCertificateDeps,
  { caId, projectId, commonName, certificateTtlDays, keyAlgorithm, tx }: TIssueSignerCertificateInput
): Promise<{ certificateId: string }> => {
  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
  if (!ca || ca.projectId !== projectId) {
    throw new BadRequestError({
      message: `Certificate authority '${caId}' is not in this project.`
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

  const signResult = await internalCertificateAuthorityService.signCertFromCa({
    isInternal: true,
    isFromProfile: true,
    caId: ca.id,
    csr: csrPem,
    commonName,
    ttl: `${certificateTtlDays}d`,
    extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
    tx
  });

  if (!signResult.certificateId) {
    throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
  }

  await verifyCodeSigningEku(
    { certificateBodyDAL, projectDAL, kmsService },
    { certificateId: signResult.certificateId, projectId: ca.projectId, tx }
  );

  const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });

  const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
  const skLeafPem = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;
  const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
    plainText: Buffer.from(skLeafPem)
  });

  await certificateSecretDAL.create(
    {
      certId: signResult.certificateId,
      encryptedPrivateKey
    },
    tx
  );

  return { certificateId: signResult.certificateId };
};

type THsmBackedDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateDAL: Pick<TCertificateDALFactory, "updateById">;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

type THsmBackedInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  hsmConnectorId: string;
  hsmKeyAlgorithm: HsmKeyAlgorithm;
  tx?: Knex;
};

export const hsmKeyAlgorithmToCertKeyAlgorithm = (hsmAlg: HsmKeyAlgorithm): CertKeyAlgorithm => {
  switch (hsmAlg) {
    case HsmKeyAlgorithm.RSA_2048:
      return CertKeyAlgorithm.RSA_2048;
    case HsmKeyAlgorithm.RSA_4096:
      return CertKeyAlgorithm.RSA_4096;
    case HsmKeyAlgorithm.ECC_P256:
      return CertKeyAlgorithm.ECDSA_P256;
    case HsmKeyAlgorithm.ECC_P384:
      return CertKeyAlgorithm.ECDSA_P384;
    default: {
      const exhaustive: never = hsmAlg;
      throw new BadRequestError({ message: `Unsupported HSM key algorithm: ${exhaustive as string}` });
    }
  }
};

export const mapCertKeyAlgorithmToHsmKeyAlgorithm = (certAlg: string): HsmKeyAlgorithm => {
  switch (certAlg) {
    case CertKeyAlgorithm.RSA_2048:
      return HsmKeyAlgorithm.RSA_2048;
    case CertKeyAlgorithm.RSA_4096:
      return HsmKeyAlgorithm.RSA_4096;
    case CertKeyAlgorithm.ECDSA_P256:
      return HsmKeyAlgorithm.ECC_P256;
    case CertKeyAlgorithm.ECDSA_P384:
      return HsmKeyAlgorithm.ECC_P384;
    default:
      throw new BadRequestError({
        message: `Cannot route HSM renewal: cert keyAlgorithm "${certAlg}" is not supported by the HSM Connector.`
      });
  }
};

export const issueHsmBackedSignerCertificate = async (
  deps: THsmBackedDeps,
  input: THsmBackedInput
): Promise<{ certificateId: string; hsmKeyLabel: string }> => {
  const ca = await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(input.caId);
  if (!ca || ca.projectId !== input.projectId) {
    throw new BadRequestError({
      message: `Certificate authority '${input.caId}' is not in this project.`
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

  const { publicKeySpkiDer, keyLabel } = await deps.hsmConnectorService.generateKeyPair({
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
        mechanism,
        data: tbsBytes,
        isDigest
      })
  });

  const run = async (tx: Knex) => {
    const issued = await deps.internalCertificateAuthorityService.signCertFromCa({
      isInternal: true,
      isFromProfile: true,
      caId: ca.id,
      csr: built.csrPem,
      commonName: input.commonName,
      ttl: `${input.certificateTtlDays}d`,
      extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
      tx
    });
    if (!issued.certificateId) {
      throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
    }
    await verifyCodeSigningEku(
      { certificateBodyDAL: deps.certificateBodyDAL, projectDAL: deps.projectDAL, kmsService: deps.kmsService },
      { certificateId: issued.certificateId, projectId: ca.projectId, tx }
    );
    await deps.certificateDAL.updateById(
      issued.certificateId,
      {
        keySource: CertKeySource.Hsm,
        hsmConnectorId: input.hsmConnectorId,
        hsmKeyLabel: keyLabel,
        hsmPublicKeySpki: publicKeySpkiDer,
        keyAlgorithm: hsmKeyAlgorithmToCertKeyAlgorithm(input.hsmKeyAlgorithm)
      },
      tx
    );
    return issued.certificateId;
  };
  const certificateId = input.tx ? await run(input.tx) : await deps.projectDAL.transaction(run);

  return { certificateId, hsmKeyLabel: keyLabel };
};

type THsmBackedRenewInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  hsmConnectorId: string;
  hsmKeyLabel: string;
  hsmKeyAlgorithm: HsmKeyAlgorithm;
  expectedPublicKeySpkiDer?: Buffer;
  tx?: Knex;
};

type THsmBackedRenewDeps = THsmBackedDeps & {
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign" | "getPublicKey">;
};

export const renewHsmBackedSignerCertificate = async (
  deps: THsmBackedRenewDeps,
  input: THsmBackedRenewInput
): Promise<{ certificateId: string; hsmKeyLabel: string }> => {
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
    keyLabel: input.hsmKeyLabel
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
        mechanism,
        data: tbsBytes,
        isDigest
      })
  });

  const run = async (tx: Knex) => {
    const signResult = await deps.internalCertificateAuthorityService.signCertFromCa({
      isInternal: true,
      isFromProfile: true,
      caId: ca.id,
      csr: built.csrPem,
      commonName: input.commonName,
      ttl: `${input.certificateTtlDays}d`,
      extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
      tx
    });
    if (!signResult.certificateId) {
      throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
    }
    await verifyCodeSigningEku(
      { certificateBodyDAL: deps.certificateBodyDAL, projectDAL: deps.projectDAL, kmsService: deps.kmsService },
      { certificateId: signResult.certificateId, projectId: ca.projectId, tx }
    );
    await deps.certificateDAL.updateById(
      signResult.certificateId,
      {
        keySource: CertKeySource.Hsm,
        hsmConnectorId: input.hsmConnectorId,
        hsmKeyLabel: input.hsmKeyLabel,
        keyAlgorithm: hsmKeyAlgorithmToCertKeyAlgorithm(input.hsmKeyAlgorithm)
      },
      tx
    );
    return signResult.certificateId;
  };
  const certificateId = input.tx ? await run(input.tx) : await deps.projectDAL.transaction(run);

  return { certificateId, hsmKeyLabel: input.hsmKeyLabel };
};
