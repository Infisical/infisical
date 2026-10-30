import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import {
  AltName,
  Certificate,
  CertificateChainValidationEngine,
  CryptoEngine,
  GeneralSubtree,
  id_CertificatePolicies,
  id_InhibitAnyPolicy,
  id_PolicyConstraints,
  id_PolicyMappings,
  NameConstraints
} from "pkijs";

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
        | "issuer_certificate_expired"
        | "issuer_certificate_not_yet_valid"
        | "issuer_client_auth_usage_not_allowed"
        | "name_constraint_violation"
        | "path_length_exceeded"
        | "unsupported_name_constraint";
    };

type TVerificationFailure = Extract<TVerifyClientCertificateChainResult, { ok: false }>;

const NAME_CONSTRAINTS_EXTENSION_OID = "2.5.29.30";
const SUBJECT_ALT_NAME_EXTENSION_OID = "2.5.29.17";

const CLIENT_AUTH_EKU_OID = CERT_EXTENDED_KEY_USAGES[CertExtendedKeyUsageType.CLIENT_AUTH].oid;
const ANY_PURPOSE_EKU_OID = CERT_EXTENDED_KEY_USAGES[CertExtendedKeyUsageType.ANY_PURPOSE].oid;

const PERMITTED_SUBTREE_VIOLATION_CODE = 41;
const EXCLUDED_SUBTREE_VIOLATION_CODE = 42;

const URI_GENERAL_NAME_TYPE = 6;

// Bound the path search, since the presented chain is attacker-controlled. Hitting either cap
// denies the login rather than continuing to search.
const MAX_CANDIDATE_PATHS = 8;
const MAX_SEARCH_PATH_STEPS = 2000;

const pkiCryptoEngine = new CryptoEngine({ name: "identity-tls-cert-auth", crypto: webcrypto as Crypto });

/**
 * Runs pkijs's subtree matching over a path this code already built, and nothing else.
 *
 * Left to itself the engine rebuilds the path and re-validates it against its own rules, which both
 * duplicates what `issuedBy`, `validityFailure` and the `.ca` gate settled against OpenSSL, and
 * rejects CAs deliberately accepted here (an anchor that omits basic constraints, or whose key usage
 * omits `keyCertSign`). It would also pick the shortest path it could rebuild, which in a
 * cross-signed PKI need not be the candidate under evaluation.
 *
 * @param orderedPath leaf first, then each issuer in turn, trust anchor last
 */
class NameConstraintsEngine extends CertificateChainValidationEngine {
  private readonly orderedPath: Certificate[];

  constructor(orderedPath: Certificate[]) {
    super({ trustedCerts: [orderedPath[orderedPath.length - 1]], certs: orderedPath.slice(0, -1).reverse() });
    this.orderedPath = orderedPath;
  }

  sort(): Promise<Certificate[]> {
    return Promise.resolve(this.orderedPath);
  }
}

const isWithinValidityWindow = (cert: TNativeX509, at: Date): boolean =>
  new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);

const isSelfIssued = (cert: TNativeX509): boolean => cert.subject === cert.issuer;

// Leaf and issuer get distinct reason codes because they are different people's problem to fix: the
// client reissues its leaf, the operator rotates the CA.
const validityFailure = (cert: TNativeX509, at: Date, role: "leaf" | "issuer"): TVerificationFailure | null => {
  if (isWithinValidityWindow(cert, at)) return null;

  const notYetValid = at < new Date(cert.validFrom);
  if (role === "leaf") {
    return { ok: false, reasonCode: notYetValid ? "certificate_not_yet_valid" : "certificate_expired" };
  }
  return { ok: false, reasonCode: notYetValid ? "issuer_certificate_not_yet_valid" : "issuer_certificate_expired" };
};

/**
 * The DN comparison is a string match on OpenSSL's formatting, not RFC 5280 name matching, so it
 * assumes the whole path shares one PKI's DN encoding (string types, attribute ordering). That holds
 * within a single PKI, the supported case. Across a heterogeneous one, two spellings of the same
 * logical DN fail to match and a cryptographically valid chain is rejected as
 * `ca_verification_failed`.
 */
const issuedBy = (child: TNativeX509, issuer: TNativeX509): boolean => {
  if (child.issuer !== issuer.subject) return false;
  try {
    return child.verify(issuer.publicKey);
  } catch {
    return false;
  }
};

/**
 * Several independent checks read the same certificate, and decoding it is the most expensive thing
 * a login does short of a signature check.
 *
 * Both parsers are kept: @peculiar/x509 for typed extension accessors, pkijs for the `Certificate`
 * its validation engine needs. Failures are not cached, so each caller keeps its own handling.
 */
const parsedCertificates = new WeakMap<TNativeX509, x509.X509Certificate>();

const parseCertificate = (cert: TNativeX509): x509.X509Certificate => {
  const cached = parsedCertificates.get(cert);
  if (cached) return cached;

  const parsed = new x509.X509Certificate(cert.raw);
  parsedCertificates.set(cert, parsed);
  return parsed;
};

const POLICY_EXTENSION_OIDS = new Set<string>([
  id_CertificatePolicies,
  id_PolicyMappings,
  id_PolicyConstraints,
  id_InhibitAnyPolicy
]);

/**
 * Strips the policy extensions, because pkijs runs RFC 5280 policy processing ahead of name
 * constraints and returns on the first problem it finds. Nothing here validates policies, so every
 * such outcome would be a login denied over something the caller never asked about, before the
 * subtree matching this parse exists for ever ran.
 *
 * Only pkijs loses sight of them; the @peculiar parse behind the other checks still sees the
 * certificate whole.
 */
const parsePkiCertificate = (raw: BufferSource): Certificate => {
  const parsed = Certificate.fromBER(raw);
  if (parsed.extensions) {
    parsed.extensions = parsed.extensions.filter((ext) => !POLICY_EXTENSION_OIDS.has(ext.extnID));
  }
  return parsed;
};

const pkiCertificates = new WeakMap<TNativeX509, Certificate>();

const toPkiCertificate = (cert: TNativeX509): Certificate => {
  const cached = pkiCertificates.get(cert);
  if (cached) return cached;

  const parsed = parsePkiCertificate(cert.raw);
  pkiCertificates.set(cert, parsed);
  return parsed;
};

const parseWithoutNameConstraints = (raw: BufferSource): Certificate => {
  const parsed = parsePkiCertificate(raw);
  if (parsed.extensions) {
    parsed.extensions = parsed.extensions.filter((ext) => ext.extnID !== NAME_CONSTRAINTS_EXTENSION_OID);
  }
  return parsed;
};

const nameConstraintFreeCertificates = new WeakMap<TNativeX509, Certificate>();

/**
 * A copy with the name constraints extension removed, so a path built from these carries none and
 * each pass in `enforceNameConstraints` sees only the one CA's worth it supplies. A certificate that
 * asserts no constraints needs no copy.
 */
const toNameConstraintFreeCertificate = (cert: TNativeX509): Certificate => {
  const shared = toPkiCertificate(cert);
  if (!shared.extensions?.some((ext) => ext.extnID === NAME_CONSTRAINTS_EXTENSION_OID)) return shared;

  const cached = nameConstraintFreeCertificates.get(cert);
  if (cached) return cached;

  const parsed = parseWithoutNameConstraints(cert.raw);
  nameConstraintFreeCertificates.set(cert, parsed);
  return parsed;
};

const basicConstraintsPathLength = (cert: TNativeX509): number | undefined =>
  parseCertificate(cert).getExtension(x509.BasicConstraintsExtension)?.pathLength;

/**
 * RFC 5280 6.1.4 (l)/(m): `pathLenConstraint` caps how many non-self-issued CA certificates may
 * follow a CA on the path, not counting the end-entity certificate. Omitting it means unconstrained.
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

type TNameConstraintsState =
  | { status: "absent" }
  | { status: "unreadable" }
  | { status: "present"; constraints: NameConstraints };

/**
 * "Unreadable" is deliberately distinct from "absent": the extension is critical (RFC 5280 4.2.1.10),
 * so reading a constraint this code cannot honor as "no constraints" would let a CA that meant to
 * restrict its subordinates certify anything.
 *
 * pkijs signals it two ways, hence the two checks: `parsedValue` is not a `NameConstraints` when the
 * value is not valid DER, and is an empty one when it parses as ASN.1 but not against the schema. A
 * conforming extension always carries at least one subtree.
 */
const nameConstraintsOf = (cert: Certificate): TNameConstraintsState => {
  const extension = cert.extensions?.find((ext) => ext.extnID === NAME_CONSTRAINTS_EXTENSION_OID);
  if (!extension) return { status: "absent" };

  if (!(extension.parsedValue instanceof NameConstraints)) return { status: "unreadable" };

  const constraints = extension.parsedValue;
  if (!constraints.permittedSubtrees && !constraints.excludedSubtrees) return { status: "unreadable" };
  return { status: "present", constraints };
};

/**
 * A cheap pre-check so a chain asserting no constraints never pays for the pkijs decode. Answers
 * true when the certificate cannot be read, so it reaches `nameConstraintsOf` and is denied there
 * rather than passing as unconstrained.
 */
const assertsNameConstraints = (cert: TNativeX509): boolean => {
  try {
    return parseCertificate(cert).getExtension(NAME_CONSTRAINTS_EXTENSION_OID) !== null;
  } catch {
    return true;
  }
};

const uriSubtreeValue = (subtree: GeneralSubtree): string | null =>
  subtree.base.type === URI_GENERAL_NAME_TYPE && typeof subtree.base.value === "string" ? subtree.base.value : null;

/**
 * RFC 5280 4.2.1.10: a URI name constraint restricts the host and must be a fully qualified domain
 * name (`example.org`, `.example.org`). One written the way the names look, `spiffe://example.org`,
 * or carrying a path, is not a hostname, and both Go and pkijs read it that way: it matches nothing,
 * so as a permitted subtree it denies every client and as an excluded subtree it excludes none.
 *
 * Reported rather than evaluated, since evaluating it would blame the client for a certificate it
 * cannot fix, and skipping it would let a CA that meant to restrict its subordinates certify
 * anything. The host is deliberately not extracted: reading `spiffe://example.org/team-a` as
 * `example.org` would permit `team-b` too, which is wider than the CA asserted.
 */
const unsupportedUriSubtree = (constraints: NameConstraints): string | null => {
  const subtrees = [...(constraints.permittedSubtrees ?? []), ...(constraints.excludedSubtrees ?? [])];
  return subtrees.map(uriSubtreeValue).find((uri) => uri !== null && /[:/]/.test(uri)) ?? null;
};

export type TNameConstraintsProblem =
  | { kind: "unparseable_certificate" }
  | { kind: "unreadable_extension" }
  | { kind: "unsupported_uri_subtree"; constraint: string };

/**
 * Why a certificate's name constraints could never permit any client, so an operator hears about it
 * when configuring the CA rather than at every login it would deny.
 */
export const findNameConstraintsProblem = (cert: TNativeX509): TNameConstraintsProblem | null => {
  let state: TNameConstraintsState;
  try {
    state = nameConstraintsOf(toPkiCertificate(cert));
  } catch (err) {
    logger.warn(err, `TLS certificate auth: certificate could not be decoded [subject=${cert.subject}]`);
    return { kind: "unparseable_certificate" };
  }

  if (state.status === "absent") return null;
  if (state.status === "unreadable") return { kind: "unreadable_extension" };

  const constraint = unsupportedUriSubtree(state.constraints);
  return constraint === null ? null : { kind: "unsupported_uri_subtree", constraint };
};

// All SAN extensions, not just the first: a conforming certificate carries one, but pkijs
// concatenates the names of every one it finds, so a second must not escape the constraint check.
const subjectAltNamesOf = (cert: Certificate): AltName[] =>
  (cert.extensions ?? []).flatMap((ext) =>
    ext.extnID === SUBJECT_ALT_NAME_EXTENSION_OID && ext.parsedValue instanceof AltName ? [ext.parsedValue] : []
  );

const permittedSubtreeTypes = (constraints: NameConstraints[]): Set<number> =>
  new Set(
    constraints.flatMap((constraint) => (constraint.permittedSubtrees ?? []).map((subtree) => subtree.base.type))
  );

// Rounds needed to give every name one where it is the only name of its type: however many names
// the most-repeated constrained type carries.
const roundsToCoverEveryName = (types: number[]): number => {
  const counts = new Map<number, number>();
  types.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1));
  return Math.max(0, ...counts.values());
};

type TPerNameEvaluation = { certificate: Certificate; rounds: number; selectRound: (round: number) => void };

/**
 * A private copy whose SAN list can be rewritten per round to hold one name of each type, so pkijs
 * evaluates that name alone instead of the certificate's names as a set. Null when no constrained
 * type repeats, since pkijs's own pass then already decided each name on its own.
 *
 * Deliberately not published to the parse caches: every other reader, the identity's allow-list
 * included, has to keep seeing all of the names. Its own name constraints are dropped because it is
 * substituted into a path that must carry none.
 */
const perNameEvaluation = (
  cert: TNativeX509,
  parsed: Certificate,
  constrainedTypes: Set<number>
): TPerNameEvaluation | null => {
  const shared = subjectAltNamesOf(parsed).flatMap((altName) => altName.altNames);
  const rounds = roundsToCoverEveryName(shared.map((name) => name.type).filter((type) => constrainedTypes.has(type)));
  if (rounds < 2) return null;

  const certificate = parseWithoutNameConstraints(cert.raw);
  const extensions = subjectAltNamesOf(certificate);
  if (!extensions.length) return null;
  const names = extensions.map((altName) => altName.altNames);

  return {
    certificate,
    rounds,
    selectRound: (round) => {
      const taken = new Map<number, number>();
      names.forEach((extensionNames, idx) => {
        extensions[idx].altNames = extensionNames.filter((name) => {
          const position = taken.get(name.type) ?? 0;
          taken.set(name.type, position + 1);
          return position === round;
        });
      });
    }
  };
};

/**
 * RFC 5280 6.1.4 (g): a CA may restrict the namespace its subordinates can certify. Without it, the
 * holder of a constrained sub-CA under the anchor could mint a leaf for any name and authenticate as
 * any identity pinned to that anchor.
 *
 * Subtree matching is delegated to pkijs. How constraints *combine* is not, because pkijs gets both
 * halves wrong in the permissive direction:
 *
 * 1. Across certificates, 6.1.4 (g) intersects the permitted set at every hop, so a name must sit
 *    inside what every CA above it permits. pkijs unions them, letting the widest CA on the path
 *    decide. A sub-CA writes what it issues, so a CA restricted to `team-a.example.com` could issue
 *    itself one permitting `example.com` and escape. Since a name is inside an intersection exactly
 *    when it is inside each member, this runs one pass per constraining CA over the path below it,
 *    passing only that CA's subtrees as the initial inputs and stripping every certificate's own
 *    extension so pkijs has nothing left to union. Those inputs are also the only way a constrained
 *    anchor is honored, as pkijs never reads the constraints of its trust anchor.
 *
 * 2. Within one certificate, pkijs ORs the names of a type, so one in-scope name would carry the
 *    rest; 6.1.4 (g) requires every name of a constrained type to be permitted. A leaf pairing one
 *    in-scope name with any other would otherwise authenticate the identity pinning the out-of-scope
 *    one. Hence the per-name rounds; see `perNameEvaluation`. Excluded subtrees need no such pass,
 *    since OR-ing is what the RFC asks for there.
 *
 * A CA whose constraints cannot be read denies earlier; see `nameConstraintsOf`.
 */
const enforceNameConstraints = async (orderedPath: TNativeX509[]): Promise<TVerificationFailure | null> => {
  if (orderedPath.length < 2) return null;
  if (!orderedPath.some(assertsNameConstraints)) return null;

  const parsedPath = orderedPath.map(toPkiCertificate);
  const pathConstraints = parsedPath.map(nameConstraintsOf);

  const unreadableIssuer = pathConstraints.findIndex((state, idx) => idx > 0 && state.status === "unreadable");
  if (unreadableIssuer !== -1) {
    logger.warn(
      `TLS certificate auth: a CA on the chain asserts name constraints that could not be read [subject=${orderedPath[unreadableIssuer].subject}]`
    );
    return { ok: false, reasonCode: "ca_verification_failed" };
  }

  const unsupportedIssuer = pathConstraints
    .map((state, idx) => ({
      subject: orderedPath[idx].subject,
      constraint: idx > 0 && state.status === "present" ? unsupportedUriSubtree(state.constraints) : null
    }))
    .find(({ constraint }) => constraint !== null);

  if (unsupportedIssuer) {
    logger.warn(
      `TLS certificate auth: a CA on the chain asserts a URI name constraint that no certificate can satisfy [subject=${unsupportedIssuer.subject}] [constraint=${unsupportedIssuer.constraint}]`
    );
    return { ok: false, reasonCode: "unsupported_name_constraint" };
  }

  // A leaf's own constraints restrict nothing below it, so only the CAs above it constrain the path.
  const constrainingCertificates = pathConstraints.flatMap((state, idx) =>
    idx > 0 && state.status === "present" ? [{ idx, constraints: state.constraints }] : []
  );
  if (!constrainingCertificates.length) return null;

  const evaluate = async (path: Certificate[], constraints: NameConstraints): Promise<TVerificationFailure | null> => {
    const { result, resultCode, resultMessage } = await new NameConstraintsEngine(path).verify(
      {
        initialPermittedSubtreesSet: constraints.permittedSubtrees ?? [],
        initialExcludedSubtreesSet: constraints.excludedSubtrees ?? []
      },
      pkiCryptoEngine
    );

    if (result) return null;
    if (resultCode === PERMITTED_SUBTREE_VIOLATION_CODE || resultCode === EXCLUDED_SUBTREE_VIOLATION_CODE) {
      return { ok: false, reasonCode: "name_constraint_violation" };
    }

    logger.warn(
      `TLS certificate auth: name constraint validation could not confirm the chain [resultCode=${resultCode}] [resultMessage=${resultMessage}] [leafSubject=${orderedPath[0].subject}] [anchorSubject=${orderedPath[orderedPath.length - 1].subject}]`
    );
    return { ok: false, reasonCode: "ca_verification_failed" };
  };

  const constrainedTypes = permittedSubtreeTypes(constrainingCertificates.map(({ constraints }) => constraints));

  const perName = constrainedTypes.size
    ? orderedPath.slice(0, -1).flatMap((cert, idx) => {
        const evaluation = perNameEvaluation(cert, parsedPath[idx], constrainedTypes);
        return evaluation ? [{ idx, evaluation }] : [];
      })
    : [];

  const constraintFreePath = orderedPath.map(toNameConstraintFreeCertificate);

  for (const { idx: constrainingIdx, constraints } of constrainingCertificates) {
    const basePath = constraintFreePath.slice(0, constrainingIdx + 1);

    // eslint-disable-next-line no-await-in-loop -- stop at the first CA whose namespace the path leaves
    const failure = await evaluate(basePath, constraints);
    if (failure) return failure;

    const perNameBelow = perName.filter(({ idx }) => idx < constrainingIdx);
    const rounds = Math.max(0, ...perNameBelow.map(({ evaluation }) => evaluation.rounds));

    for (let round = 0; round < rounds; round += 1) {
      const path = [...basePath];
      perNameBelow.forEach(({ idx, evaluation }) => {
        if (evaluation.rounds <= round) return;
        evaluation.selectRound(round);
        path[idx] = evaluation.certificate;
      });

      // eslint-disable-next-line no-await-in-loop -- stop at the first name the path does not permit
      const roundFailure = await evaluate(path, constraints);
      if (roundFailure) return roundFailure;
    }
  }

  return null;
};

/**
 * RFC 5280 4.2.1.12: an EKU is the exhaustive list of purposes a certificate may be used for.
 * Without this check, anyone holding a serverAuth or codeSigning certificate under the configured CA
 * could impersonate the identity pinned to it.
 *
 * A missing extension means unconstrained and stays accepted, as OpenSSL and Go read it, which is
 * what keeps existing EKU-less leaves working. Only an explicit list omitting client auth is
 * rejected.
 *
 * Node's X509Certificate accepts DER that @peculiar/x509 rejects, so a certificate can parse at the
 * edge and fail here. Since reading the extension is what establishes client auth is permitted, an
 * unreadable one denies rather than 500s.
 */
export const permitsClientAuth = (cert: TNativeX509): boolean => {
  let usages: x509.ExtendedKeyUsageExtension["usages"] | undefined;
  try {
    usages = parseCertificate(cert).getExtension(x509.ExtendedKeyUsageExtension)?.usages;
  } catch (err) {
    logger.warn(err, `TLS certificate auth: could not read extended key usage [subject=${cert.subject}]`);
    return false;
  }
  if (!usages) return true;
  return usages.some((oid) => oid === CLIENT_AUTH_EKU_OID || oid === ANY_PURPOSE_EKU_OID);
};

/**
 * The default mode: no intermediates, so the configured CA either signed the presented leaf or it
 * did not. It applies the same rules the path-building mode applies to a one-hop path, since those
 * rules belong to the CA rather than to the path's length.
 *
 * The one difference is that the anchor need not assert `CA:TRUE`: it is configured by an operator
 * rather than presented by a client, so a self-signed certificate omitting basic constraints is
 * accepted here.
 */
export const verifyDirectlyIssuedClientCertificate = async ({
  leaf,
  ca,
  now = new Date()
}: {
  leaf: TNativeX509;
  ca: TNativeX509;
  now?: Date;
}): Promise<TVerifyClientCertificateChainResult> => {
  if (!issuedBy(leaf, ca)) return { ok: false, reasonCode: "ca_verification_failed" };

  const failure =
    validityFailure(leaf, now, "leaf") ??
    validityFailure(ca, now, "issuer") ??
    (permitsClientAuth(ca) ? null : ({ ok: false, reasonCode: "issuer_client_auth_usage_not_allowed" } as const));
  if (failure) return failure;

  try {
    return (await enforceNameConstraints([leaf, ca])) ?? { ok: true };
  } catch {
    return { ok: false, reasonCode: "ca_verification_failed" };
  }
};

/**
 * Builds paths from the leaf through the presented intermediates to the configured anchor, and
 * accepts if any one is valid end to end: every hop a real issuer relationship, every issuer a CA
 * permitted to sign that is in its validity window and whose EKU permits client auth, and the path
 * satisfying the `pathLenConstraint` and name constraints its CAs assert.
 *
 * Every check participates in path *selection*, which is why they are not run once up front. A
 * cross-signed PKI presents the same logical CA under several issuers, so one certificate can sit on
 * both a path that violates a constraint and one that satisfies it; committing to the first
 * cryptographically sound path would deny a client that has a good one. Per-certificate checks prune
 * only their branch, and path-wide constraints run per complete path until one passes.
 *
 * The anchor is the only trusted input: a forged or unrelated intermediate cannot reach it. This
 * mirrors how SPIFFE consumers validate X.509-SVID chains, and lets an operator pin a stable root
 * while the issuing intermediate rotates under it.
 *
 * @param presentedChain intermediates presented by the client; order-independent
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

  const signatureResults = new Map<string, boolean>();
  const issuedByCached = (child: TNativeX509, issuer: TNativeX509): boolean => {
    const pairId = `${certificateId(child)}:${certificateId(issuer)}`;
    const cached = signatureResults.get(pairId);
    if (cached !== undefined) return cached;

    const verified = issuedBy(child, issuer);
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

  /**
   * Both properties belong to the certificate rather than the path, so failing one rules out this
   * branch only; another issuer of the same certificate can still complete a path.
   *
   * A CA's EKU restricts what its subordinates may be used for, so one enumerating purposes without
   * client auth cannot delegate it, the way OpenSSL and Go check a purpose against the whole chain.
   */
  const issuerFailure = (issuer: TNativeX509): TVerificationFailure | null =>
    validityFailure(issuer, now, "issuer") ??
    (issuerPermitsClientAuth(issuer) ? null : { ok: false, reasonCode: "issuer_client_auth_usage_not_allowed" });

  const leafFailure = validityFailure(leaf, now, "leaf");
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

    // `.ca` is OpenSSL's `X509_check_ca`, covering RFC 5280 6.1.4 (k) and (n) together: false unless
    // basic constraints assert `CA:TRUE` and any key usage present includes `keyCertSign`. Reading
    // basic constraints directly instead would silently drop the key usage half.
    if (trustAnchor.ca && issuedByCached(current, trustAnchor)) {
      const anchorFailure = issuerFailure(trustAnchor);
      if (anchorFailure) search.prunedFailure ??= anchorFailure;
      else completePaths.push([...path, trustAnchor]);
    }

    candidateIssuers
      .filter(
        (candidate) => !visited.has(certificateId(candidate)) && candidate.ca && issuedByCached(current, candidate)
      )
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

  for (const path of orderedPaths) {
    let failure: TVerificationFailure | null;
    try {
      const pathLengthFailure = enforcePathLength(path);
      // eslint-disable-next-line no-await-in-loop -- stop at the first path that validates
      failure = pathLengthFailure ?? (await enforceNameConstraints(path));
    } catch (err) {
      logger.warn(
        err,
        `TLS certificate auth: could not evaluate a candidate path [pathLength=${path.length}] [leafSubject=${path[0].subject}] [anchorSubject=${path[path.length - 1].subject}]`
      );
      failure = { ok: false, reasonCode: "ca_verification_failed" };
    }

    if (!failure) return { ok: true };
    constraintFailure ??= failure;
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

// An unparseable certificate is treated as carrying no SANs, which denies. See `permitsClientAuth`
// for why one Node accepted can still fail to parse here.
export const readSubjectAltNames = (cert: TNativeX509): ReadonlyArray<TCertificateSanItem> | undefined => {
  try {
    return parseCertificate(cert).getExtension(x509.SubjectAlternativeNameExtension)?.names.items;
  } catch (err) {
    logger.warn(err, `TLS certificate auth: could not read subject alternative names [subject=${cert.subject}]`);
    return undefined;
  }
};

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
