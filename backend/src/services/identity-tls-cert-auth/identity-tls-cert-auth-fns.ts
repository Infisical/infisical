import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import {
  AltName,
  Certificate,
  CertificateChainValidationEngine,
  CryptoEngine,
  GeneralSubtree,
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

// Caps on how much of a presented chain the path search will explore. See `explore` below.
const MAX_CANDIDATE_PATHS = 8;
const MAX_SEARCH_PATH_STEPS = 2000;

const pkiCryptoEngine = new CryptoEngine({ name: "identity-tls-cert-auth", crypto: webcrypto as Crypto });

/**
 * pkijs's validation engine builds the path itself before it will evaluate name constraints, and
 * that path building carries structural opinions of its own: it re-verifies every signature with
 * pkijs's software crypto, re-checks validity windows, and requires every issuer to assert `CA:TRUE`
 * and, when a key usage is present, `keyCertSign`.
 *
 * None of that is wanted here, because all of it is already settled by `issuedBy`, `validityFailure`
 * and the `.ca` gate, against OpenSSL rather than a second implementation. Letting it run again turned
 * pkijs's opinions into authentication failures, because it holds the configured CA to them too: a
 * configured CA that omits basic constraints, or whose key usage omits `keyCertSign`, is deliberately
 * accepted in single-hop mode, yet both were denied as soon as their certificate also asserted name
 * constraints.
 *
 * Overriding `sort` hands the engine the path this code already established, so only the subtree
 * matching runs. It also removes a subtler mismatch: pkijs rebuilt the path from the certificates it
 * was given and evaluated the shortest one it found, which for a cross-signed chain could be a
 * different path than the candidate under consideration, skipping the constraints of a CA that was
 * on it.
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

/**
 * The reason codes distinguish the presented leaf from a CA above it, because the two are the
 * client's problem in different ways: an expired leaf is reissued by the client, an expired CA is
 * the operator's to rotate, and a caller that cannot tell them apart cannot act on either.
 */
const validityFailure = (cert: TNativeX509, at: Date, role: "leaf" | "issuer"): TVerificationFailure | null => {
  if (isWithinValidityWindow(cert, at)) return null;

  const notYetValid = at < new Date(cert.validFrom);
  if (role === "leaf") {
    return { ok: false, reasonCode: notYetValid ? "certificate_not_yet_valid" : "certificate_expired" };
  }
  return { ok: false, reasonCode: notYetValid ? "issuer_certificate_not_yet_valid" : "issuer_certificate_expired" };
};

/**
 * Returns true when `issuer` issued `child`.
 *
 * The name check compares the OpenSSL-formatted DN strings returned by Node's X509Certificate
 * (`child.issuer === issuer.subject`). This is a fast pre-filter before the cryptographic `verify`,
 * and assumes both sides of the chain share the same PKI-level DN encoding conventions, i.e. the
 * same string types (PrintableString vs UTF8String) and attribute ordering for equivalent names.
 * That holds within a single PKI (SPIRE emits the leaf and the rotating intermediate from one CA
 * with consistent encoding), which is the supported case here.
 *
 * It can yield a false negative in a heterogeneous PKI where the issuer and subject encode the same
 * logical DN differently (e.g. one cert uses PrintableString and the other UTF8String for an
 * attribute, or they differ in attribute ordering). In that situation a cryptographically valid
 * issuer relationship is rejected and validation fails with `ca_verification_failed`. A full
 * RFC 5280 name comparison (per-RDN, encoding-insensitive) would be required to support that.
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
 * Decoding a certificate is the most expensive thing a login does that is not a signature check, and
 * a single certificate is read by several checks that have no reason to know about each other: the
 * extended key usage gate, the subject alternative names, the path length, and whether it asserts
 * name constraints at all. Caching on the certificate object rather than its bytes keeps the parse
 * to one per certificate per request without a lifetime to manage: the entry dies with the
 * `X509Certificate` the request built, and a certificate's bytes never change under it.
 *
 * Both parsers are kept because they are not interchangeable. @peculiar/x509 gives typed extension
 * accessors, and pkijs gives the `Certificate` its validation engine requires. Only the parse is
 * shared; a failure is not cached, so each caller keeps its own error handling.
 */
const parsedCertificates = new WeakMap<TNativeX509, x509.X509Certificate>();

const parseCertificate = (cert: TNativeX509): x509.X509Certificate => {
  const cached = parsedCertificates.get(cert);
  if (cached) return cached;

  const parsed = new x509.X509Certificate(cert.raw);
  parsedCertificates.set(cert, parsed);
  return parsed;
};

const pkiCertificates = new WeakMap<TNativeX509, Certificate>();

const toPkiCertificate = (cert: TNativeX509): Certificate => {
  const cached = pkiCertificates.get(cert);
  if (cached) return cached;

  const parsed = Certificate.fromBER(cert.raw);
  pkiCertificates.set(cert, parsed);
  return parsed;
};

const basicConstraintsPathLength = (cert: TNativeX509): number | undefined =>
  parseCertificate(cert).getExtension(x509.BasicConstraintsExtension)?.pathLength;

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

type TNameConstraintsState =
  | { status: "absent" }
  | { status: "unreadable" }
  | { status: "present"; constraints: NameConstraints };

/**
 * A certificate that carries name constraints this code cannot read has asserted a restriction that
 * cannot be honored, which is not the same as asserting none: reading it as "no constraints" would
 * let a CA that means to restrict its subordinates certify anything. The extension is critical per
 * RFC 5280 4.2.1.10, so an unreadable one has to deny rather than be skipped.
 *
 * pkijs surfaces an unreadable extension two ways, both covered here: `parsedValue` is undefined
 * when the extension value is not valid DER at all, and is an otherwise-empty `NameConstraints`
 * when the value parses as ASN.1 but not against the schema. Neither carries a subtree list, and a
 * conforming extension always carries at least one.
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
 * Whether the certificate carries a name constraints extension, answered from the extension list
 * alone so a chain that asserts none never pays for the pkijs decode the evaluation needs. A
 * certificate that cannot be read here is reported as carrying one, so it reaches `nameConstraintsOf`
 * and is denied there rather than passing as unconstrained.
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
 * RFC 5280 4.2.1.10: a URI name constraint applies to the host part of the name and has to be a
 * fully qualified domain name, such as `example.org` or `.example.org`. A constraint written the way
 * the names themselves look, `spiffe://example.org`, is not a hostname, and neither is one carrying
 * a path. Go's crypto/x509 and pkijs both read it that way, so such a constraint matches nothing:
 * as a permitted subtree it denies every client, and as an excluded subtree it excludes none.
 *
 * Returning it rather than evaluating it keeps both halves honest. Letting the match run would deny
 * every client while naming the client's certificate as the problem, when the certificate cannot be
 * changed to satisfy it. Skipping it would let a CA that meant to restrict its subordinates certify
 * anything. Note that the host is not extracted and reused: for a constraint like
 * `spiffe://example.org/team-a`, treating it as `example.org` would permit `team-b` as well, which
 * is wider than what the CA asserted.
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
 * Why a certificate's name constraints could never permit a client, so an operator hears about it
 * when they configure the CA rather than at every login it would deny. Null when the certificate
 * asserts no constraints, or asserts ones that can be evaluated.
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

/**
 * Every readable subject alternative name extension on the certificate, in the order pkijs reads
 * them. A conforming certificate carries at most one, but pkijs concatenates the names of all of
 * them, so a second one carries names the constraint evaluation sees and cannot be left out here.
 */
const subjectAltNamesOf = (cert: Certificate): AltName[] =>
  (cert.extensions ?? []).flatMap((ext) =>
    ext.extnID === SUBJECT_ALT_NAME_EXTENSION_OID && ext.parsedValue instanceof AltName ? [ext.parsedValue] : []
  );

const permittedSubtreeTypes = (states: TNameConstraintsState[]): Set<number> =>
  new Set(
    states.flatMap((state) =>
      state.status === "present" ? (state.constraints.permittedSubtrees ?? []).map((subtree) => subtree.base.type) : []
    )
  );

/**
 * How many rounds it takes to give every name a round of its own where it is the only name of its
 * type: the number of names carried by whichever constrained type is repeated the most.
 */
const roundsToCoverEveryName = (types: number[]): number => {
  const counts = new Map<number, number>();
  types.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1));
  return Math.max(0, ...counts.values());
};

type TPerNameEvaluation = { certificate: Certificate; rounds: number; selectRound: (round: number) => void };

/**
 * A private copy of a certificate that carries more than one name of a constrained type, whose name
 * list can be rewritten to hold a single name of each type so pkijs evaluates that one name rather
 * than the certificate's names as a set. Null when the certificate repeats no constrained type, so
 * pkijs's own pass already decided each of its names on its own.
 *
 * The copy is parsed once and rewritten per round rather than reparsed per round, and it is
 * deliberately not published to the parse caches: every other reader of the certificate, the
 * identity's allow-list included, still has to see all of its names. It is also only made once the
 * shared parse has shown a copy is needed, so the ordinary certificate naming one workload does not
 * pay for a second decode.
 */
const perNameEvaluation = (
  cert: TNativeX509,
  parsed: Certificate,
  constrainedTypes: Set<number>
): TPerNameEvaluation | null => {
  const shared = subjectAltNamesOf(parsed).flatMap((altName) => altName.altNames);
  const rounds = roundsToCoverEveryName(shared.map((name) => name.type).filter((type) => constrainedTypes.has(type)));
  if (rounds < 2) return null;

  const certificate = Certificate.fromBER(cert.raw);
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
 * RFC 5280 6.1.4 (g): a CA may restrict the namespace its subordinates can certify. Without this,
 * the holder of a constrained sub-CA under the configured anchor could mint a leaf for any name and
 * authenticate as any identity pinned to that anchor.
 *
 * Subtree matching (DNS/IP/email/URI/directory-name semantics, permitted and excluded) is delegated
 * to pkijs rather than reimplemented, and only that: see `NameConstraintsEngine` for why the engine
 * is not allowed to rebuild or re-validate the path. pkijs applies constraints carried by
 * certificates on the path but not by the trust anchor itself, so the anchor's own constraints are
 * supplied separately as the RFC's initial-permitted/excluded-subtrees inputs. That matters because
 * operators may pin a constrained sub-CA directly rather than the root above it.
 *
 * What is not delegated is how the names of one certificate combine. pkijs decides a permitted
 * subtree group by OR-ing every name of that type, so one name inside the permitted subtree carries
 * the rest, whereas 6.1.4 (g) requires every name of a constrained type to be within a permitted
 * subtree. Left alone, the holder of a constrained sub-CA could mint a leaf pairing one in-scope
 * name with any name it liked, and `isSubjectAltNameAllowed` would then authenticate the identity
 * that pins the out-of-scope one. So a certificate repeating a constrained type is also evaluated
 * one name at a time, by the same matcher: see `perNameEvaluation`. Excluded subtrees need no such
 * pass, because there OR-ing the names is what the RFC asks for: any name inside an excluded
 * subtree denies.
 *
 * Only runs when some certificate on the path actually asserts constraints, so a chain that has
 * none is validated exactly as before. A CA asserting constraints that cannot be read denies before
 * that point; see `nameConstraintsOf`.
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

  if (!pathConstraints.some((state) => state.status === "present")) return null;

  const anchorState = pathConstraints[pathConstraints.length - 1];
  const anchorConstraints = anchorState.status === "present" ? anchorState.constraints : null;

  const evaluate = async (path: Certificate[]): Promise<TVerificationFailure | null> => {
    const { result, resultCode, resultMessage } = await new NameConstraintsEngine(path).verify(
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

    logger.warn(
      `TLS certificate auth: name constraint validation could not confirm the chain [resultCode=${resultCode}] [resultMessage=${resultMessage}] [leafSubject=${orderedPath[0].subject}] [anchorSubject=${orderedPath[orderedPath.length - 1].subject}]`
    );
    return { ok: false, reasonCode: "ca_verification_failed" };
  };

  const failure = await evaluate(parsedPath);
  if (failure) return failure;

  const constrainedTypes = permittedSubtreeTypes(pathConstraints);
  if (!constrainedTypes.size) return null;

  const perName = orderedPath.slice(0, -1).flatMap((cert, idx) => {
    const evaluation = perNameEvaluation(cert, parsedPath[idx], constrainedTypes);
    return evaluation ? [{ idx, evaluation }] : [];
  });

  const rounds = Math.max(0, ...perName.map(({ evaluation }) => evaluation.rounds));

  for (let round = 0; round < rounds; round += 1) {
    const path = [...parsedPath];
    perName.forEach(({ idx, evaluation }) => {
      if (evaluation.rounds <= round) return;
      evaluation.selectRound(round);
      path[idx] = evaluation.certificate;
    });

    // eslint-disable-next-line no-await-in-loop -- stop at the first name the path does not permit
    const roundFailure = await evaluate(path);
    if (roundFailure) return roundFailure;
  }

  return null;
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
 * Validate a client certificate the configured CA is expected to have issued directly.
 *
 * This is the default mode, where no intermediates are involved: the configured CA either signed
 * the presented leaf or it did not. It still applies every rule the path-building mode applies to a
 * one-hop path, because the rules belong to the CA rather than to the length of the path. A CA that
 * has expired, or whose extended key usage does not cover client authentication, cannot authenticate
 * a client in either mode; a leaf outside the namespace its CA is permitted to certify is outside it
 * whether or not intermediates were presented; and a leaf outside its own validity window is no more
 * usable here than on a longer path.
 *
 * Unlike the path-building mode, the anchor is not required to assert `CA:TRUE`. It is configured by
 * an operator rather than presented by the client, and a self-signed certificate that omits basic
 * constraints entirely has always been accepted here.
 *
 * @param leaf the end-entity certificate presented by the client
 * @param ca   the configured CA certificate that must have issued it
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
 * Validate the presented client certificate chain against a configured trust anchor.
 *
 * Unlike single-hop verification (leaf signed directly by the configured CA), this builds paths
 * from the leaf through the presented intermediates up to the configured trust anchor and accepts
 * the client if any one of them is valid end to end. A path is valid when every hop has a real
 * issuer relationship (subject/issuer match + signature), every issuer is a CA permitted to sign
 * certificates (including the trust anchor itself) that is within its validity window and whose
 * extended key usage permits client authentication, and the path as a whole satisfies the RFC 5280
 * delegation constraints its CAs assert: `pathLenConstraint` and name constraints.
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
 * (string types and attribute ordering). See `issuedBy` above for the heterogeneous-PKI caveat.
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
   * The gate every issuer clears before it may extend a path. Both properties belong to the
   * certificate alone rather than to the path it sits on, so failing one rules out this branch
   * only: another issuer of the same certificate can still complete a path.
   *
   * An EKU on a CA restricts what its subordinates may be used for, so a CA that enumerates
   * purposes without client authentication cannot delegate it, the way OpenSSL and Go check a
   * purpose against the whole chain rather than the leaf alone.
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

    // `.ca` is OpenSSL's `X509_check_ca`, which carries RFC 5280 6.1.4 (k) and (n) together: it is
    // false unless basic constraints assert `CA:TRUE` and, when a key usage is present, it includes
    // `keyCertSign`. So a sub-CA its parent issued for CRL signing or TLS termination alone cannot
    // extend a path here, and neither can such a certificate configured as the anchor. Replacing this
    // with a direct read of basic constraints would silently drop the key usage half.
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

/**
 * Reading the subject alternative names is what establishes that the certificate carries one the
 * identity allows, so a certificate whose extensions @peculiar/x509 cannot parse has not established
 * it and is treated as carrying none, which denies. See `permitsClientAuth` for why a certificate
 * Node accepted can still fail to parse here.
 */
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
