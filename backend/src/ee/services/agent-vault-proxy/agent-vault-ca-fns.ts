import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  getNotAfterWithClockSkew,
  getNotBeforeWithClockSkew,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";

export type TParsedRootCa = {
  fingerprint: string;
  expiresAt: Date;
};

export type TGeneratedRootCa = TParsedRootCa & {
  certificate: string;
  privateKey: string;
};

const MAX_ROOT_CA_PEM_LENGTH = 16384;
const GENERATED_ROOT_CA_VALIDITY_YEARS = 10;
export const parseRootCaCertificate = (pem: string): TParsedRootCa => {
  if (pem.length > MAX_ROOT_CA_PEM_LENGTH) {
    throw new BadRequestError({ message: "The certificate authority is too large to be a valid CA certificate" });
  }

  let certificate: x509.X509Certificate;
  try {
    certificate = new x509.X509Certificate(pem);
  } catch {
    throw new BadRequestError({
      message: "The certificate authority is not a valid PEM certificate. Send the proxy's ca.crt exactly as written."
    });
  }

  const basicConstraints = certificate.getExtension(x509.BasicConstraintsExtension);
  if (!basicConstraints?.ca) {
    throw new BadRequestError({
      message:
        "The certificate is not a certificate authority. A proxy enrolls with its own CA, not a leaf certificate."
    });
  }

  if (certificate.notAfter <= new Date()) {
    throw new BadRequestError({
      message: `The certificate authority expired on ${certificate.notAfter.toISOString()}. Generate a new one and enroll again.`
    });
  }

  if (certificate.notBefore > new Date()) {
    throw new BadRequestError({
      message: `The certificate authority is not valid until ${certificate.notBefore.toISOString()}. Nothing will accept the certificates it signs before then.`
    });
  }

  const digest = crypto.nativeCrypto
    .createHash("sha256")
    .update(Buffer.from(certificate.rawData))
    .digest("hex")
    .toUpperCase();
  const fingerprint = `SHA256:${digest.match(/.{2}/g)!.join(":")}`;

  return { fingerprint, expiresAt: certificate.notAfter };
};

// The same key type and subject the CLI uses for a CA it makes itself, so agents see no difference.
export const generateProxyRootCa = async (): Promise<TGeneratedRootCa> => {
  const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P256);
  const keys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

  const issuedAt = new Date();
  const expiresAt = new Date(new Date(issuedAt).setFullYear(issuedAt.getFullYear() + GENERATED_ROOT_CA_VALIDITY_YEARS));

  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=Infisical Agent Vault Proxy",
    serialNumber: createSerialNumber(),
    notBefore: getNotBeforeWithClockSkew(issuedAt),
    notAfter: getNotAfterWithClockSkew(expiresAt),
    signingAlgorithm: alg,
    keys,
    extensions: [
      // eslint-disable-next-line no-bitwise
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      new x509.BasicConstraintsExtension(true, 0, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
    ]
  });

  const certificatePem = certificate.toString("pem");
  const privateKey = crypto.nativeCrypto.KeyObject.from(keys.privateKey).export({ type: "pkcs8", format: "pem" });

  return {
    ...parseRootCaCertificate(certificatePem),
    certificate: certificatePem,
    privateKey: privateKey.toString()
  };
};
