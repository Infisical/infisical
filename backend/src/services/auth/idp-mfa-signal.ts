import { getSamlAssertionNode, samlXmlChildren } from "@app/ee/services/saml-config/saml-assertion-fns";

// "amr" is the OIDC Core claim name. SAML has no standard attribute name, so the Okta convention is the default.
const DEFAULT_MFA_CLAIM_NAME = "amr";

// Entra ID reports a push or TOTP login as Password in AuthnContextClassRef and puts multipleauthn only in this
// attribute, which it sends without configuration, so it is the default for Entra configs.
const SAML_PROVIDER_MFA_SIGNAL_ATTRIBUTES: Record<string, string> = {
  "azure-saml": "http://schemas.microsoft.com/claims/authnmethodsreferences"
};

// RFC 8176 value for a completed multi-factor login; Okta, Entra ID, Auth0, Google and Duo all emit it.
const DEFAULT_OIDC_MFA_CLAIM_VALUES = ["mfa"];

// Only classes whose definition asserts two factors: SmartcardPKI's schema requires a card plus an
// ActivationPin, alongside MobileTwoFactorContract, the REFEDS MFA profile and Entra ID's satisfied-MFA class.
// Possession-only classes such as Smartcard, SoftwarePKI and TimeSyncToken (its schema requires only the token),
// and single-factor ones such as PasswordProtectedTransport and MobileTwoFactorUnregistered, are deliberately
// absent; an org that knows its IdP only issues them after MFA adds them to `mfaAuthnContexts`.
const DEFAULT_SAML_MFA_AUTHN_CONTEXTS = [
  "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
  "urn:oasis:names:tc:SAML:2.0:ac:classes:SmartcardPKI",
  "https://refeds.org/profile/mfa",
  "http://schemas.microsoft.com/claims/multipleauthn"
];

// The RFC 8176 value, plus the URI Entra ID uses in its authnmethodsreferences claim.
const SAML_MFA_ATTRIBUTE_VALUES = ["mfa", "http://schemas.microsoft.com/claims/multipleauthn"];

// The assertion is signed, but a misbehaving IdP could still send an absurd number of values.
const MAX_SIGNAL_VALUES = 50;
const MAX_SIGNAL_VALUE_LENGTH = 512;

// `evidence` is what matched the accepted values and decided `verified`; `received` is everything the IdP sent in
// the fields that were read, so an admin can see why a login was not trusted and which value to accept.
export type TIdpMfaSignal = {
  verified: boolean;
  evidence: string[];
  received: string[];
};

type TSamlMfaSignalConfig = {
  authProvider?: string | null;
  mfaSignalAttribute?: string | null;
  mfaAuthnContexts?: string[] | null;
};

type TOidcMfaSignalConfig = {
  mfaClaimName?: string | null;
  mfaAmrValues?: string[] | null;
};

type TIdpMfaSignalInput =
  | {
      kind: "saml";
      authnContextClassRefs: string[];
      attributes?: Record<string, unknown> | null;
      config?: TSamlMfaSignalConfig | null;
    }
  | {
      kind: "oidc";
      claims: Record<string, unknown>;
      config?: TOidcMfaSignalConfig | null;
    };

const toStringList = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= MAX_SIGNAL_VALUE_LENGTH)
    .slice(0, MAX_SIGNAL_VALUES);
};

const matchingValues = (values: string[], accepted: string[]) => {
  const acceptedSet = new Set(accepted.map((item) => item.trim().toLowerCase()));
  return values.filter((value) => acceptedSet.has(value.toLowerCase()));
};

const findKey = (record: Record<string, unknown>, name: string) => {
  const wanted = name.trim().toLowerCase();
  return Object.keys(record).find((key) => key.toLowerCase() === wanted);
};

export const matchIdpMfaSignal = (input: TIdpMfaSignalInput): TIdpMfaSignal => {
  if (input.kind === "oidc") {
    const claimName = input.config?.mfaClaimName?.trim() || DEFAULT_MFA_CLAIM_NAME;
    const claimKey = findKey(input.claims, claimName);
    const accepted = [...DEFAULT_OIDC_MFA_CLAIM_VALUES, ...(input.config?.mfaAmrValues ?? [])];
    const received = claimKey ? toStringList(input.claims[claimKey]) : [];
    const evidence = matchingValues(received, accepted);
    return { verified: evidence.length > 0, evidence, received };
  }

  const acceptedContexts = [...DEFAULT_SAML_MFA_AUTHN_CONTEXTS, ...(input.config?.mfaAuthnContexts ?? [])];
  const receivedContexts = toStringList(input.authnContextClassRefs);
  const evidence = matchingValues(receivedContexts, acceptedContexts);

  const attributes = input.attributes ?? {};
  const attributeName =
    input.config?.mfaSignalAttribute?.trim() ||
    SAML_PROVIDER_MFA_SIGNAL_ATTRIBUTES[input.config?.authProvider ?? ""] ||
    DEFAULT_MFA_CLAIM_NAME;
  const attributeKey = findKey(attributes, attributeName);
  const receivedAttributeValues = attributeKey ? toStringList(attributes[attributeKey]) : [];
  matchingValues(receivedAttributeValues, SAML_MFA_ATTRIBUTE_VALUES).forEach((value) => {
    evidence.push(`${attributeKey}=${value}`);
  });

  const received = [...receivedContexts, ...receivedAttributeValues.map((value) => `${attributeKey}=${value}`)].slice(
    0,
    MAX_SIGNAL_VALUES
  );

  return { verified: evidence.length > 0, evidence, received };
};

const textOf = (node: unknown): string | undefined => {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "_" in node && typeof (node as { _: unknown })._ === "string") {
    return (node as { _: string })._;
  }
  return undefined;
};

export const extractSamlAuthnContextClassRefs = (parsedAssertion: unknown): string[] => {
  return samlXmlChildren(getSamlAssertionNode(parsedAssertion), "AuthnStatement")
    .flatMap((statement) => samlXmlChildren(statement, "AuthnContext"))
    .flatMap((context) => samlXmlChildren(context, "AuthnContextClassRef"))
    .map(textOf)
    .filter((value): value is string => Boolean(value));
};
