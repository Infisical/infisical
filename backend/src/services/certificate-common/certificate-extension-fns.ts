import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

import { matchesNormalizedPattern } from "../certificate-policy/certificate-policy-fns";
import {
  CERT_EXTENSION_OID_PATTERN_SOURCE,
  CertExtensionCriticality,
  CertExtensionRuleKind,
  CUSTOM_EXTENSION_PRESET_OIDS,
  MAX_CUSTOM_EXTENSION_VALUE_BYTES,
  MAX_CUSTOM_EXTENSIONS_PER_AWS_PCA_PROFILE,
  RESERVED_CERT_EXTENSION_OID_MESSAGES,
  RESERVED_CERT_EXTENSION_OID_PREFIXES
} from "./certificate-constants";

export type TIssuedCustomExtension = {
  oid: string;
  critical: boolean;
  value: string;
  displayValue?: string;
};

export type TResolvedCustomExtension = TIssuedCustomExtension;

export type TCustomExtensionRule = {
  oid: string;
  label?: string;
  critical?: CertExtensionCriticality;
  rule: CertExtensionRuleKind;
  value: string;
};

export type TProfileCustomExtension = {
  oid: string;
  label?: string;
  critical?: boolean;
  value?: string;
};

export type TRequestCustomExtension = {
  oid: string;
  value?: string;
  critical?: boolean;
};

type TCustomExtensionPreset = {
  critical: boolean;
  validateInput: (value: string) => string | null;
  encode: (value: string) => Buffer;
  describe: (der: Buffer) => string | null;
};

const SID_PATTERN = new RE2("^S-1-[0-9]{1,10}(-[0-9]{1,10}){1,14}$");
const TEMPLATE_INFORMATION_PATTERN = new RE2(
  `^(${CERT_EXTENSION_OID_PATTERN_SOURCE}):(0|[1-9][0-9]{0,4})(\\.(0|[1-9][0-9]{0,4}))?$`
);

const toDerBuffer = (schema: { toBER: (sizeOnly?: boolean) => ArrayBuffer }): Buffer =>
  Buffer.from(new Uint8Array(schema.toBER(false)));

const parseSingleDerValue = (der: Buffer): asn1js.AsnType | null => {
  try {
    const { offset, result } = asn1js.fromBER(der);
    if (offset === -1 || offset !== der.length) return null;
    return result;
  } catch {
    return null;
  }
};

const encodeNtdsSid = (sid: string): Buffer => {
  const otherName = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: `${CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID}.1` }),
      new asn1js.Constructed({
        idBlock: { tagClass: 3, tagNumber: 0 },
        value: [new asn1js.OctetString({ valueHex: new TextEncoder().encode(sid).buffer as ArrayBuffer })]
      })
    ]
  });

  return toDerBuffer(
    new asn1js.Sequence({
      value: [new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: otherName.valueBlock.value })]
    })
  );
};

const describeNtdsSid = (der: Buffer): string | null => {
  const parsed = parseSingleDerValue(der);
  if (!(parsed instanceof asn1js.Sequence)) return null;

  const generalName = parsed.valueBlock.value[0];
  if (!(generalName instanceof asn1js.Constructed)) return null;

  const [typeId, tagged] = generalName.valueBlock.value;
  if (!(typeId instanceof asn1js.ObjectIdentifier)) return null;
  if (typeId.valueBlock.toString() !== `${CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID}.1`) return null;
  if (!(tagged instanceof asn1js.Constructed)) return null;

  const octets = tagged.valueBlock.value[0];
  if (!(octets instanceof asn1js.OctetString)) return null;

  const sid = Buffer.from(octets.valueBlock.valueHexView).toString("utf8");
  return SID_PATTERN.test(sid) ? sid : null;
};

const describeTemplateInformation = (der: Buffer): string | null => {
  const parsed = parseSingleDerValue(der);
  if (!(parsed instanceof asn1js.Sequence)) return null;

  const [templateOid, major, minor] = parsed.valueBlock.value;
  if (!(templateOid instanceof asn1js.ObjectIdentifier)) return null;
  if (!(major instanceof asn1js.Integer)) return null;

  const base = `${templateOid.valueBlock.toString()}:${major.valueBlock.valueDec}`;
  return minor instanceof asn1js.Integer ? `${base}.${minor.valueBlock.valueDec}` : base;
};

type TAsn1StringType = new (params: { value: string }) => asn1js.AsnType;

const asn1StringPreset = ({
  Type,
  validateInput,
  critical = false
}: {
  Type: TAsn1StringType;
  validateInput: (value: string) => string | null;
  critical?: boolean;
}): TCustomExtensionPreset => ({
  critical,
  validateInput,
  encode: (value) => toDerBuffer(new Type({ value })),
  describe: (der) => {
    const parsed = parseSingleDerValue(der);
    return parsed instanceof Type ? (parsed as unknown as { valueBlock: { value: string } }).valueBlock.value : null;
  }
});

export const CUSTOM_EXTENSION_PRESETS_BY_OID: Record<string, TCustomExtensionPreset> = {
  [CUSTOM_EXTENSION_PRESET_OIDS.NTDS_SID]: {
    critical: false,
    validateInput: (value) =>
      SID_PATTERN.test(value)
        ? null
        : "Enter a security identifier, for example S-1-5-21-1004336348-1177238915-682003330-1103",
    encode: encodeNtdsSid,
    describe: describeNtdsSid
  },
  [CUSTOM_EXTENSION_PRESET_OIDS.MS_CERTIFICATE_TEMPLATE_NAME]: asn1StringPreset({
    Type: asn1js.BmpString,
    validateInput: (value) => {
      if (!value.length) return "Enter a certificate template name";
      if (value.length > 64) return "Template name cannot exceed 64 characters";
      if (Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 0xffff)) {
        return "Template name cannot contain characters outside the basic multilingual plane";
      }
      return null;
    }
  }),
  [CUSTOM_EXTENSION_PRESET_OIDS.MS_CERTIFICATE_TEMPLATE_INFORMATION]: {
    critical: false,
    validateInput: (value) =>
      TEMPLATE_INFORMATION_PATTERN.test(value)
        ? null
        : "Enter the template OID, a colon, then the version, for example 1.3.6.1.4.1.311.21.8.1.2:100.3",
    encode: (value) => {
      const match = TEMPLATE_INFORMATION_PATTERN.exec(value);
      if (!match) throw new BadRequestError({ message: "Certificate template information value is malformed" });

      const [, templateOid, , , major, , minor] = match;
      return toDerBuffer(
        new asn1js.Sequence({
          value: [
            new asn1js.ObjectIdentifier({ value: templateOid }),
            new asn1js.Integer({ value: Number(major) }),
            ...(minor === undefined ? [] : [new asn1js.Integer({ value: Number(minor) })])
          ]
        })
      );
    },
    describe: describeTemplateInformation
  }
};

export const isReservedExtensionOid = (oid: string): boolean =>
  RESERVED_CERT_EXTENSION_OID_PREFIXES.some((prefix) => oid.startsWith(prefix)) ||
  Object.hasOwn(RESERVED_CERT_EXTENSION_OID_MESSAGES, oid);

export const describeReservedExtensionOid = (oid: string): string =>
  RESERVED_CERT_EXTENSION_OID_MESSAGES[oid] ??
  `OID ${oid} is a standard X.509 extension that Infisical manages, so it cannot be used as a custom extension.`;

const getCustomExtensionPreset = (oid: string): TCustomExtensionPreset | undefined =>
  Object.hasOwn(CUSTOM_EXTENSION_PRESETS_BY_OID, oid) ? CUSTOM_EXTENSION_PRESETS_BY_OID[oid] : undefined;

export const validateCustomExtensionValue = (oid: string, value: string): string | null => {
  const preset = getCustomExtensionPreset(oid);
  if (preset) return preset.validateInput(value);
  if (!value.length) return "Enter a value";
  if (Buffer.byteLength(value, "utf8") > MAX_CUSTOM_EXTENSION_VALUE_BYTES) {
    return `Value cannot exceed ${MAX_CUSTOM_EXTENSION_VALUE_BYTES} bytes`;
  }
  return null;
};

export const encodeCustomExtensionValue = (oid: string, value: string): string => {
  const preset = getCustomExtensionPreset(oid);
  if (preset) return preset.encode(value).toString("base64");
  return toDerBuffer(new asn1js.Utf8String({ value })).toString("base64");
};

export const describeCustomExtensionValue = (oid: string, base64Value: string): string | null => {
  const preset = getCustomExtensionPreset(oid);
  const der = Buffer.from(base64Value, "base64");

  if (!preset) {
    const parsed = parseSingleDerValue(der);
    return parsed instanceof asn1js.Utf8String ? parsed.valueBlock.value : null;
  }

  try {
    const described = preset.describe(der);
    if (described === null) return null;
    return preset.encode(described).equals(der) ? described : null;
  } catch {
    return null;
  }
};

export const parseCustomExtensionsFromCertificate = (
  source: Buffer | x509.X509Certificate
): TIssuedCustomExtension[] => {
  let certificate: x509.X509Certificate;
  if (source instanceof x509.X509Certificate) {
    certificate = source;
  } else {
    try {
      certificate = new x509.X509Certificate(source);
    } catch {
      return [];
    }
  }

  return certificate.extensions
    .filter((extension) => !isReservedExtensionOid(extension.type))
    .map((extension) => ({
      oid: extension.type,
      critical: extension.critical,
      value: Buffer.from(new Uint8Array(extension.value)).toString("base64")
    }))
    .sort((a, b) => a.oid.localeCompare(b.oid));
};

export const parseIssuedCustomExtensions = (
  certificateDer: Buffer,
  resolved?: TResolvedCustomExtension[]
): TIssuedCustomExtension[] => {
  if (!resolved?.length) return [];
  const resolvedOids = new Set(resolved.map((extension) => extension.oid));

  return parseCustomExtensionsFromCertificate(certificateDer)
    .filter((extension) => resolvedOids.has(extension.oid))
    .map((extension) => ({
      ...extension,
      displayValue: describeCustomExtensionValue(extension.oid, extension.value) ?? undefined
    }));
};

export const findUnsatisfiedCustomExtensionOids = (
  certificateDer: Buffer,
  resolved?: TResolvedCustomExtension[]
): string[] => {
  if (!resolved?.length) return [];
  const issuedByOid = new Map(
    parseCustomExtensionsFromCertificate(certificateDer).map((extension) => [extension.oid, extension])
  );
  return resolved
    .filter((extension) => {
      const issued = issuedByOid.get(extension.oid);
      return !issued || issued.value !== extension.value || issued.critical !== extension.critical;
    })
    .map((extension) => extension.oid);
};

export const toRequestCustomExtensions = (stored: unknown): TRequestCustomExtension[] =>
  ((stored as TResolvedCustomExtension[] | null) ?? []).flatMap((extension) => {
    const value = describeCustomExtensionValue(extension.oid, extension.value);
    if (value === null) {
      throw new BadRequestError({
        message: `Custom extension '${extension.oid}' on this certificate cannot be read back into a value a new request can carry, so it cannot be reissued. Issue a new certificate, or renew from a certificate signing request that carries the extension.`
      });
    }
    return [
      {
        oid: extension.oid,
        value,
        critical: extension.critical
      }
    ];
  });

export const assertAwsPcaCustomExtensionLimit = (count: number): void => {
  if (count > MAX_CUSTOM_EXTENSIONS_PER_AWS_PCA_PROFILE) {
    throw new BadRequestError({
      message: `AWS Private CA accepts at most ${MAX_CUSTOM_EXTENSIONS_PER_AWS_PCA_PROFILE} custom extensions on a certificate, and this request resolved to ${count}.`
    });
  }
};

export const appendCustomExtensions = (extensions: x509.Extension[], resolved: TIssuedCustomExtension[] = []): void => {
  for (const extension of resolved) {
    if (extensions.some((existing) => existing.type === extension.oid)) {
      throw new BadRequestError({
        message: `Custom extension '${extension.oid}' collides with an extension this certificate authority manages. Remove it from the certificate profile.`
      });
    }
    extensions.push(new x509.Extension(extension.oid, extension.critical, Buffer.from(extension.value, "base64")));
  }
};

const ALLOW_ANY_RULE: TCustomExtensionRule = { oid: "", rule: CertExtensionRuleKind.ALLOW, value: "*" };

const buildRuleLookup = (rules?: TCustomExtensionRule[] | null) => {
  if (rules === undefined || rules === null) return null;
  return new Map(rules.map((rule) => [rule.oid, rule]));
};

const resolveCriticality = ({
  oid,
  rule,
  declaration,
  requested
}: {
  oid: string;
  rule: TCustomExtensionRule;
  declaration: TProfileCustomExtension;
  requested?: TRequestCustomExtension;
}): { critical: boolean; errors: string[] } => {
  const preset = getCustomExtensionPreset(oid);

  const fixed = (critical: boolean, reason: string) => {
    const contested = [declaration.critical, requested?.critical].some(
      (asked) => asked !== undefined && asked !== critical
    );
    return {
      critical,
      errors: contested ? [`Custom extension '${oid}' ${reason}, so its criticality cannot be set.`] : []
    };
  };

  if (preset) {
    return fixed(preset.critical, `is always emitted as ${preset.critical ? "critical" : "non-critical"}`);
  }

  if (rule.critical) {
    const critical = rule.critical === CertExtensionCriticality.CRITICAL;
    return fixed(critical, `must be emitted as ${critical ? "critical" : "non-critical"} by this policy`);
  }

  if (requested?.critical !== undefined) {
    return { critical: requested.critical, errors: [] };
  }

  return {
    critical: declaration.critical ?? false,
    errors: []
  };
};

export const resolveCustomExtensions = ({
  declarations,
  rules,
  requestExtensions,
  skipRequired = false
}: {
  declarations?: TProfileCustomExtension[] | null;
  rules?: TCustomExtensionRule[] | null;
  requestExtensions?: TRequestCustomExtension[];
  skipRequired?: boolean;
}): { extensions: TResolvedCustomExtension[]; errors: string[] } => {
  const rulesByOid = buildRuleLookup(rules);
  const errors: string[] = [];
  const extensions: TResolvedCustomExtension[] = [];
  const resolvedOids = new Set<string>();

  const declarationByOid = new Map((declarations ?? []).map((declaration) => [declaration.oid, declaration]));
  const requestedByOid = new Map((requestExtensions ?? []).map((requested) => [requested.oid, requested]));
  const resolvableOids = [...new Set([...declarationByOid.keys(), ...requestedByOid.keys()])];

  for (const oid of resolvableOids) {
    if (isReservedExtensionOid(oid)) {
      errors.push(describeReservedExtensionOid(oid));
      // eslint-disable-next-line no-continue
      continue;
    }

    const declaration = declarationByOid.get(oid) ?? { oid };
    const rule = rulesByOid === null ? ALLOW_ANY_RULE : rulesByOid.get(oid);
    if (!rule) {
      errors.push(`Custom extension '${oid}' is not allowed by this policy.`);
      // eslint-disable-next-line no-continue
      continue;
    }

    const requested = requestedByOid.get(oid);
    const criticality = resolveCriticality({ oid, rule, declaration, requested });
    errors.push(...criticality.errors);
    if (criticality.errors.length) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const displayValue = requested?.value ?? declaration.value;
    if (displayValue === undefined) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const isFromRequest = requested?.value !== undefined;
    const invalid = validateCustomExtensionValue(oid, displayValue);
    if (invalid) {
      errors.push(
        isFromRequest
          ? `Custom extension '${oid}' in the request is invalid. ${invalid}`
          : `Custom extension '${oid}' value is invalid. ${invalid}`
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    const matchesRule = matchesNormalizedPattern(displayValue, rule.value);
    if (rule.rule === CertExtensionRuleKind.DENY && matchesRule) {
      errors.push(`Custom extension '${oid}' value '${displayValue}' is denied by this policy.`);
      // eslint-disable-next-line no-continue
      continue;
    }
    if (rule.rule === CertExtensionRuleKind.REQUIRE && !matchesRule) {
      errors.push(
        `Custom extension '${oid}' value '${displayValue}' does not match the value required by this policy: ${rule.value}`
      );
      // eslint-disable-next-line no-continue
      continue;
    }
    if (rule.rule === CertExtensionRuleKind.ALLOW && !matchesRule) {
      errors.push(
        `Custom extension '${oid}' value '${displayValue}' is not allowed by this policy. Allowed values: ${rule.value}`
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    resolvedOids.add(oid);
    extensions.push({
      oid,
      critical: criticality.critical,
      value: encodeCustomExtensionValue(oid, displayValue),
      displayValue
    });
  }

  if (!skipRequired && rulesByOid !== null) {
    for (const rule of rulesByOid.values()) {
      if (rule.rule !== CertExtensionRuleKind.REQUIRE) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (!resolvedOids.has(rule.oid)) {
        errors.push(
          `This policy requires custom extension '${rule.oid}' matching '${rule.value}'. Supply it on the request, or set it as a default on the certificate profile.`
        );
      }
    }
  }

  extensions.sort((a, b) => a.oid.localeCompare(b.oid));

  return { extensions, errors };
};
