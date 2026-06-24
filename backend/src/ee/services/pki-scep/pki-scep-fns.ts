import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { crypto } from "@app/lib/crypto/cryptography";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { isCertChainValid } from "@app/services/certificate/certificate-fns";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaCertChains } from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

const RA_CERT_VALIDITY_YEARS = 10;

export const generateRaCertificate = async (
  slug: string
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

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomBytes(16).toString("hex"),
    name: `CN=Infisical SCEP RA - ${slug}`,
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

  const privateKeyDer = await crypto.nativeCrypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    privateKeyDer,
    certificatePem: cert.toString("pem"),
    expiresAt: notAfter
  };
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
