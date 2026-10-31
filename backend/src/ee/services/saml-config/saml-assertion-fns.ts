// node-saml parses with xml2js explicitArray and explicitCharkey: every child is an array, a text node is
// { _: "value" }, XML attributes sit under "$", and the root is either the Assertion or a Response wrapping one.
export const samlXmlChildren = (node: unknown, name: string): unknown[] => {
  if (!node || typeof node !== "object") return [];
  const value = (node as Record<string, unknown>)[name];
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const xmlAttribute = (node: unknown, name: string): string | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const value = (node as { $?: Record<string, unknown> }).$?.[name];
  return typeof value === "string" ? value : undefined;
};

export const getSamlAssertionNode = (parsedAssertion: unknown): unknown =>
  samlXmlChildren(parsedAssertion, "Assertion")[0] ??
  samlXmlChildren(samlXmlChildren(parsedAssertion, "Response")[0], "Assertion")[0] ??
  parsedAssertion;

const parseTimestamp = (value: string | undefined) => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
};

// The latest NotOnOrAfter in the assertion bounds how long node-saml would still accept it, so it is how long
// the assertion ID has to be remembered to refuse a replay.
export const getSamlAssertionReplayDetails = (parsedAssertion: unknown) => {
  const assertion = getSamlAssertionNode(parsedAssertion);
  const assertionId = xmlAttribute(assertion, "ID")?.trim() || undefined;
  const issuedAt = parseTimestamp(xmlAttribute(assertion, "IssueInstant"));

  const expiries = [
    ...samlXmlChildren(assertion, "Conditions"),
    ...samlXmlChildren(assertion, "Subject")
      .flatMap((subject) => samlXmlChildren(subject, "SubjectConfirmation"))
      .flatMap((confirmation) => samlXmlChildren(confirmation, "SubjectConfirmationData"))
  ]
    .map((node) => parseTimestamp(xmlAttribute(node, "NotOnOrAfter"))?.getTime())
    .filter((timestamp): timestamp is number => timestamp !== undefined);

  return {
    assertionId,
    issuedAt,
    expiresAt: expiries.length ? new Date(Math.max(...expiries)) : undefined
  };
};

// node-saml accepts no clock skew, so the margin only covers the gap between its check and the claim.
const SAML_ASSERTION_REPLAY_MARGIN_MS = 60 * 1000;
// node-saml accepts an assertion with no NotOnOrAfter indefinitely, which no replay record could cover. The SAML
// profile requires one, but some IdPs omit it, so instead of refusing those logins we accept such an assertion
// for this long after its IssueInstant and remember its ID for that same window.
export const SAML_ASSERTION_FALLBACK_WINDOW_MS = 60 * 60 * 1000;

export type TSamlAssertionReplayWindow =
  | { accepted: true; ttlSeconds: number }
  | { accepted: false; reason: "missing-timestamps" | "expired" };

export const getSamlAssertionReplayWindow = (
  { expiresAt, issuedAt }: { expiresAt?: Date; issuedAt?: Date },
  now = Date.now()
): TSamlAssertionReplayWindow => {
  let acceptedUntil: number;
  if (expiresAt) {
    acceptedUntil = expiresAt.getTime();
  } else if (issuedAt) {
    acceptedUntil = issuedAt.getTime() + SAML_ASSERTION_FALLBACK_WINDOW_MS;
  } else {
    return { accepted: false, reason: "missing-timestamps" };
  }

  const rememberUntil = acceptedUntil + SAML_ASSERTION_REPLAY_MARGIN_MS;
  if (rememberUntil <= now) return { accepted: false, reason: "expired" };

  return { accepted: true, ttlSeconds: Math.ceil((rememberUntil - now) / 1000) };
};
