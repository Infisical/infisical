import net from "node:net";

import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  getNotAfterWithClockSkew,
  getNotBeforeWithClockSkew,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";

import { GATEWAY_IDENTITY_URI_PREFIX } from "./gateway-v2-constants";
import { parseDirectAddress } from "./gateway-v2-transport-fns";

export const issueGatewayServerCertificate = async ({
  orgId,
  gateway,
  caCertificate,
  caPrivateKey
}: {
  orgId: string;
  gateway: { id: string; directAddress?: string | null };
  caCertificate: x509.X509Certificate;
  caPrivateKey: CryptoKey;
}) => {
  const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
  const keys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
  const issuedAt = new Date();
  const expiresAt = new Date(new Date().setDate(new Date().getDate() + 1));

  const subjectAlternativeNames: x509.JsonGeneralName[] = [
    { type: "dns", value: "localhost" },
    { type: "ip", value: "127.0.0.1" },
    { type: "ip", value: "::1" },
    { type: "url", value: `${GATEWAY_IDENTITY_URI_PREFIX}${gateway.id}` }
  ];
  if (gateway.directAddress) {
    const { host } = parseDirectAddress(gateway.directAddress);
    subjectAlternativeNames.push(net.isIP(host) ? { type: "ip", value: host } : { type: "dns", value: host });
  }

  const extensions: x509.Extension[] = [
    new x509.BasicConstraintsExtension(false),
    await x509.AuthorityKeyIdentifierExtension.create(caCertificate, false),
    await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
    new x509.KeyUsagesExtension(
      // eslint-disable-next-line no-bitwise
      x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
      true
    ),
    new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
    new x509.SubjectAlternativeNameExtension(subjectAlternativeNames)
  ];

  const certificate = await x509.X509CertificateGenerator.create({
    serialNumber: createSerialNumber(),
    subject: `O=${orgId},CN=Gateway`,
    issuer: caCertificate.subject,
    notBefore: getNotBeforeWithClockSkew(issuedAt),
    notAfter: getNotAfterWithClockSkew(expiresAt),
    signingKey: caPrivateKey,
    publicKey: keys.publicKey,
    signingAlgorithm: alg,
    extensions
  });

  return { certificate, privateKey: crypto.nativeCrypto.KeyObject.from(keys.privateKey) };
};
