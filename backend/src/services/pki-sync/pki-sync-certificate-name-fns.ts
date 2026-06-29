import handlebars from "handlebars";
import RE2 from "re2";

import { PkiSync } from "./pki-sync-enums";

const DASH_REGEX = new RE2("-", "g");

const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SHORTENED_UUID_LENGTH = 22;
const HEX_UUID_REGEX = new RE2("^[0-9a-fA-F]{32}$");

export const shortenUuid = (uuid: string): string => {
  const hex = uuid.replace(DASH_REGEX, "");
  if (!HEX_UUID_REGEX.test(hex)) return hex;

  let value = BigInt(`0x${hex}`);
  const base = BigInt(BASE62_ALPHABET.length);
  let out = "";
  while (value > BigInt(0)) {
    out = BASE62_ALPHABET[Number(value % base)] + out;
    value /= base;
  }
  return out.padStart(SHORTENED_UUID_LENGTH, "0");
};

// Full UUID placeholders resolve to 32 chars (dash-stripped); {{shortCertificateId}} resolves to 22.
const UUID_TEST_VALUE = "0".repeat(32);
const SHORT_UUID_TEST_VALUE = "0".repeat(SHORTENED_UUID_LENGTH);

// Per-destination set of characters allowed in a resource name. Free-text placeholder values
// ({{commonName}} and {{applicationName}}) are sanitized to this set at compile time so a value
// like "app.example.com" can't produce a name the destination rejects (e.g. Azure Key Vault and
// Chef forbid dots). ID-based placeholders are always safe (hex or base62), so only free-text is sanitized.
const NAME_VALUE_DISALLOWED_CHARS: Partial<Record<PkiSync, RE2>> = {
  [PkiSync.AzureKeyVault]: new RE2("[^a-zA-Z0-9-]", "g"),
  [PkiSync.CloudflareCustomCertificate]: new RE2("[^a-zA-Z0-9_-]", "g"),
  [PkiSync.Chef]: new RE2("[^a-zA-Z0-9_-]", "g"),
  [PkiSync.AwsCertificateManager]: new RE2("[^a-zA-Z0-9 _-]", "g"),
  [PkiSync.AwsElasticLoadBalancer]: new RE2("[^a-zA-Z0-9 _-]", "g"),
  [PkiSync.AwsSecretsManager]: new RE2("[^a-zA-Z0-9_-]", "g"),
  [PkiSync.NetScaler]: new RE2("[^a-zA-Z0-9._-]", "g"),
  [PkiSync.F5BigIp]: new RE2("[^a-zA-Z0-9._-]", "g")
};

export const sanitizeCertificateNameValue = (value: string, destination?: PkiSync): string => {
  if (!value || !destination) return value;
  const disallowed = NAME_VALUE_DISALLOWED_CHARS[destination];
  return disallowed ? value.replace(disallowed, "-") : value;
};

export const UUID_NAME_REGEX_FRAGMENT = "[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}";

export const SHORT_UUID_NAME_REGEX_FRAGMENT = "[0-9A-Za-z]{22}";

export const certificateNameSchemaHasFreeTextPlaceholder = (schema?: string): boolean =>
  Boolean(schema && (schema.includes("{{commonName}}") || schema.includes("{{applicationName}}")));

const PLACEHOLDER_OR_CHAR_REGEX = new RE2(
  "\\{\\{(certificateId|shortCertificateId|profileId|applicationId|applicationName|commonName)\\}\\}|[\\s\\S]",
  "g"
);
const REGEX_SPECIAL_CHARS = new RE2("[\\\\^$.*+?()\\[\\]{}|/]", "g");

export const buildManagedCertificateNameRegexSource = (
  schema: string,
  fragments: { uuid: string; shortUuid: string; freeText: string }
): string => {
  const fragmentByPlaceholder: Record<string, string> = {
    certificateId: fragments.uuid,
    shortCertificateId: fragments.shortUuid,
    profileId: fragments.uuid,
    applicationId: fragments.uuid,
    applicationName: fragments.freeText,
    commonName: fragments.freeText
  };

  return schema.replace(PLACEHOLDER_OR_CHAR_REGEX, (match: string, placeholder?: string) =>
    placeholder ? fragmentByPlaceholder[placeholder] : match.replace(REGEX_SPECIAL_CHARS, "\\$&")
  );
};

export type TCertificateNameSchemaData = {
  certificateId: string;
  profileId?: string | null;
  applicationId?: string | null;
  applicationName?: string | null;
  commonName?: string | null;
};

/**
 * Compiles a certificate name schema (Handlebars template) into a concrete name.
 *
 * Supported placeholders:
 * - {{certificateId}}      - the certificate's unique ID (dashes stripped, 32 chars)
 * - {{shortCertificateId}} - the certificate's unique ID as a 22-char base62 string; use when the destination's name limit is tight
 * - {{profileId}}          - the certificate profile ID (dashes stripped); falls back to {{certificateId}} when the certificate has no profile
 * - {{applicationId}}      - the sync's application ID (dashes stripped); empty when the sync has no application
 * - {{applicationName}}    - the sync's application name, sanitized to the destination's allowed character set; empty when the sync has no application
 * - {{commonName}}         - the certificate common name (FQDN), sanitized to the destination's allowed character set
 *
 * Callers pass raw values (UUIDs with dashes, free-text names); cleaning, shortening, and
 * per-destination sanitization are centralized here so every call site produces identical names.
 */
export const compileCertificateNameSchema = (
  schema: string,
  data: TCertificateNameSchemaData,
  destination?: PkiSync
): string => {
  const certificateId = data.certificateId.replace(DASH_REGEX, "");
  const profileId = data.profileId ? data.profileId.replace(DASH_REGEX, "") : certificateId;
  const applicationId = data.applicationId ? data.applicationId.replace(DASH_REGEX, "") : "";

  return handlebars.compile(schema)({
    certificateId,
    shortCertificateId: shortenUuid(data.certificateId),
    profileId,
    applicationId,
    applicationName: sanitizeCertificateNameValue(data.applicationName || "", destination),
    commonName: sanitizeCertificateNameValue(data.commonName || "", destination)
  });
};

/**
 * Substitutes every supported placeholder with a representative test value so that a
 * destination's character/length constraints can be validated at configuration time.
 *
 * Full UUID placeholders use a 32-char value and {{shortCertificateId}} a 22-char value so the
 * compiled length is realistic (this is what catches over-length schemas, e.g. on NetScaler's
 * 63-char limit). Adding a new placeholder here makes it available to every destination's validation.
 */
export const buildCertificateNameSchemaTestName = (schema: string): string =>
  schema
    .replace(new RE2("\\{\\{shortCertificateId\\}\\}", "g"), SHORT_UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{profileId\\}\\}", "g"), UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{applicationId\\}\\}", "g"), UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{applicationName\\}\\}", "g"), "application-name")
    .replace(new RE2("\\{\\{commonName\\}\\}", "g"), "common-name");
