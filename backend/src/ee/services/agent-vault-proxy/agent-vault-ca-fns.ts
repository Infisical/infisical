import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import {
  createSerialNumber,
  getNotAfterWithClockSkew,
  getNotBeforeWithClockSkew,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

export type TParsedRootCa = {
  fingerprint: string;
  expiresAt: Date;
};

export type TGeneratedRootCa = TParsedRootCa & {
  certificate: string;
  privateKey: string;
};

const MAX_ROOT_CA_PEM_LENGTH = 16384;
// A CA made moments before the proxy started can read as not yet valid when this server's clock is behind.
const NOT_BEFORE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
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
      message: "The certificate is not a certificate authority. A proxy serves a CA, not a leaf certificate."
    });
  }

  // The same rule the CLI applies before it serves a CA.
  const { name: keyAlgorithm, namedCurve } = certificate.publicKey.algorithm as { name?: string; namedCurve?: string };
  if (keyAlgorithm !== "ECDSA" || namedCurve !== "P-256") {
    throw new BadRequestError({ message: "The proxy's certificate authority must use a P-256 ECDSA key." });
  }

  const now = Date.now();
  if (certificate.notAfter.getTime() <= now || certificate.notBefore.getTime() > now + NOT_BEFORE_CLOCK_TOLERANCE_MS) {
    throw new BadRequestError({
      message: `The proxy's certificate authority isn't valid yet or has expired (valid from ${certificate.notBefore.toISOString()} to ${certificate.notAfter.toISOString()}).`
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
