import * as x509 from "@peculiar/x509";

import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { crypto } from "@app/lib/crypto/cryptography";
import { isCertChainValid } from "@app/services/certificate/certificate-fns";
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
  caId,
  certificateAuthorityCertDAL,
  certificateAuthorityDAL,
  projectDAL,
  kmsService
}: {
  signerCertDer: Buffer;
  caId: string;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
}): Promise<boolean> => {
  try {
    const signerCert = new x509.X509Certificate(signerCertDer);

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

    return verifiedChains.some(Boolean);
  } catch {
    return false;
  }
};

export const getScepCapabilities = ({ allowCertBasedRenewal }: { allowCertBasedRenewal: boolean }): string => {
  const caps = ["POSTPKIOperation", "SHA-256", "SHA-1", "AES", "DES3", "SCEPStandard"];
  if (allowCertBasedRenewal) {
    caps.push("Renewal");
  }
  return caps.join("\n");
};
