import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto/cryptography";
import { findCaKeySourceRequiredSignatureAlgorithm } from "@app/services/certificate-authority/ca-key-source/ca-key-source-fns";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CUSTOM_EXTENSION_PRESET_OIDS
} from "@app/services/certificate-common/certificate-constants";
import {
  describeCustomExtensionValue,
  encodeCustomExtensionValue
} from "@app/services/certificate-common/certificate-extension-fns";
import { combineKeyUsageFlags } from "@app/services/certificate-common/certificate-issuance-utils";
import {
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayToLegacy
} from "@app/services/certificate-common/certificate-utils";
import { TCertificateProfileDefaults } from "@app/services/certificate-profile/certificate-profile-types";
import { TIssuerAddedExtension } from "@app/services/certificate-v3/certificate-v3-types";
import {
  CertExtendedKeyUsageNameToOID,
  CertKeyAlgorithm,
  CertSignatureAlgorithm
} from "@app/services/certificate/certificate-types";

const MICROSOFT_AUTOENROLLMENT_PEN = "67766";

const DEFAULT_MINIMAL_KEY_LENGTH = 2048;

const SECONDS_PER_DAY = 86400;
const MIN_RENEWAL_PERIOD_SECONDS = 8 * 60 * 60 + 1;
const MAX_RENEWAL_PERIOD_SHARE_OF_VALIDITY = 0.2;

const RSA_KEY_LENGTH_BY_ALGORITHM: Partial<Record<CertKeyAlgorithm, number>> = {
  [CertKeyAlgorithm.RSA_2048]: 2048,
  [CertKeyAlgorithm.RSA_3072]: 3072,
  [CertKeyAlgorithm.RSA_4096]: 4096
};

type TTemplateEllipticCurve = {
  oid: string;
  name: string;
};

export type TTemplatePrivateKey = {
  minimalKeyLength: number;
  ellipticCurve: TTemplateEllipticCurve | null;
};

const ELLIPTIC_CURVE_BY_ALGORITHM: Partial<Record<CertKeyAlgorithm, TTemplateEllipticCurve & { keyLength: number }>> = {
  [CertKeyAlgorithm.ECDSA_P256]: { oid: "1.2.840.10045.3.1.7", name: "ECDSA_P256", keyLength: 256 },
  [CertKeyAlgorithm.ECDSA_P384]: { oid: "1.3.132.0.34", name: "ECDSA_P384", keyLength: 384 },
  [CertKeyAlgorithm.ECDSA_P521]: { oid: "1.3.132.0.35", name: "ECDSA_P521", keyLength: 521 }
};

const KEY_ALGORITHM_DISPLAY_NAMES: Partial<Record<string, string>> = {
  [CertKeyAlgorithm.RSA_2048]: "RSA 2048",
  [CertKeyAlgorithm.RSA_3072]: "RSA 3072",
  [CertKeyAlgorithm.RSA_4096]: "RSA 4096",
  [CertKeyAlgorithm.ECDSA_P256]: "ECDSA P256",
  [CertKeyAlgorithm.ECDSA_P384]: "ECDSA P384",
  [CertKeyAlgorithm.ECDSA_P521]: "ECDSA P521"
};

export const TEMPLATE_DEFAULT_KEY_ALGORITHM = CertKeyAlgorithm.RSA_2048;

const TEMPLATE_HASHES = [
  { signatureSuffix: "SHA256", oid: "2.16.840.1.101.3.4.2.1", name: "sha256" },
  { signatureSuffix: "SHA384", oid: "2.16.840.1.101.3.4.2.2", name: "sha384" },
  { signatureSuffix: "SHA512", oid: "2.16.840.1.101.3.4.2.3", name: "sha512" }
];

export const getKeyAlgorithmDisplayName = (keyAlgorithm: string) =>
  KEY_ALGORITHM_DISPLAY_NAMES[keyAlgorithm] ?? keyAlgorithm;

export const buildTemplateOid = (applicationProfileId: string) => {
  const hex = applicationProfileId.split("-").join("");
  const arcs = Array.from({ length: hex.length / 4 }, (_, index) => parseInt(hex.slice(index * 4, index * 4 + 4), 16));
  return `1.3.6.1.4.1.${MICROSOFT_AUTOENROLLMENT_PEN}.1.${arcs.join(".")}`;
};

export const buildPolicyId = (applicationProfileId: string) => {
  const hash = crypto.nativeCrypto.createHash("sha1").update(applicationProfileId).digest("hex");
  return `{${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}}`.toUpperCase();
};

export const isTemplateKeyAlgorithmSupported = (keyAlgorithm?: CertKeyAlgorithm) =>
  !keyAlgorithm || Boolean(RSA_KEY_LENGTH_BY_ALGORITHM[keyAlgorithm] || ELLIPTIC_CURVE_BY_ALGORITHM[keyAlgorithm]);

export const resolveTemplatePrivateKey = (keyAlgorithm?: CertKeyAlgorithm): TTemplatePrivateKey => {
  const curve = keyAlgorithm ? ELLIPTIC_CURVE_BY_ALGORITHM[keyAlgorithm] : undefined;
  if (curve) {
    return { minimalKeyLength: curve.keyLength, ellipticCurve: { oid: curve.oid, name: curve.name } };
  }
  return {
    minimalKeyLength: (keyAlgorithm && RSA_KEY_LENGTH_BY_ALGORITHM[keyAlgorithm]) || DEFAULT_MINIMAL_KEY_LENGTH,
    ellipticCurve: null
  };
};

export const resolveRenewalPeriodSeconds = (renewBeforeDays: number, validitySeconds: number) => {
  const maxRenewalPeriodSeconds = Math.ceil(validitySeconds * MAX_RENEWAL_PERIOD_SHARE_OF_VALIDITY) - 1;
  return Math.min(Math.max(renewBeforeDays * SECONDS_PER_DAY, MIN_RENEWAL_PERIOD_SECONDS), maxRenewalPeriodSeconds);
};

export const buildTemplateInfoExtension = (
  templateOid: string,
  majorRevision: number,
  minorRevision: number
): TIssuerAddedExtension => ({
  oid: CUSTOM_EXTENSION_PRESET_OIDS.MS_CERTIFICATE_TEMPLATE_INFORMATION,
  critical: false,
  value: Buffer.from(
    encodeCustomExtensionValue(
      CUSTOM_EXTENSION_PRESET_OIDS.MS_CERTIFICATE_TEMPLATE_INFORMATION,
      `${templateOid}:${majorRevision}.${minorRevision}`
    ),
    "base64"
  )
});

export const buildSidSecurityExtension = (sid: string): TIssuerAddedExtension => ({
  oid: CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID,
  critical: false,
  value: Buffer.from(encodeCustomExtensionValue(CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID, sid), "base64")
});

export const readSidSecurityExtension = (certificate: x509.X509Certificate): string | undefined => {
  const extension = certificate.getExtension(CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID);
  if (!extension) return undefined;
  return (
    describeCustomExtensionValue(
      CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID,
      Buffer.from(extension.value).toString("base64")
    ) ?? undefined
  );
};

const toTemplateExtension = (extension: x509.Extension): TIssuerAddedExtension => ({
  oid: extension.type,
  critical: extension.critical,
  value: Buffer.from(extension.value)
});

export const buildProfileUsageExtensions = ({
  keyUsages,
  extendedKeyUsages
}: {
  keyUsages?: CertKeyUsageType[];
  extendedKeyUsages?: CertExtendedKeyUsageType[];
}): TIssuerAddedExtension[] => {
  const extensions: TIssuerAddedExtension[] = [];

  const legacyExtendedKeyUsages = convertExtendedKeyUsageArrayToLegacy(extendedKeyUsages) ?? [];
  if (legacyExtendedKeyUsages.length) {
    extensions.push(
      toTemplateExtension(
        new x509.ExtendedKeyUsageExtension(legacyExtendedKeyUsages.map((usage) => CertExtendedKeyUsageNameToOID[usage]))
      )
    );
  }

  const legacyKeyUsages = convertKeyUsageArrayToLegacy(keyUsages) ?? [];
  if (legacyKeyUsages.length) {
    extensions.push(toTemplateExtension(new x509.KeyUsagesExtension(combineKeyUsageFlags(legacyKeyUsages), true)));
  }

  return extensions;
};

export const resolveTemplateSignatureAlgorithm = (
  defaults?: Pick<TCertificateProfileDefaults, "keyAlgorithm" | "signatureAlgorithm"> | null
) => {
  const hash =
    TEMPLATE_HASHES.find(({ signatureSuffix }) => defaults?.signatureAlgorithm?.endsWith(`-${signatureSuffix}`)) ??
    TEMPLATE_HASHES[0];
  const family = resolveTemplatePrivateKey(defaults?.keyAlgorithm).ellipticCurve ? "ECDSA" : "RSA";
  return {
    hash: { oid: hash.oid, name: hash.name },
    signatureAlgorithm: `${family}-${hash.signatureSuffix}` as CertSignatureAlgorithm
  };
};

export type TTemplateSigningCa = { keyAlgorithm?: string | null; keySource?: string | null };

export const findTemplatePolicyProblem = (
  profile: { slug: string; defaults?: unknown },
  signingCa: TTemplateSigningCa | null | undefined,
  isAllowed: (request: { keyAlgorithm: CertKeyAlgorithm; signatureAlgorithm?: CertSignatureAlgorithm }) => boolean
) => {
  const defaults = profile.defaults as TCertificateProfileDefaults | null;
  const profileKeyAlgorithm = defaults?.keyAlgorithm;
  const keyAlgorithm = profileKeyAlgorithm ?? TEMPLATE_DEFAULT_KEY_ALGORITHM;
  if (!isAllowed({ keyAlgorithm })) {
    const keyName = getKeyAlgorithmDisplayName(keyAlgorithm);
    return profileKeyAlgorithm
      ? `Profile '${profile.slug}' asks Windows for ${keyName} keys, but the profile's certificate policy does not allow that key algorithm, so every Windows request would be refused. Set the profile's default key algorithm to one the policy allows, or allow ${keyName} in the policy.`
      : `Profile '${profile.slug}' has no default key algorithm, so Windows requests ${keyName} keys, but the profile's certificate policy does not allow that key algorithm, so every Windows request would be refused. Set the profile's default key algorithm to one the policy allows, or allow ${keyName} in the policy.`;
  }

  const caRequiredSignatureAlgorithm = findCaKeySourceRequiredSignatureAlgorithm({
    keySource: signingCa?.keySource,
    caKeyAlgorithm: signingCa?.keyAlgorithm
  });
  const signatureAlgorithm =
    caRequiredSignatureAlgorithm ?? resolveTemplateSignatureAlgorithm(defaults).signatureAlgorithm;
  if (isAllowed({ keyAlgorithm, signatureAlgorithm })) return null;
  if (caRequiredSignatureAlgorithm) {
    return `Certificates from profile '${profile.slug}' are signed with ${signatureAlgorithm}, the only algorithm its certificate authority's AWS KMS key can sign with, but the profile's certificate policy does not allow that signature algorithm, so every Windows request would be refused. Allow ${signatureAlgorithm} in the policy, or use a certificate authority whose key the policy allows.`;
  }
  return defaults?.signatureAlgorithm
    ? `Profile '${profile.slug}' asks Windows to sign its requests with ${signatureAlgorithm}, but the profile's certificate policy does not allow that signature algorithm, so every Windows request would be refused. Set the profile's default signature algorithm to one the policy allows, or allow ${signatureAlgorithm} in the policy.`
    : `Profile '${profile.slug}' has no default signature algorithm, so Windows signs its requests with ${signatureAlgorithm}, but the profile's certificate policy does not allow that signature algorithm, so every Windows request would be refused. Set the profile's default signature algorithm to one the policy allows, or allow ${signatureAlgorithm} in the policy.`;
};
