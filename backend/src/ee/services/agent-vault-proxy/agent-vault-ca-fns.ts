import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

export type TParsedRootCa = {
  certificate: string;
  /** `SHA256:` followed by colon-separated uppercase hex, the form an operator pins with. */
  fingerprint: string;
  expiresAt: Date;
};

const MAX_ROOT_CA_PEM_LENGTH = 16384;

/**
 * Validates a proxy's self-signed CA and derives its fingerprint and expiry **once, at enrollment**, so
 * no read path ever parses a certificate. The row is immutable for its life — re-enrollment overwrites
 * all three columns together — so the derived values cannot drift from the PEM.
 */
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

  const digest = crypto.nativeCrypto
    .createHash("sha256")
    .update(Buffer.from(certificate.rawData))
    .digest("hex")
    .toUpperCase();
  const fingerprint = `SHA256:${digest.match(/.{2}/g)!.join(":")}`;

  return { certificate: certificate.toString("pem"), fingerprint, expiresAt: certificate.notAfter };
};
