import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { Certificate, CertificateChainValidationEngine, CryptoEngine, NameConstraints } from "pkijs";

import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import {
  CERT_EXTENDED_KEY_USAGES,
  CertExtendedKeyUsageType
} from "@app/services/certificate-common/certificate-constants";

type TNativeX509 = InstanceType<typeof crypto.nativeCrypto.X509Certificate>;

export type TVerifyClientCertificateChainResult =
  | { ok: true }
  | {
      ok: false;
      reasonCode:
        | "ca_verification_failed"
        | "certificate_expired"
        | "certificate_not_yet_valid"
        | "issuer_client_auth_usage_not_allowed"
        | "name_constraint_violation"
        | "path_length_exceeded";
    };

type TVerificationFailure = Extract<TVerifyClientCertificateChainResult, { ok: false }>;

const NAME_CONSTRAINTS_EXTENSION_OID = "2.5.29.30";

const CLIENT_AUTH_EKU_OID = CERT_EXTENDED_KEY_USAGES[CertExtendedKeyUsageType.CLIENT_AUTH].oid;
const ANY_PURPOSE_EKU_OID = CERT_EXTENDED_KEY_USAGES[CertExtendedKeyUsageType.ANY_PURPOSE].oid;

const PERMITTED_SUBTREE_VIOLATION_CODE = 41;
const EXCLUDED_SUBTREE_VIOLATION_CODE = 42;

// Caps on how much of a presented chain the path search will explore. See `explore` below.
const MAX_CANDIDATE_PATHS = 8;
const MAX_SEARCH_PATH_STEPS = 2000;

const pkiCryptoEngine = new CryptoEngine({ name: "identity-tls-cert-auth", crypto: webcrypto as Crypto });

const isWithinValidityWindow = (cert: TNativeX509, at: Date): boolean =>
  new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);

const isSelfIssued = (cert: TNativeX509): boolean => cert.subject === cert.issuer;

const basicConstraintsPathLength = (cert: TNativeX509): number | undefined =>
  new x509.X509Certificate(cert.raw).getExtension(x509.BasicConstraintsExtension)?.pathLength;

/**
 * RFC 5280 6.1.4 (l)/(m): a CA's `pathLenConstraint` caps how many non-self-issued CA certificates
 * may follow it on the path, not counting the end-entity certificate. A CA that omits the field is
 * unconstrained.
 *
 * @param orderedPath leaf first, then each issuer in turn, trust anchor last
 */
const enforcePathLength = (orderedPath: TNativeX509[]): TVerificationFailure | null => {
  const issuers = orderedPath.slice(1);

  const exceeded = issuers.some((issuer, idx) => {
    const pathLength = basicConstraintsPathLength(issuer);
    if (pathLength === undefined) return false;
    return issuers.slice(0, idx).filter((below) => !isSelfIssued(below)).length > pathLength;
  });

  return exceeded ? { ok: false, reasonCode: "path_length_exceeded" } : null;
};

const nameConstraintsOf = (cert: Certificate): NameConstraints | null => {
  const extension = cert.extensions?.find((ext) => ext.extnID === NAME_CONSTRAINTS_EXTENSION_OID);
  return extension?.parsedValue instanceof NameConstraints ? extension.parsedValue : null;
};

/**
 * RFC 5280 6.1.4 (g): a CA may restrict the namespace its subordinates can certify. Without this,
 * the holder of a constrained sub-CA under the configured anchor could mint a leaf for any name and
 * authenticate as any identity pinned to that anchor.
 *
 * Subtree matching (DNS/IP/email/URI/directory-name semantics, permitted and excluded) is delegated
 * to pkijs rather than reimplemented. pkijs applies constraints carried by certificates on the path
 * but not by the trust anchor itself, so the anchor's own constraints are supplied separately as the
 * RFC's initial-permitted/excluded-subtrees inputs. That matters because operators may pin a
 * constrained sub-CA directly rather than the root above it.
 *
 * Only runs when some certificate on the path actually asserts constraints, so a chain that has
 * none is validated exactly as before.
 */
const enforceNameConstraints = async (orderedPath: TNativeX509[], now: Date): Promise<TVerificationFailure | null> => {
  if (orderedPath.length < 2) return null;

  const parsedPath = orderedPath.map((cert) => Certificate.fromBER(cert.raw));
  if (!parsedPath.some((cert) => nameConstraintsOf(cert))) return null;

  const anchor = parsedPath[parsedPath.length - 1];
  const anchorConstraints = nameConstraintsOf(anchor);

  const engine = new CertificateChainValidationEngine({
    trustedCerts: [anchor],
    // pkijs takes the chain end-entity last.
    certs: parsedPath.slice(0, -1).reverse(),
    checkDate: now
  });

  const { result, resultCode } = await engine.verify(
    {
      initialPermittedSubtreesSet: anchorConstraints?.permittedSubtrees ?? [],
      initialExcludedSubtreesSet: anchorConstraints?.excludedSubtrees ?? []
    },
    pkiCryptoEngine
  );

  if (result) return null;
  if (resultCode === PERMITTED_SUBTREE_VIOLATION_CODE || resultCode === EXCLUDED_SUBTREE_VIOLATION_CODE) {
    return { ok: false, reasonCode: "name_constraint_violation" };
  }
  return { ok: false, reasonCode: "ca_verification_failed" };
};

/**
 * RFC 5280 4.2.1.12: an Extended Key Usage extension is the exhaustive list of purposes its
 * certificate may be used for. Without this check a leaf issued for serverAuth or codeSigning
 * authenticates an identity, so anyone holding a server certificate under the configured CA can
 * impersonate the machine identity pinned to it.
 *
 * A certificate that omits the extension is unconstrained and stays accepted, which is how OpenSSL
 * and Go read a missing EKU and what keeps existing leaves that carry no EKU working. Only a
 * certificate that explicitly enumerates purposes and leaves client authentication out is rejected.
 *
 * Node's X509Certificate is OpenSSL-backed and accepts DER that @peculiar/x509 rejects, so a
 * certificate can parse at the edge and still fail here. Reading the extension is what establishes
 * that client authentication is permitted, so a certificate whose extensions cannot be read has not
 * established it and is denied rather than failing the request as an internal error.
 */
export const permitsClientAuth = (cert: TNativeX509): boolean => {
  let usages: readonly string[] | undefined;
  try {
    usages = new x509.X509Certificate(cert.raw).getExtension(x509.ExtendedKeyUsageExtension)?.usages;
  } catch (err) {
    logger.warn(err, `TLS certificate auth: could not read extended key usage [subject=${cert.subject}]`);
    return false;
  }
  if (!usages) return true;
  return usages.some((oid) => oid === CLIENT_AUTH_EKU_OID || oid === ANY_PURPOSE_EKU_OID);
};

/**
 * Validate the presented client certificate chain against a configured trust anchor.
 *
 * Unlike single-hop verification (leaf signed directly by the configured CA), this builds paths
 * from the leaf through the presented intermediates up to the configured trust anchor and accepts
 * the client if any one of them is valid end to end. A path is valid when every hop has a real
 * issuer relationship (subject/issuer match + signature), every issuer is a CA (including the
 * trust anchor itself) that is within its validity window and whose extended key usage permits
 * client authentication, and the path as a whole satisfies the RFC 5280 delegation constraints its
 * CAs assert: `pathLenConstraint` and name constraints.
 *
 * Every one of those checks participates in path selection. A cross-signed PKI presents the same
 * logical CA under more than one issuer, so a single certificate can sit on both a path that
 * violates a constraint and a path that satisfies it; committing to the first path that is merely
 * cryptographically sound would deny a client that has a perfectly good path available. Checks that
 * belong to a single certificate (validity, extended key usage) prune the branch they fail on, and
 * the path-wide constraints are applied to each complete path in turn until one passes.
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
export const verifyClientCertificateChain = async ({
  leaf,
  presentedChain,
  trustAnchor,
  now = new Date()
}: {
  leaf: TNativeX509;
  presentedChain: TNativeX509[];
  trustAnchor: TNativeX509;
  now?: Date;
}): Promise<TVerifyClientCertificateChainResult> => {
  const certificateIds = new Map<TNativeX509, string>();
  const certificateId = (cert: TNativeX509): string => {
    const cached = certificateIds.get(cert);
    if (cached !== undefined) return cached;
    const id = cert.raw.toString("base64");
    certificateIds.set(cert, id);
    return id;
  };

  const anchorId = certificateId(trustAnchor);
  const isAnchor = (cert: TNativeX509): boolean => certificateId(cert) === anchorId;

  /**
   * Returns true when `issuer` issued `child`.
   *
   * The name check compares the OpenSSL-formatted DN strings returned by Node's X509Certificate
   * (`child.issuer === issuer.subject`). This is a fast pre-filter before the cryptographic
   * `verify`, and assumes both sides of the chain share the same PKI-level DN encoding
   * conventions, i.e. the same string types (PrintableString vs UTF8String) and attribute
   * ordering for equivalent names. That holds within a single PKI (SPIRE emits the leaf and the
   * rotating intermediate from one CA with consistent encoding), which is the supported case here.
   *
   * It can yield a false negative in a heterogeneous PKI where the issuer and subject encode the
   * same logical DN differently (e.g. one cert uses PrintableString and the other UTF8String for an
   * attribute, or they differ in attribute ordering). In that situation a cryptographically valid
   * issuer relationship is rejected and chain validation fails with `ca_verification_failed`. A
   * full RFC 5280 name comparison (per-RDN, encoding-insensitive) would be required to support that.
   *
   * Results are cached per (child, issuer) pair, so overlapping paths through a shared issuer cost
   * one signature verification rather than one per path.
   */
  const signatureResults = new Map<string, boolean>();
  const issuedBy = (child: TNativeX509, issuer: TNativeX509): boolean => {
    if (child.issuer !== issuer.subject) return false;

    const pairId = `${certificateId(child)}:${certificateId(issuer)}`;
    const cached = signatureResults.get(pairId);
    if (cached !== undefined) return cached;

    let verified: boolean;
    try {
      verified = child.verify(issuer.publicKey);
    } catch {
      verified = false;
    }
    signatureResults.set(pairId, verified);
    return verified;
  };

  const clientAuthResults = new Map<string, boolean>();
  const issuerPermitsClientAuth = (cert: TNativeX509): boolean => {
    const id = certificateId(cert);
    const cached = clientAuthResults.get(id);
    if (cached !== undefined) return cached;
    const permitted = permitsClientAuth(cert);
    clientAuthResults.set(id, permitted);
    return permitted;
  };

  const validityFailure = (cert: TNativeX509): TVerificationFailure | null =>
    isWithinValidityWindow(cert, now)
      ? null
      : {
          ok: false,
          reasonCode: now < new Date(cert.validFrom) ? "certificate_not_yet_valid" : "certificate_expired"
        };

  /**
   * The gate every issuer clears before it may extend a path. Both properties belong to the
   * certificate alone rather than to the path it sits on, so failing one rules out this branch
   * only: another issuer of the same certificate can still complete a path.
   *
   * An EKU on a CA restricts what its subordinates may be used for, so a CA that enumerates
   * purposes without client authentication cannot delegate it, the way OpenSSL and Go check a
   * purpose against the whole chain rather than the leaf alone.
   */
  const issuerFailure = (issuer: TNativeX509): TVerificationFailure | null =>
    validityFailure(issuer) ??
    (issuerPermitsClientAuth(issuer) ? null : { ok: false, reasonCode: "issuer_client_auth_usage_not_allowed" });

  const leafFailure = validityFailure(leaf);
  if (leafFailure) return leafFailure;

  const candidateIssuers: TNativeX509[] = [];
  const seenCandidates = new Set<string>();
  presentedChain.forEach((cert) => {
    const id = certificateId(cert);
    if (!seenCandidates.has(id) && !isAnchor(cert)) {
      seenCandidates.add(id);
      candidateIssuers.push(cert);
    }
  });

  const completePaths: TNativeX509[][] = [];
  const search = { steps: 0, truncated: false, prunedFailure: null as TVerificationFailure | null };

  /**
   * Depth-first enumeration of the paths from the leaf to the trust anchor.
   *
   * @param current the certificate whose issuers are being looked for
   * @param path    the path built so far, leaf first and `current` last
   * @param visited ids of the certificates already on `path`, so a cross-signing loop terminates
   */
  const explore = (current: TNativeX509, path: TNativeX509[], visited: Set<string>): void => {
    if (completePaths.length >= MAX_CANDIDATE_PATHS || search.steps >= MAX_SEARCH_PATH_STEPS) {
      search.truncated = true;
      return;
    }
    search.steps += 1;

    if (isAnchor(current)) {
      completePaths.push(path);
      return;
    }

    if (trustAnchor.ca && issuedBy(current, trustAnchor)) {
      const anchorFailure = issuerFailure(trustAnchor);
      if (anchorFailure) search.prunedFailure ??= anchorFailure;
      else completePaths.push([...path, trustAnchor]);
    }

    candidateIssuers
      .filter((candidate) => !visited.has(certificateId(candidate)) && candidate.ca && issuedBy(current, candidate))
      .forEach((candidate) => {
        const candidateFailure = issuerFailure(candidate);
        if (candidateFailure) {
          search.prunedFailure ??= candidateFailure;
          return;
        }
        explore(candidate, [...path, candidate], new Set(visited).add(certificateId(candidate)));
      });
  };

  explore(leaf, [leaf], new Set([certificateId(leaf)]));

  const reportFailure = (failure: TVerificationFailure): TVerificationFailure => {
    if (search.truncated) {
      logger.warn(
        `TLS certificate auth: path search hit its exploration cap before finding a valid path [presentedCertificates=${presentedChain.length}] [pathsFound=${completePaths.length}]`
      );
    }
    return failure;
  };

  if (!completePaths.length) {
    return reportFailure(search.prunedFailure ?? { ok: false, reasonCode: "ca_verification_failed" });
  }

  const orderedPaths = completePaths.sort((a, b) => a.length - b.length);
  let constraintFailure: TVerificationFailure | null = null;

  try {
    for (const path of orderedPaths) {
      const pathLengthFailure = enforcePathLength(path);
      // eslint-disable-next-line no-await-in-loop -- stop at the first path that validates
      const failure = pathLengthFailure ?? (await enforceNameConstraints(path, now));
      if (!failure) return { ok: true };
      constraintFailure ??= failure;
    }
  } catch {
    return { ok: false, reasonCode: "ca_verification_failed" };
  }

  return reportFailure(constraintFailure ?? { ok: false, reasonCode: "ca_verification_failed" });
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
