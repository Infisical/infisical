import type {
  TCertificatePolicy,
  TCreateCertificatePolicyDTO,
  TCustomExtensionRule
} from "@app/hooks/api/certificatePolicies/types";

export const POLICY_DOCS =
  "https://infisical.com/docs/documentation/platform/pki/settings/policies";
export const PROFILE_DOCS =
  "https://infisical.com/docs/documentation/platform/pki/settings/profiles";

export type SubjectType =
  | "common_name"
  | "organization"
  | "organizational_unit"
  | "country"
  | "state"
  | "locality"
  | "domain_component";
export type SanType = "dns_name" | "ip_address" | "email" | "uri" | "upn";
export type RuleEffect = "require" | "allow" | "deny";
export type PolicyState = "allowed" | "required" | "denied";
export type Criticality = "critical" | "not_critical";
export type DurationUnit = "hours" | "days" | "months" | "years";

export const SUBJECT_TYPES: SubjectType[] = [
  "common_name",
  "organization",
  "organizational_unit",
  "country",
  "state",
  "locality",
  "domain_component"
];

export const SUBJECT_LABELS: Record<SubjectType, string> = {
  common_name: "Common name (CN)",
  organization: "Organization (O)",
  organizational_unit: "Organizational unit (OU)",
  country: "Country (C)",
  state: "State or province (ST)",
  locality: "Locality (L)",
  domain_component: "Domain component (DC)"
};

export const SUBJECT_PLACEHOLDERS: Record<SubjectType, string> = {
  common_name: "*.example.com",
  organization: "Acme Inc.",
  organizational_unit: "Engineering",
  country: "US",
  state: "California",
  locality: "San Francisco",
  domain_component: "corp,example,com"
};

export const SAN_TYPES: SanType[] = ["dns_name", "ip_address", "email", "uri", "upn"];

export const SAN_LABELS: Record<SanType, string> = {
  dns_name: "DNS name",
  ip_address: "IP address",
  email: "Email",
  uri: "URI",
  upn: "UPN"
};

export const SAN_PLACEHOLDERS: Record<SanType, string> = {
  dns_name: "*.example.com",
  ip_address: "10.0.0.1",
  email: "admin@example.com",
  uri: "spiffe://example.com/service",
  upn: "user@example.com"
};

export const EFFECT_OPTIONS: { value: RuleEffect; label: string }[] = [
  { value: "deny", label: "Deny" },
  { value: "allow", label: "Allow" },
  { value: "require", label: "Require" }
];

export const KEY_USAGES = [
  "digital_signature",
  "key_encipherment",
  "non_repudiation",
  "data_encipherment",
  "key_agreement",
  "key_cert_sign",
  "crl_sign",
  "encipher_only",
  "decipher_only"
] as const;

const KEY_USAGE_LABELS: Record<string, string> = {
  digital_signature: "Digital signature",
  key_encipherment: "Key encipherment",
  non_repudiation: "Non repudiation",
  data_encipherment: "Data encipherment",
  key_agreement: "Key agreement",
  key_cert_sign: "Key cert sign",
  crl_sign: "CRL sign",
  encipher_only: "Encipher only",
  decipher_only: "Decipher only"
};

export const EXTENDED_KEY_USAGES = [
  "client_auth",
  "server_auth",
  "code_signing",
  "email_protection",
  "ocsp_signing",
  "smart_card_logon",
  "time_stamping",
  "any_purpose"
] as const;

const EXTENDED_KEY_USAGE_LABELS: Record<string, string> = {
  client_auth: "Client auth",
  server_auth: "Server auth",
  code_signing: "Code signing",
  email_protection: "Email protection",
  ocsp_signing: "OCSP signing",
  smart_card_logon: "Smart card logon",
  time_stamping: "Time stamping",
  timestamping: "Time stamping",
  any_purpose: "Any extended key usage"
};

export const usageLabel = (usage: string) =>
  KEY_USAGE_LABELS[usage] ?? EXTENDED_KEY_USAGE_LABELS[usage] ?? usage.replace(/_/g, " ");

export const SIGNATURE_ALGORITHMS = [
  "SHA256-RSA",
  "SHA384-RSA",
  "SHA512-RSA",
  "SHA256-ECDSA",
  "SHA384-ECDSA",
  "SHA512-ECDSA",
  "ML-DSA-44",
  "ML-DSA-65",
  "ML-DSA-87"
] as const;

export const KEY_ALGORITHMS = [
  "RSA-2048",
  "RSA-3072",
  "RSA-4096",
  "ECDSA-P256",
  "ECDSA-P384",
  "ECDSA-P521",
  "ML-DSA-44",
  "ML-DSA-65",
  "ML-DSA-87"
] as const;

const API_SIGNATURE: Record<string, string> = {
  "SHA256-RSA": "RSA-SHA256",
  "SHA384-RSA": "RSA-SHA384",
  "SHA512-RSA": "RSA-SHA512",
  "SHA256-ECDSA": "ECDSA-SHA256",
  "SHA384-ECDSA": "ECDSA-SHA384",
  "SHA512-ECDSA": "ECDSA-SHA512"
};

const API_KEY: Record<string, string> = {
  "RSA-2048": "RSA_2048",
  "RSA-3072": "RSA_3072",
  "RSA-4096": "RSA_4096",
  "ECDSA-P256": "EC_prime256v1",
  "ECDSA-P384": "EC_secp384r1",
  "ECDSA-P521": "EC_secp521r1"
};

export const signatureToApi = (algorithm: string) => API_SIGNATURE[algorithm] ?? algorithm;
export const keyToApi = (algorithm: string) => API_KEY[algorithm] ?? algorithm;

export const POLICY_STATE_OPTIONS: { value: PolicyState; label: string }[] = [
  { value: "denied", label: "Deny" },
  { value: "allowed", label: "Allow" },
  { value: "required", label: "Require" }
];

export const POLICY_STATE_LABELS: Record<PolicyState, string> = {
  allowed: "Allowed",
  required: "Required",
  denied: "Denied"
};

export const CRITICALITY_LABELS: Record<"" | Criticality, string> = {
  "": "Critical and non-critical allowed",
  critical: "Always critical",
  not_critical: "Never critical"
};

const OID_PATTERN_SOURCE = "[0-2](\\.(0|[1-9][0-9]{0,14})){1,20}";
export const OID_PATTERN = new RegExp(`^${OID_PATTERN_SOURCE}$`);
const TEMPLATE_INFORMATION_PATTERN = new RegExp(
  `^(${OID_PATTERN_SOURCE}):(0|[1-9][0-9]{0,4})(\\.(0|[1-9][0-9]{0,4}))?$`
);
const MAX_EXTENSION_VALUE_BYTES = 2048;

type ExtensionPreset = {
  label: string;
  placeholder: string;
  critical: boolean;
  validate: (value: string) => string | null;
};

const EXTENSION_PRESETS: Record<string, ExtensionPreset> = {
  "1.3.6.1.5.5.7.1.24": {
    critical: false,
    label: "TLS feature (must-staple)",
    placeholder: "5",
    validate: (value) =>
      /^[0-9]{1,5}(,[0-9]{1,5})*$/.test(value)
        ? null
        : "Value must be a comma-separated list of TLS feature numbers, for example 5 for OCSP must-staple"
  },
  "1.3.6.1.4.1.311.25.2": {
    critical: false,
    label: "AD SID security extension",
    placeholder: "S-1-5-21-...",
    validate: (value) =>
      /^S-1-[0-9]{1,10}(-[0-9]{1,10}){1,14}$/.test(value)
        ? null
        : "Value must be a security identifier, for example S-1-5-21-1004336348-1177238915-682003330-1103"
  },
  "1.3.6.1.4.1.311.20.2": {
    critical: false,
    label: "Certificate template name",
    placeholder: "Machine",
    validate: (value) => {
      if (value.length > 64) return "Template name cannot exceed 64 characters";
      return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 0xffff)
        ? "Template name cannot contain characters outside the basic multilingual plane"
        : null;
    }
  },
  "1.3.6.1.4.1.311.21.7": {
    critical: false,
    label: "Certificate template information",
    placeholder: "1.3.6.1.4.1.311.21.8.1.2:100.3",
    validate: (value) =>
      TEMPLATE_INFORMATION_PATTERN.test(value)
        ? null
        : "Value must be the template OID, a colon, then the version, for example 1.3.6.1.4.1.311.21.8.1.2:100.3"
  }
};

const ISSUER_GENERATED_LABELS: Record<string, string> = {
  "1.3.6.1.4.1.11129.2.4.2": "Signed certificate timestamps",
  "1.3.6.1.4.1.11129.2.4.3": "Precertificate poison",
  "1.3.6.1.4.1.11129.2.4.5": "OCSP signed certificate timestamps",
  "1.3.101.75": "Certificate transparency information",
  "1.3.6.1.4.1.311.21.1": "CA version",
  "1.3.6.1.4.1.311.21.2": "Previous CA certificate hash"
};

const has = (record: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key);

const presetOf = (oid: string) =>
  has(EXTENSION_PRESETS, oid) ? EXTENSION_PRESETS[oid] : undefined;

export const isPresetExtension = (oid: string) => Boolean(presetOf(oid));

export const presetCriticality = (oid: string): Criticality | undefined => {
  const preset = presetOf(oid);
  if (!preset) return undefined;
  return preset.critical ? "critical" : "not_critical";
};

export const extensionLabel = (oid: string, label?: string | null) =>
  label?.trim() ||
  presetOf(oid)?.label ||
  (has(ISSUER_GENERATED_LABELS, oid) ? ISSUER_GENERATED_LABELS[oid] : undefined) ||
  oid;

export const extensionPlaceholder = (oid: string) => presetOf(oid)?.placeholder ?? "Value";

export const validateExtensionValue = (oid: string, value: string) => {
  const preset = presetOf(oid);
  if (preset) return preset.validate(value);
  return new TextEncoder().encode(value).length > MAX_EXTENSION_VALUE_BYTES
    ? `Value cannot exceed ${MAX_EXTENSION_VALUE_BYTES} bytes`
    : null;
};

export const oidOptions = (extra: string[] = []) => {
  const known = Object.entries(EXTENSION_PRESETS).map(([oid, preset]) => ({
    value: oid,
    label: preset.label,
    description: oid
  }));
  const custom = extra
    .filter((oid) => oid && !has(EXTENSION_PRESETS, oid))
    .map((oid) => ({ value: oid, label: oid }));
  return [...custom, ...known];
};

export const isValidDomainComponentSequence = (value: string) =>
  value.split(",").every((component) => component.trim().length > 0);

export const domainComponentChain = (value: string, separator = ",") =>
  value
    .split(",")
    .map((component) => `DC=${component.trim()}`)
    .join(separator);

export type AttributeRule = { key: string; type: SubjectType; effect: RuleEffect; value: string };
export type SanRule = { key: string; type: SanType; effect: RuleEffect; value: string };
export type ExtensionRule = {
  key: string;
  oid: string;
  label: string;
  effect: PolicyState;
  critical: "" | Criticality;
  value: string;
};
export type UsageRules = { required: string[]; allowed: string[] };

export type PolicyRestrictions = {
  subject: boolean;
  sans: boolean;
  signature: boolean;
  keyAlgorithm: boolean;
  keyUsages: boolean;
  extendedKeyUsages: boolean;
  customExtensions: boolean;
  validity: boolean;
  basicConstraints: boolean;
};

export type PolicyDraft = {
  preset: string;
  name: string;
  description: string;
  restrict: PolicyRestrictions;
  attributes: AttributeRule[];
  sans: SanRule[];
  signatureAlgorithms: string[];
  keyAlgorithms: string[];
  keyUsages: UsageRules;
  extendedKeyUsages: UsageRules;
  customExtensions: ExtensionRule[];
  validity: { value: string; unit: DurationUnit };
  basicConstraints: { isCA: PolicyState; maxPathLength: string };
};

export const ruleKey = () => crypto.randomUUID();

const API_EFFECT: Record<RuleEffect, "required" | "allowed" | "denied"> = {
  require: "required",
  allow: "allowed",
  deny: "denied"
};

const fromApiRules = <T extends string>(
  rules: { type: string; required?: string[]; allowed?: string[]; denied?: string[] }[] | undefined
) =>
  (rules ?? []).flatMap((rule) =>
    (["require", "allow", "deny"] as const).flatMap((effect) =>
      (rule[API_EFFECT[effect]] ?? []).map((value) => ({
        key: ruleKey(),
        type: rule.type as T,
        effect,
        value
      }))
    )
  );

const toApiRules = <T extends string>(rules: { type: T; effect: RuleEffect; value: string }[]) => {
  const byType = new Map<T, { required: string[]; allowed: string[]; denied: string[] }>();
  rules.forEach((rule) => {
    const value = rule.value.trim();
    const entry = byType.get(rule.type) ?? { required: [], allowed: [], denied: [] };
    const bucket = entry[API_EFFECT[rule.effect]];
    if (value && !bucket.includes(value)) bucket.push(value);
    byType.set(rule.type, entry);
  });
  return [...byType.entries()].map(([type, { required, allowed, denied }]) => ({
    type,
    ...(required.length ? { required } : {}),
    ...(allowed.length ? { allowed } : {}),
    ...(denied.length ? { denied } : {})
  }));
};

const UNIT_SUFFIX: Record<DurationUnit, string> = {
  hours: "h",
  days: "d",
  months: "m",
  years: "y"
};
const UNIT_NOUN: Record<DurationUnit, string> = {
  hours: "hour",
  days: "day",
  months: "month",
  years: "year"
};

export const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" }
];

const parseValidity = (max?: string): PolicyDraft["validity"] => {
  const fallback = { value: "365", unit: "days" as const };
  if (!max || max.length < 2) return fallback;
  const amount = max.slice(0, -1);
  const parsed = Number.parseInt(amount, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || String(parsed) !== amount) return fallback;
  const unit = (Object.keys(UNIT_SUFFIX) as DurationUnit[]).find(
    (key) => UNIT_SUFFIX[key] === max.slice(-1)
  );
  return { value: amount, unit: unit ?? "days" };
};

export const formatValidity = (max: string) => {
  const { value, unit } = parseValidity(max);
  return `${value} ${UNIT_NOUN[unit]}${value === "1" ? "" : "s"}`;
};

const noRestrictions: PolicyRestrictions = {
  subject: false,
  sans: false,
  signature: false,
  keyAlgorithm: false,
  keyUsages: false,
  extendedKeyUsages: false,
  customExtensions: false,
  validity: false,
  basicConstraints: false
};

export const emptyPolicyDraft = (name = ""): PolicyDraft => ({
  preset: "custom",
  name,
  description: "",
  restrict: noRestrictions,
  attributes: [],
  sans: [],
  signatureAlgorithms: [],
  keyAlgorithms: [],
  keyUsages: { required: [], allowed: [] },
  extendedKeyUsages: { required: [], allowed: [] },
  customExtensions: [],
  validity: { value: "365", unit: "days" },
  basicConstraints: { isCA: "denied", maxPathLength: "" }
});

export const policyDraftOf = (policy: TCertificatePolicy): PolicyDraft => ({
  preset: "custom",
  name: policy.name,
  description: policy.description ?? "",
  restrict: {
    subject: Boolean(policy.subject),
    sans: Boolean(policy.sans),
    signature: Boolean(policy.algorithms?.signature?.length),
    keyAlgorithm: Boolean(policy.algorithms?.keyAlgorithm?.length),
    keyUsages: Boolean(policy.keyUsages),
    extendedKeyUsages: Boolean(policy.extendedKeyUsages),
    customExtensions: Boolean(policy.customExtensions),
    validity: Boolean(policy.validity?.max),
    basicConstraints: Boolean(policy.basicConstraints?.isCA)
  },
  attributes: fromApiRules<SubjectType>(policy.subject),
  sans: fromApiRules<SanType>(policy.sans),
  signatureAlgorithms: [...(policy.algorithms?.signature ?? [])],
  keyAlgorithms: [...(policy.algorithms?.keyAlgorithm ?? [])],
  keyUsages: {
    required: policy.keyUsages?.required ?? [],
    allowed: policy.keyUsages?.allowed ?? []
  },
  extendedKeyUsages: {
    required: policy.extendedKeyUsages?.required ?? [],
    allowed: policy.extendedKeyUsages?.allowed ?? []
  },
  customExtensions: (policy.customExtensions ?? []).flatMap((rule) =>
    (["required", "allowed", "denied"] as const).flatMap((effect) =>
      (rule[effect] ?? []).map((value) => ({
        key: ruleKey(),
        oid: rule.oid,
        label: rule.label ?? "",
        critical: (rule.critical ?? "") as "" | Criticality,
        effect,
        value
      }))
    )
  ),
  validity: parseValidity(policy.validity?.max),
  basicConstraints: {
    isCA: (policy.basicConstraints?.isCA as PolicyState | undefined) ?? "denied",
    maxPathLength:
      policy.basicConstraints?.maxPathLength === undefined ||
      policy.basicConstraints.maxPathLength === null
        ? ""
        : String(policy.basicConstraints.maxPathLength)
  }
});

const groupExtensions = (rows: ExtensionRule[]): TCustomExtensionRule[] => {
  const byOid = new Map<
    string,
    {
      oid: string;
      label?: string;
      critical?: Criticality;
      required: string[];
      allowed: string[];
      denied: string[];
    }
  >();
  rows
    .filter((row) => row.oid.trim())
    .forEach((row) => {
      const oid = row.oid.trim();
      const entry = byOid.get(oid) ?? { oid, required: [], allowed: [], denied: [] };
      if (row.label.trim()) entry.label = row.label.trim();
      if (row.critical) entry.critical = row.critical;
      entry[row.effect].push(row.value.trim() || "*");
      byOid.set(oid, entry);
    });
  return [...byOid.values()].map(({ required, allowed, denied, ...rest }) => ({
    ...rest,
    ...(allowed.length ? { allowed } : {}),
    ...(required.length ? { required } : {}),
    ...(denied.length ? { denied } : {})
  })) as TCustomExtensionRule[];
};

export type PolicyRules = Required<
  Pick<
    TCreateCertificatePolicyDTO,
    | "name"
    | "description"
    | "subject"
    | "sans"
    | "keyUsages"
    | "extendedKeyUsages"
    | "algorithms"
    | "validity"
    | "basicConstraints"
    | "customExtensions"
  >
>;

export const policyToApi = (draft: PolicyDraft): PolicyRules => {
  const { restrict } = draft;
  const signature = restrict.signature ? draft.signatureAlgorithms : [];
  const keyAlgorithm = restrict.keyAlgorithm ? draft.keyAlgorithms : [];
  const { isCA } = draft.basicConstraints;
  const pathLength = draft.basicConstraints.maxPathLength.trim();
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    subject: restrict.subject
      ? (toApiRules(draft.attributes) as NonNullable<PolicyRules["subject"]>)
      : null,
    sans: restrict.sans ? (toApiRules(draft.sans) as NonNullable<PolicyRules["sans"]>) : null,
    keyUsages: restrict.keyUsages ? { ...draft.keyUsages } : null,
    extendedKeyUsages: restrict.extendedKeyUsages ? { ...draft.extendedKeyUsages } : null,
    algorithms:
      signature.length || keyAlgorithm.length
        ? ({
            ...(signature.length ? { signature } : {}),
            ...(keyAlgorithm.length ? { keyAlgorithm } : {})
          } as NonNullable<PolicyRules["algorithms"]>)
        : null,
    validity: restrict.validity
      ? { max: `${Number(draft.validity.value) || 365}${UNIT_SUFFIX[draft.validity.unit]}` }
      : null,
    basicConstraints: restrict.basicConstraints
      ? ({
          isCA,
          maxPathLength: isCA !== "denied" && pathLength ? Number(pathLength) : undefined
        } as NonNullable<PolicyRules["basicConstraints"]>)
      : null,
    customExtensions: restrict.customExtensions ? groupExtensions(draft.customExtensions) : null
  };
};

export const usageEffect = (rules: UsageRules, usage: string): RuleEffect => {
  if (rules.required.includes(usage)) return "require";
  if (rules.allowed.includes(usage)) return "allow";
  return "deny";
};

export const withUsageEffect = (
  rules: UsageRules,
  usage: string,
  effect: RuleEffect
): UsageRules => {
  const required = rules.required.filter((entry) => entry !== usage);
  const allowed = rules.allowed.filter((entry) => entry !== usage);
  if (effect === "require") required.push(usage);
  if (effect === "allow") allowed.push(usage);
  return { required, allowed };
};

export const hasEnforcement = (policy: TCertificatePolicy) =>
  Boolean(
    policy.subject ||
    policy.sans ||
    policy.keyUsages ||
    policy.extendedKeyUsages ||
    policy.algorithms?.signature?.length ||
    policy.algorithms?.keyAlgorithm?.length ||
    policy.validity?.max ||
    policy.basicConstraints?.isCA ||
    policy.customExtensions
  );

const ECDSA = {
  signature: ["SHA256-ECDSA", "SHA384-ECDSA", "SHA512-ECDSA"],
  key: ["ECDSA-P256", "ECDSA-P384", "ECDSA-P521"]
};
const RSA = {
  signature: ["SHA256-RSA", "SHA384-RSA", "SHA512-RSA"],
  key: ["RSA-2048", "RSA-3072", "RSA-4096"]
};

type PresetShape = {
  id: string;
  name: string;
  keyUsages: UsageRules;
  extendedKeyUsages: UsageRules;
  validity: PolicyDraft["validity"];
  attributes: [SubjectType, RuleEffect, string][];
  sans: [SanType, RuleEffect, string][];
  signatureAlgorithms: string[];
  keyAlgorithms: string[];
  basicConstraints?: PolicyDraft["basicConstraints"];
};

const year = { value: "365", unit: "days" as const };
const anyCommonName: [SubjectType, RuleEffect, string][] = [["common_name", "allow", "*"]];

export const POLICY_PRESETS: PresetShape[] = [
  {
    id: "tls-server",
    name: "TLS server certificate",
    keyUsages: {
      required: ["digital_signature"],
      allowed: ["digital_signature", "key_encipherment"]
    },
    extendedKeyUsages: { required: ["server_auth"], allowed: ["server_auth", "client_auth"] },
    validity: year,
    attributes: anyCommonName,
    sans: [
      ["dns_name", "allow", "*"],
      ["ip_address", "allow", "*"]
    ],
    signatureAlgorithms: [...ECDSA.signature, ...RSA.signature],
    keyAlgorithms: [...ECDSA.key, ...RSA.key]
  },
  {
    id: "tls-client",
    name: "TLS client certificate",
    keyUsages: { required: ["digital_signature"], allowed: ["digital_signature", "key_agreement"] },
    extendedKeyUsages: { required: ["client_auth"], allowed: ["client_auth"] },
    validity: year,
    attributes: anyCommonName,
    sans: [
      ["email", "allow", "*"],
      ["dns_name", "allow", "*"]
    ],
    signatureAlgorithms: ECDSA.signature,
    keyAlgorithms: ECDSA.key
  },
  {
    id: "code-signing",
    name: "Code signing certificate",
    keyUsages: {
      required: ["digital_signature", "non_repudiation"],
      allowed: ["digital_signature", "non_repudiation"]
    },
    extendedKeyUsages: { required: ["code_signing"], allowed: ["code_signing", "time_stamping"] },
    validity: year,
    attributes: anyCommonName,
    sans: [["email", "allow", "*"]],
    signatureAlgorithms: RSA.signature,
    keyAlgorithms: RSA.key
  },
  {
    id: "device",
    name: "Device certificate",
    keyUsages: { required: ["digital_signature"], allowed: ["digital_signature", "key_agreement"] },
    extendedKeyUsages: { required: ["client_auth"], allowed: ["client_auth", "server_auth"] },
    validity: year,
    attributes: anyCommonName,
    sans: [
      ["dns_name", "allow", "*"],
      ["ip_address", "allow", "*"]
    ],
    signatureAlgorithms: ECDSA.signature,
    keyAlgorithms: ECDSA.key
  },
  {
    id: "user",
    name: "User certificate",
    keyUsages: {
      required: ["digital_signature"],
      allowed: ["digital_signature", "key_encipherment", "key_agreement"]
    },
    extendedKeyUsages: {
      required: ["client_auth", "email_protection"],
      allowed: ["client_auth", "email_protection"]
    },
    validity: year,
    attributes: anyCommonName,
    sans: [["email", "allow", "*"]],
    signatureAlgorithms: ECDSA.signature,
    keyAlgorithms: ECDSA.key
  },
  {
    id: "email-protection",
    name: "Email protection certificate",
    keyUsages: {
      required: ["digital_signature"],
      allowed: ["digital_signature", "key_encipherment", "key_agreement"]
    },
    extendedKeyUsages: { required: ["email_protection"], allowed: ["email_protection"] },
    validity: year,
    attributes: anyCommonName,
    sans: [["email", "allow", "*"]],
    signatureAlgorithms: RSA.signature,
    keyAlgorithms: RSA.key
  },
  {
    id: "dual-purpose-server",
    name: "Dual-purpose server certificate",
    keyUsages: {
      required: ["digital_signature"],
      allowed: ["digital_signature", "key_encipherment", "key_agreement"]
    },
    extendedKeyUsages: {
      required: ["server_auth", "client_auth"],
      allowed: ["server_auth", "client_auth"]
    },
    validity: year,
    attributes: anyCommonName,
    sans: [
      ["dns_name", "allow", "*"],
      ["ip_address", "allow", "*"]
    ],
    signatureAlgorithms: ECDSA.signature,
    keyAlgorithms: ECDSA.key
  },
  {
    id: "intermediate-ca",
    name: "Intermediate CA certificate",
    basicConstraints: { isCA: "required", maxPathLength: "0" },
    keyUsages: {
      required: ["key_cert_sign", "crl_sign"],
      allowed: ["key_cert_sign", "crl_sign", "digital_signature"]
    },
    extendedKeyUsages: { required: [], allowed: ["ocsp_signing"] },
    validity: { value: "10", unit: "years" },
    attributes: [
      ["common_name", "allow", "*"],
      ["organization", "allow", "*"]
    ],
    sans: [],
    signatureAlgorithms: [...RSA.signature, ...ECDSA.signature],
    keyAlgorithms: [...RSA.key, ...ECDSA.key]
  }
];

export const applyPreset = (draft: PolicyDraft, presetId: string): PolicyDraft => {
  const preset = POLICY_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return { ...draft, preset: "custom" };
  const hasUsages = (rules: UsageRules) => Boolean(rules.required.length || rules.allowed.length);
  const basicConstraints: PolicyDraft["basicConstraints"] = preset.basicConstraints ?? {
    isCA: "denied",
    maxPathLength: ""
  };
  return {
    ...draft,
    preset: preset.id,
    attributes: preset.attributes.map(([type, effect, value]) => ({
      key: ruleKey(),
      type,
      effect,
      value
    })),
    sans: preset.sans.map(([type, effect, value]) => ({ key: ruleKey(), type, effect, value })),
    signatureAlgorithms: [...preset.signatureAlgorithms],
    keyAlgorithms: [...preset.keyAlgorithms],
    keyUsages: preset.keyUsages,
    extendedKeyUsages: preset.extendedKeyUsages,
    customExtensions: [],
    validity: preset.validity,
    basicConstraints,
    restrict: {
      subject: preset.attributes.length > 0,
      sans: preset.sans.length > 0,
      signature: preset.signatureAlgorithms.length > 0,
      keyAlgorithm: preset.keyAlgorithms.length > 0,
      keyUsages: hasUsages(preset.keyUsages),
      extendedKeyUsages: hasUsages(preset.extendedKeyUsages),
      customExtensions: false,
      validity: true,
      basicConstraints: basicConstraints.isCA !== "denied"
    }
  };
};

export type PolicyErrors = Partial<
  Record<
    "name" | "description" | "subject" | "sans" | "signature" | "keyAlgorithm" | "extensions",
    string
  >
>;

export const policyStepErrors = (draft: PolicyDraft, step: number): PolicyErrors => {
  const errors: PolicyErrors = {};
  if (step === 0) {
    const name = draft.name.trim();
    if (!name) errors.name = "Policy name is required";
    else if (name.length > 255) errors.name = "Policy name must be less than 255 characters";
    else if (!/^[a-zA-Z0-9-_]+$/.test(name))
      errors.name = "Policy name must contain only letters, numbers, hyphens, and underscores";
    if (draft.description.trim().length > 255)
      errors.description = "Description must be less than 255 characters";
  }
  if (step === 1) {
    if (draft.restrict.subject) {
      if (draft.attributes.some((rule) => !rule.value.trim()))
        errors.subject = "Every subject attribute needs a value (use * for any).";
      else if (
        draft.attributes.some(
          (rule) =>
            rule.type === "domain_component" && !isValidDomainComponentSequence(rule.value.trim())
        )
      )
        errors.subject =
          "Every domain component in a sequence must be non-empty, for example corp,example,com.";
    }
    if (draft.restrict.sans && draft.sans.some((rule) => !rule.value.trim()))
      errors.sans = "Every subject alternative name needs a value (use * for any).";
  }
  if (step === 2) {
    if (draft.restrict.signature && !draft.signatureAlgorithms.length)
      errors.signature = "Select at least one signature algorithm, or turn off the restriction.";
    if (draft.restrict.keyAlgorithm && !draft.keyAlgorithms.length)
      errors.keyAlgorithm = "Select at least one key algorithm, or turn off the restriction.";
  }
  if (step === 4 && draft.restrict.customExtensions) {
    if (draft.customExtensions.some((rule) => !rule.oid.trim()))
      errors.extensions = "Every custom extension needs an OID.";
    else if (draft.customExtensions.some((rule) => !rule.value.trim()))
      errors.extensions = "Every custom extension rule needs a value pattern (use * for any).";
  }
  return errors;
};
