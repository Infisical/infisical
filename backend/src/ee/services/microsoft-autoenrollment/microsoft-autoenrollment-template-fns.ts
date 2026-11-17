import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto/cryptography";
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
import { TIssuerAddedExtension } from "@app/services/certificate-v3/certificate-v3-types";
import { CertExtendedKeyUsageNameToOID, CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

const MICROSOFT_AUTOENROLLMENT_PEN = "99999";

const DEFAULT_MINIMAL_KEY_LENGTH = 2048;

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
