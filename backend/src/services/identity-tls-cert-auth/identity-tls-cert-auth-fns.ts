import { crypto } from "@app/lib/crypto/cryptography";

type TNativeX509 = InstanceType<typeof crypto.nativeCrypto.X509Certificate>;

export type TVerifyClientCertificateChainResult =
  | { ok: true }
  | { ok: false; reasonCode: "ca_verification_failed" | "certificate_expired" | "certificate_not_yet_valid" };

const isWithinValidityWindow = (cert: TNativeX509, at: Date): boolean =>
  new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);

/**
 * Validate the presented client certificate chain against a configured trust anchor.
 *
 * Unlike single-hop verification (leaf signed directly by the configured CA), this builds a
 * path from the leaf through the presented intermediates up to the configured trust anchor and
 * verifies, at every hop: the issuer relationship (subject/issuer match + signature), that each
 * issuer is a CA (including the trust anchor itself), and that every certificate on the path is
 * within its validity window.
 *
 * The trust anchor is the only trusted input. Presented intermediates are untrusted: a forged or
 * unrelated intermediate cannot create a path to the anchor, so it is rejected. This mirrors how
 * SPIFFE consumers (e.g. Envoy, Vault) validate X.509-SVID chains and lets an operator pin a
 * stable root while the issuing intermediate rotates underneath it.
 *
 * NOTE: each hop's issuer/subject match is a string comparison of the OpenSSL-formatted DN strings,
 * so this assumes every certificate on the path shares the same PKI-level DN encoding conventions
 * (string types and attribute ordering). See `issuedBy` below for the heterogeneous-PKI caveat.
 *
 * @param leaf            the end-entity certificate presented by the client (chain[0])
 * @param presentedChain  intermediates presented by the client (chain[1..n]); order-independent
 * @param trustAnchor     the configured CA certificate to anchor the path on
 */
export const verifyClientCertificateChain = ({
  leaf,
  presentedChain,
  trustAnchor,
  now = new Date()
}: {
  leaf: TNativeX509;
  presentedChain: TNativeX509[];
  trustAnchor: TNativeX509;
  now?: Date;
}): TVerifyClientCertificateChainResult => {
  // Candidate issuers the builder may walk through. The trust anchor is always available; the
  // presented intermediates are untrusted candidates that only matter if they help reach the anchor.
  const anchorRaw = trustAnchor.raw;
  const isAnchor = (cert: TNativeX509): boolean => cert.raw.equals(anchorRaw);

  /**
   * Returns true when `issuer` issued `child`.
   *
   * The name check compares the OpenSSL-formatted DN strings returned by Node's X509Certificate
   * (`child.issuer === issuer.subject`). This is a fast pre-filter before the cryptographic
   * `verify`, and assumes both sides of the chain share the same PKI-level DN encoding
   * conventions — i.e. the same string types (PrintableString vs UTF8String) and attribute
   * ordering for equivalent names. That holds within a single PKI (SPIRE emits the leaf and the
   * rotating intermediate from one CA with consistent encoding), which is the supported case here.
   *
   * It can yield a false negative in a heterogeneous PKI where the issuer and subject encode the
   * same logical DN differently (e.g. one cert uses PrintableString and the other UTF8String for an
   * attribute, or they differ in attribute ordering). In that situation a cryptographically valid
   * issuer relationship is rejected and chain validation fails with `ca_verification_failed`. A
   * full RFC 5280 name comparison (per-RDN, encoding-insensitive) would be required to support that.
   */
  const issuedBy = (child: TNativeX509, issuer: TNativeX509): boolean => {
    if (child.issuer !== issuer.subject) return false;
    try {
      return child.verify(issuer.publicKey);
    } catch {
      return false;
    }
  };

  // Cache results by DER bytes, so a shared issuer is explored once regardless of how many paths
  // reach it. This bounds signature verification to O(n^2) and avoids factorial work for crafted
  // chains with many overlapping paths.
  const results = new Map<string, TVerifyClientCertificateChainResult>();
  const inProgress = new Set<string>();
  const certificateId = (cert: TNativeX509) => cert.raw.toString("base64");

  const walk = (current: TNativeX509): TVerifyClientCertificateChainResult => {
    const currentId = certificateId(current);
    const cachedResult = results.get(currentId);
    if (cachedResult) return cachedResult;
    if (inProgress.has(currentId)) return { ok: false, reasonCode: "ca_verification_failed" };

    inProgress.add(currentId);
    let result: TVerifyClientCertificateChainResult;

    if (!isWithinValidityWindow(current, now)) {
      result = {
        ok: false,
        reasonCode: now < new Date(current.validFrom) ? "certificate_not_yet_valid" : "certificate_expired"
      };
    } else if (isAnchor(current)) {
      // Reached the trust anchor: the path is complete and valid.
      result = { ok: true };
    } else if (trustAnchor.ca && issuedBy(current, trustAnchor)) {
      // The configured anchor directly issued the current certificate. The anchor must itself be a
      // CA to sign certificates: presented intermediates are gated on `candidate.ca` below, and the
      // trust anchor is held to the same bar so a non-CA cert can't anchor a path. Without this, a
      // configured end-entity (CA:FALSE) certificate would still be accepted as the leaf's issuer.
      if (!isWithinValidityWindow(trustAnchor, now)) {
        result = {
          ok: false,
          reasonCode: now < new Date(trustAnchor.validFrom) ? "certificate_not_yet_valid" : "certificate_expired"
        };
      } else {
        result = { ok: true };
      }
    } else {
      // No path to the anchor was found through this node. Default to the generic reason, but
      // surface a more specific validity failure if the only viable issuer was rejected for being
      // outside its validity window (so an expired/not-yet-valid intermediate is reported as such).
      result = { ok: false, reasonCode: "ca_verification_failed" };

      for (const candidate of presentedChain) {
        // An issuer on the path must be a CA and have signed the current certificate.
        if (candidate.ca && issuedBy(current, candidate)) {
          const candidateResult = walk(candidate);
          if (candidateResult.ok) {
            result = candidateResult;
            break;
          }
          if (candidateResult.reasonCode !== "ca_verification_failed") {
            result = candidateResult;
          }
        }
      }
    }

    inProgress.delete(currentId);
    results.set(currentId, result);
    return result;
  };

  return walk(leaf);
};

export const parseSubjectDetails = (data?: string | null) => {
  const values: Record<string, string> = {};
  if (!data) return values;
  data.split("\n").forEach((el) => {
    const eqIdx = el.indexOf("=");
    if (eqIdx === -1) return;
    const key = el.slice(0, eqIdx).trim();
    // Slice on the first "=" only so values that themselves contain "=" are preserved.
    const value = el.slice(eqIdx + 1).trim();
    if (key && value) {
      values[key] = value;
    }
  });
  return values;
};

type CanonicalSanType = "dns" | "ip" | "email" | "uri";

export type TCertificateSanItem = { type: string; value: string };

const peculiarTypeToCanonical = (type: string): CanonicalSanType | null => {
  switch (type.trim().toLowerCase()) {
    case "dns":
      return "dns";
    case "ip":
      return "ip";
    case "email":
      return "email";
    // peculiar represents URI SANs (e.g. SPIFFE IDs) under the "url" type.
    case "url":
      return "uri";
    default:
      return null;
  }
};

const allowedPrefixToCanonical = (prefix: string): CanonicalSanType | null => {
  switch (prefix.trim().toLowerCase()) {
    case "dns":
      return "dns";
    case "ip":
      return "ip";
    case "email":
      return "email";
    case "uri":
    case "url":
      return "uri";
    default:
      return null;
  }
};

const normalizeSanValue = (type: CanonicalSanType, value: string): string => {
  const trimmed = value.normalize("NFC").trim();
  // DNS names are case-insensitive (RFC 5280).
  if (type === "dns") return trimmed.toLowerCase();
  // For email, only the domain part is case-insensitive (RFC 5321). Lowercasing the
  // local-part would weaken the allow-list (it would accept addresses differing only in
  // local-part casing), so preserve it and lowercase the domain only.
  if (type === "email") {
    const atIdx = trimmed.lastIndexOf("@");
    if (atIdx === -1) return trimmed;
    return `${trimmed.slice(0, atIdx)}@${trimmed.slice(atIdx + 1).toLowerCase()}`;
  }
  // URI and IP values are matched exactly.
  return trimmed;
};

const toCanonicalSan = (type: CanonicalSanType, value: string): string => `${type}:${normalizeSanValue(type, value)}`;

export const parseCertificateSubjectAltNames = (sanItems?: ReadonlyArray<TCertificateSanItem>): string[] => {
  if (!sanItems) return [];
  const tokens: string[] = [];
  for (const item of sanItems) {
    const type = peculiarTypeToCanonical(item.type);
    if (type && item.value.trim()) tokens.push(toCanonicalSan(type, item.value));
  }
  return tokens;
};

export const normalizeAllowedSubjectAltName = (allowedSan: string): string | null => {
  const trimmed = allowedSan.trim();
  if (!trimmed) return null;

  const separatorIdx = trimmed.indexOf(":");
  if (separatorIdx !== -1) {
    const type = allowedPrefixToCanonical(trimmed.slice(0, separatorIdx));
    if (type) {
      return toCanonicalSan(type, trimmed.slice(separatorIdx + 1));
    }
  }

  return toCanonicalSan("dns", trimmed);
};

export const isValidAllowedSubjectAltNameEntry = (entry: string): boolean => {
  const trimmed = entry.trim();
  if (!trimmed) return false;

  const separatorIdx = trimmed.indexOf(":");
  if (separatorIdx === -1) return true; // bare DNS name

  // Has a colon: the text before the first colon must be a recognized type prefix.
  return allowedPrefixToCanonical(trimmed.slice(0, separatorIdx)) !== null;
};

export const isSubjectAltNameAllowed = (
  allowedSubjectAltNames: ReadonlyArray<string>,
  certificateSanItems?: ReadonlyArray<TCertificateSanItem>
): boolean => {
  const certificateSans = new Set(parseCertificateSubjectAltNames(certificateSanItems));
  if (certificateSans.size === 0) return false;

  return allowedSubjectAltNames
    .map(normalizeAllowedSubjectAltName)
    .filter((san): san is string => san !== null)
    .some((allowedSan) => certificateSans.has(allowedSan));
};

export const serializeAllowedSubjectAltNames = (entries?: ReadonlyArray<string> | null): string | null | undefined => {
  if (entries === undefined) return undefined;
  if (entries === null || entries.length === 0) return null;
  return JSON.stringify(entries);
};

export const parseAllowedSubjectAltNames = (stored?: string | null): string[] => {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string");
    return [];
  } catch {
    return [];
  }
};
