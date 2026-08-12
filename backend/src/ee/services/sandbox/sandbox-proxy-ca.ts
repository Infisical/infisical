import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";

import { createSerialNumber } from "@app/services/certificate-authority/certificate-authority-fns";

/**
 * A CA per sandbox, held in memory for the lifetime of the run. The proxy terminates TLS so it can
 * rewrite auth headers, which only works if the sandbox trusts this CA, so the certificate is
 * written into the sandbox and pointed at with the usual trust environment variables.
 */

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;
const CA_VALIDITY_DAYS = 2;
const LEAF_VALIDITY_DAYS = 1;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type TSandboxCa = {
  certificatePem: string;
  issue: (host: string) => Promise<{ key: string; cert: string }>;
};

const toPem = (der: ArrayBuffer, label: string) => {
  const body = Buffer.from(der)
    .toString("base64")
    .replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
};

export const createSandboxCa = async (sandboxId: string): Promise<TSandboxCa> => {
  const keys = (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])) as CryptoKeyPair;

  const notBefore = new Date(Date.now() - CLOCK_SKEW_MS);
  const notAfter = new Date(Date.now() + CA_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    name: `CN=Infisical Sandbox Proxy CA ${sandboxId}`,
    serialNumber: createSerialNumber(),
    notBefore,
    notAfter,
    signingAlgorithm: ALGORITHM,
    keys,
    extensions: [
      // eslint-disable-next-line no-bitwise
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      new x509.BasicConstraintsExtension(true, undefined, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
    ]
  });

  const leafCache = new Map<string, { key: string; cert: string }>();

  const issue = async (host: string) => {
    const cached = leafCache.get(host);
    if (cached) return cached;

    const leafKeys = (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])) as CryptoKeyPair;

    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber: createSerialNumber(),
      subject: `CN=${host}`,
      issuer: caCert.subject,
      notBefore,
      notAfter: new Date(Date.now() + LEAF_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
      signingKey: keys.privateKey,
      publicKey: leafKeys.publicKey,
      signingAlgorithm: ALGORITHM,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.SubjectAlternativeNameExtension([{ type: "dns", value: host }]),
        await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey)
      ]
    });

    const pkcs8 = await crypto.subtle.exportKey("pkcs8", leafKeys.privateKey);
    const issued = {
      key: toPem(pkcs8, "PRIVATE KEY"),
      cert: toPem(leafCert.rawData, "CERTIFICATE")
    };

    leafCache.set(host, issued);
    return issued;
  };

  return { certificatePem: toPem(caCert.rawData, "CERTIFICATE"), issue };
};
