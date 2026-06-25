import handlebars from "handlebars";
import RE2 from "re2";

import { PkiSync } from "./pki-sync-enums";

const DASH_REGEX = new RE2("-", "g");

// A dash-stripped UUID is exactly 32 hex chars. The validation test name uses this so a
// schema's real compiled length (e.g. two UUID placeholders = 64+ chars) is checked against
// each destination's limit at configuration time instead of failing silently at sync time.
const UUID_TEST_VALUE = "00000000000000000000000000000000";

// Per-destination set of characters allowed in a resource name. Free-text placeholder values
// (currently {{commonName}}) are sanitized to this set at compile time so a FQDN like
// "app.example.com" can't produce a name the destination rejects (e.g. Azure Key Vault and
// Chef forbid dots). UUID-based placeholders are always safe (hex), so only free-text is sanitized.
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

export const certificateNameSchemaHasFreeTextPlaceholder = (schema?: string): boolean =>
  Boolean(schema && schema.includes("{{commonName}}"));

const PLACEHOLDER_OR_CHAR_REGEX = new RE2(
  "\\{\\{(certificateId|profileId|applicationId|commonName)\\}\\}|[\\s\\S]",
  "g"
);
const REGEX_SPECIAL_CHARS = new RE2("[\\\\^$.*+?()\\[\\]{}|/]", "g");

export const buildManagedCertificateNameRegexSource = (
  schema: string,
  fragments: { uuid: string; commonName: string }
): string => {
  const fragmentByPlaceholder: Record<string, string> = {
    certificateId: fragments.uuid,
    profileId: fragments.uuid,
    applicationId: fragments.uuid,
    commonName: fragments.commonName
  };

  return schema.replace(PLACEHOLDER_OR_CHAR_REGEX, (match: string, placeholder?: string) =>
    placeholder ? fragmentByPlaceholder[placeholder] : match.replace(REGEX_SPECIAL_CHARS, "\\$&")
  );
};

export type TCertificateNameSchemaData = {
  certificateId: string;
  profileId?: string | null;
  applicationId?: string | null;
  commonName?: string | null;
};

/**
 * Compiles a certificate name schema (Handlebars template) into a concrete name.
 *
 * Supported placeholders:
 * - {{certificateId}} - the certificate's unique ID (dashes stripped)
 * - {{profileId}}     - the certificate profile ID (dashes stripped); falls back to {{certificateId}} when the certificate has no profile
 * - {{applicationId}} - the sync's application ID (dashes stripped); empty when the sync has no application
 * - {{commonName}}    - the certificate common name (FQDN), sanitized to the destination's allowed character set
 *
 * Callers pass raw values (UUIDs with dashes); cleaning and per-destination sanitization are
 * centralized here so every call site produces identical names.
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
    profileId,
    applicationId,
    commonName: sanitizeCertificateNameValue(data.commonName || "", destination)
  });
};

/**
 * Substitutes every supported placeholder with a representative test value so that a
 * destination's character/length constraints can be validated at configuration time.
 *
 * UUID-based placeholders use a full 32-char value so the compiled length is realistic
 * (this is what catches over-length schemas, e.g. on NetScaler's 63-char limit).
 * Adding a new placeholder here makes it available to every destination's validation.
 */
export const buildCertificateNameSchemaTestName = (schema: string): string =>
  schema
    .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{profileId\\}\\}", "g"), UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{applicationId\\}\\}", "g"), UUID_TEST_VALUE)
    .replace(new RE2("\\{\\{commonName\\}\\}", "g"), "common-name");
