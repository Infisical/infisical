import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { isCertChainValid } from "@app/services/certificate/certificate-fns";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TCaSigner } from "@app/services/certificate-authority/ca-signer";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { getCaCertChains, getCaSigner } from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

const RA_CERT_VALIDITY_YEARS = 10;

// PKCS#9 challengePassword attribute OID.
const CHALLENGE_PASSWORD_OID = "1.2.840.113549.1.9.7";

// @peculiar/x509 returns the challengePassword as a DER-encoded ASN.1 string; strip the tag and length
// prefix (short- and long-form) to recover the UTF-8 value.
export const decodeAsn1ChallengePasswordValue = (raw: ArrayBuffer | Uint8Array | string): string => {
  if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
    const buf = Buffer.from(raw);
    let offset = 1; // skip the ASN.1 tag byte
    // eslint-disable-next-line no-bitwise
    if (buf[offset] & 0x80) {
      // Long-form length: the low 7 bits give the count of subsequent length bytes.
      // eslint-disable-next-line no-bitwise
      const numLenBytes = buf[offset] & 0x7f;
      offset += 1 + numLenBytes;
    } else {
      offset += 1;
    }
    return buf.subarray(offset).toString("utf-8");
  }
  if (typeof raw === "string") return raw;
  return String(raw);
};

export const extractScepChallengePassword = (csrObj: x509.Pkcs10CertificateRequest): string => {
  const challengeAttr = csrObj.attributes.find((attr) => attr.type === CHALLENGE_PASSWORD_OID);
  if (!challengeAttr?.values?.length) return "";
  return decodeAsn1ChallengePasswordValue(challengeAttr.values[0] as unknown as ArrayBuffer | Uint8Array | string);
};

const buildRaCertificate = async (
  slug: string,
  issuer?: { signer: TCaSigner; caCertificate: x509.X509Certificate }
): Promise<{
  privateKeyDer: ArrayBuffer;
  certificatePem: string;
  expiresAt: Date;
}> => {
  const keyPair = await crypto.nativeCrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );

  const now = new Date();
  const notAfter = new Date(now);
  notAfter.setFullYear(notAfter.getFullYear() + RA_CERT_VALIDITY_YEARS);
  const serialNumber = crypto.randomBytes(16).toString("hex");
  const subjectName = `CN=Infisical SCEP RA - ${slug}`;

  let cert: x509.X509Certificate;
  if (issuer) {
    cert = await issuer.signer.createCertificate({
      serialNumber,
      subject: subjectName,
      issuer: issuer.caCertificate.subject,
      notBefore: now,
      notAfter,
      publicKey: keyPair.publicKey,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
        new x509.BasicConstraintsExtension(false, undefined, true),
        await x509.AuthorityKeyIdentifierExtension.create(issuer.caCertificate, false),
        await x509.SubjectKeyIdentifierExtension.create(keyPair.publicKey)
      ]
    });
  } else {
    cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber,
      name: subjectName,
      notBefore: now,
      notAfter,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      keys: keyPair,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
        new x509.BasicConstraintsExtension(false, undefined, true)
      ]
    });
  }

  const privateKeyDer = await crypto.nativeCrypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    privateKeyDer,
    certificatePem: cert.toString("pem"),
    expiresAt: notAfter
  };
};

type TGenerateScepRaCertificateDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Parameters<typeof getCaCertChains>[0]["kmsService"] &
    Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey">;
  hsmConnectorService: THsmConnectorServiceFactory;
};

// Whether Infisical can CA-sign the SCEP RA for a CA type so it chains to the CA (RFC 8894).
export const SCEP_RA_CA_SIGNING_SUPPORTED_BY_CA_TYPE: Record<CaType, boolean> = {
  [CaType.INTERNAL]: true,
  [CaType.AWS_PCA]: false,
  [CaType.ADCS]: false,
  [CaType.AZURE_AD_CS]: false,
  [CaType.VENAFI_TPP]: false,
  [CaType.ACME]: false,
  [CaType.DIGICERT]: false,
  [CaType.GODADDY]: false,
  [CaType.AWS_ACM_PUBLIC_CA]: false
};

export const isScepRaCaSigningSupported = (caType: CaType): boolean =>
  SCEP_RA_CA_SIGNING_SUPPORTED_BY_CA_TYPE[caType] ?? false;

export const resolveScepRaSigning = async ({
  caId,
  requestedSignRaWithCa,
  certificateAuthorityDAL
}: {
  caId?: string | null;
  requestedSignRaWithCa?: boolean;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
}): Promise<{ signRaWithCa: boolean; raCaSigningSupported: boolean; caType: CaType }> => {
  const ca = caId ? await certificateAuthorityDAL.findByIdWithAssociatedCa(caId) : null;
  const caType = (ca?.externalCa?.type as CaType) ?? CaType.INTERNAL;
  const raCaSigningSupported = isScepRaCaSigningSupported(caType);
  if (requestedSignRaWithCa === true && !raCaSigningSupported) {
    throw new BadRequestError({
      message: `CA-signed SCEP RA certificates are not supported for '${caType}' certificate authorities.`
    });
  }
  return { signRaWithCa: requestedSignRaWithCa ?? false, raCaSigningSupported, caType };
};

const buildCaSignedRaCertificate = async (slug: string, caId: string, deps: TGenerateScepRaCertificateDeps) => {
  const { signer } = await getCaSigner({
    caId,
    certificateAuthorityDAL: deps.certificateAuthorityDAL,
    certificateAuthoritySecretDAL: deps.certificateAuthoritySecretDAL,
    projectDAL: deps.projectDAL,
    kmsService: deps.kmsService,
    hsmConnectorService: deps.hsmConnectorService
  });

  const chains = await getCaCertChains({
    caId,
    certificateAuthorityDAL: deps.certificateAuthorityDAL,
    certificateAuthorityCertDAL: deps.certificateAuthorityCertDAL,
    projectDAL: deps.projectDAL,
    kmsService: deps.kmsService
  });
  const activeChain = chains[chains.length - 1];
  if (!activeChain) {
    throw new BadRequestError({ message: "Certificate Authority has no active certificate to sign the SCEP RA cert" });
  }
  const caCertificate = new x509.X509Certificate(activeChain.certificate);

  return buildRaCertificate(slug, { signer, caCertificate });
};

const generateScepRaCertificate = async ({
  slug,
  caId,
  signRaWithCa,
  deps
}: {
  slug: string;
  caId?: string | null;
  signRaWithCa: boolean;
  deps: TGenerateScepRaCertificateDeps;
}) => {
  if (!caId || !signRaWithCa) {
    return buildRaCertificate(slug);
  }

  const ca = await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
  const caType = (ca?.externalCa?.type as CaType) ?? CaType.INTERNAL;
  if (!isScepRaCaSigningSupported(caType)) {
    logger.warn(
      `SCEP RA CA-signing requested for unsupported CA type '${caType}'; using a self-signed RA [caId=${caId}]`
    );
    return buildRaCertificate(slug);
  }

  return buildCaSignedRaCertificate(slug, caId, deps);
};

export const generateAndEncryptScepRaCertificate = async ({
  slug,
  caId,
  signRaWithCa,
  projectId,
  deps
}: {
  slug: string;
  caId?: string | null;
  signRaWithCa: boolean;
  projectId: string;
  deps: TGenerateScepRaCertificateDeps;
}): Promise<{ certificatePem: string; expiresAt: Date; encryptedPrivateKey: Buffer }> => {
  const raCert = await generateScepRaCertificate({ slug, caId, signRaWithCa, deps });

  const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
    projectId,
    projectDAL: deps.projectDAL,
    kmsService: deps.kmsService
  });
  const kmsEncryptor = await deps.kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
  const { cipherTextBlob } = await kmsEncryptor({ plainText: Buffer.from(raCert.privateKeyDer) });

  return { certificatePem: raCert.certificatePem, expiresAt: raCert.expiresAt, encryptedPrivateKey: cipherTextBlob };
};

export const isSignerCertIssuedByCa = async ({
  signerCertDer,
  signerCert: providedSignerCert,
  caId,
  certificateDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityDAL,
  projectDAL,
  kmsService
}: {
  signerCertDer: Buffer;
  signerCert?: x509.X509Certificate;
  caId: string;
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "transaction">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
}): Promise<boolean> => {
  try {
    const signerCert = providedSignerCert ?? new x509.X509Certificate(signerCertDer);

    if (new Date() > signerCert.notAfter) {
      return false;
    }

    const caCertChains = await getCaCertChains({
      caId,
      certificateAuthorityCertDAL,
      certificateAuthorityDAL,
      projectDAL,
      kmsService
    });

    const verifiedChains = await Promise.all(
      caCertChains.map(async (chain) => {
        const caCert = new x509.X509Certificate(chain.certificate);
        const chainCerts = chain.certificateChain
          ? extractX509CertFromChain(chain.certificateChain).map((c) => new x509.X509Certificate(c))
          : [];
        return isCertChainValid([signerCert, caCert, ...chainCerts]);
      })
    );

    const isChainValid = verifiedChains.some(Boolean);
    if (!isChainValid) {
      return false;
    }

    // Check if the certificate has been revoked in the database
    // Use transaction to read from primary DB (not replica) since this is a security-critical check
    const isRevoked = await certificateDAL.transaction(async (tx) => {
      const storedCert = await certificateDAL.findOne(
        {
          serialNumber: signerCert.serialNumber,
          caId
        },
        tx
      );
      return storedCert?.status === CertStatus.REVOKED;
    });

    if (isRevoked) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export enum ScepRenewalDenyReason {
  InvalidSigner = "invalid-signer",
  WrongProfile = "wrong-profile",
  IdentityMismatch = "identity-mismatch"
}

export type TScepRenewalAuthResult = { authorized: true } | { authorized: false; reason: ScepRenewalDenyReason };

const DN_WHITESPACE_RE = new RE2("\\s+", "g");

const normalizeX500Name = (name: x509.Name): string => {
  const rdns = name.toJSON();

  const canonicalRdns = rdns.map((rdn) => {
    const pairs: string[] = [];
    for (const [type, values] of Object.entries(rdn)) {
      const normalizedType = type.toLowerCase();
      for (const value of values) {
        const normalizedValue = value.normalize("NFC").replace(DN_WHITESPACE_RE, " ").trim().toLowerCase();
        pairs.push(`${normalizedType}=${normalizedValue}`);
      }
    }
    return pairs.sort().join("+");
  });

  return canonicalRdns.join(",");
};

// SANs are an unordered set in RFC 5280; normalize each entry and sort for comparison.
const normalizeSubjectAltNames = (ext: x509.SubjectAlternativeNameExtension | null | undefined): string => {
  if (!ext) return "";
  const pairs: string[] = [];
  for (const item of ext.names.items) {
    const type = String(item.type).toLowerCase();
    const raw = String(item.value).normalize("NFC").trim();
    const value = type === "dns" ? raw.toLowerCase() : raw;
    pairs.push(`${type}:${value}`);
  }
  return pairs.sort().join(",");
};

export const evaluateScepRenewalAuthorization = ({
  isValidSigner,
  storedSignerCert,
  profileId,
  csrSubjectName,
  signerCertSubjectName,
  csrSubjectAltNames,
  signerCertSubjectAltNames
}: {
  isValidSigner: boolean;
  storedSignerCert?: { profileId?: string | null } | null;
  profileId: string;
  csrSubjectName: x509.Name;
  signerCertSubjectName: x509.Name;
  csrSubjectAltNames?: x509.SubjectAlternativeNameExtension | null;
  signerCertSubjectAltNames?: x509.SubjectAlternativeNameExtension | null;
}): TScepRenewalAuthResult => {
  if (!isValidSigner) {
    return { authorized: false, reason: ScepRenewalDenyReason.InvalidSigner };
  }

  if (!storedSignerCert || storedSignerCert.profileId !== profileId) {
    return { authorized: false, reason: ScepRenewalDenyReason.WrongProfile };
  }

  if (
    normalizeX500Name(csrSubjectName) !== normalizeX500Name(signerCertSubjectName) ||
    normalizeSubjectAltNames(csrSubjectAltNames) !== normalizeSubjectAltNames(signerCertSubjectAltNames)
  ) {
    return { authorized: false, reason: ScepRenewalDenyReason.IdentityMismatch };
  }

  return { authorized: true };
};

export const getScepCapabilities = ({ allowCertBasedRenewal }: { allowCertBasedRenewal: boolean }): string => {
  const caps = ["POSTPKIOperation", "SHA-256", "SHA-1", "AES", "DES3", "SCEPStandard"];
  if (allowCertBasedRenewal) {
    caps.push("Renewal");
  }
  return caps.join("\n");
};
