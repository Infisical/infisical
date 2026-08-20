import * as x509 from "@peculiar/x509";
import forge from "node-forge";

const Pkcs12ErrorCode = {
  NotAKeystore: "not_a_keystore",
  BadPassword: "bad_password",
  UnsupportedEntries: "unsupported_entries",
  TooManyKeys: "too_many_keys",
  TooManyCertificates: "too_many_certificates",
  TooExpensive: "too_expensive",
  NoEntries: "no_entries",
  NoPairs: "no_pairs"
} as const;

type TPkcs12ErrorCode = (typeof Pkcs12ErrorCode)[keyof typeof Pkcs12ErrorCode];

class Pkcs12ExtractionError extends Error {
  code: TPkcs12ErrorCode;

  count?: number;

  constructor(code: TPkcs12ErrorCode, count?: number) {
    super(code);
    this.code = code;
    this.count = count;
  }
}

export type TPkcs12Entry = {
  alias: string | null;
  subject: string;
  commonName: string | null;
  altNames: string | null;
  keyAlgorithm?: string;
  notAfter: string;
  fingerprintSha256: string;
  chainWarning: string | null;
  certificatePem: string;
  chainPem?: string;
  privateKeyPem?: string;
};

const MAX_KEY_BAGS = 8;
const MAX_CERT_BAGS = 100;
const MAX_CHAIN_DEPTH = 10;

const CHAIN_WARNING =
  "No issuer chain was found in the keystore. This certificate will be imported on its own.";

const MAX_SUBJECT_LENGTH = 2048;
const MAX_ALIAS_LENGTH = 1024;

const derBytes = (der: string) => Uint8Array.from(der, (char) => char.charCodeAt(0));

// forge writes CRLF line endings, which @peculiar/x509 refuses to parse.
const toPem = (type: string, der: string) =>
  forge.pem.encode({ type, body: der }).replace(/\r\n/g, "\n");

const bagAttribute = (
  bag: forge.pkcs12.Bag,
  name: "friendlyName" | "localKeyId"
): string | null => {
  const values = (bag.attributes as Record<string, string[] | undefined>)[name];
  return values?.length ? values[0] : null;
};

// forge leaves `bag.key` / `bag.cert` null for anything non-RSA and hands back the decrypted ASN.1
// instead, so never consume its parsed objects: the ASN.1 is what makes EC, Ed25519 and PQC work.
const certBagToDer = (bag: forge.pkcs12.Bag) => {
  const asn1 = bag.cert ? forge.pki.certificateToAsn1(bag.cert) : bag.asn1;
  if (!asn1) return null;
  return forge.asn1.toDer(asn1).getBytes();
};

// forge parses RSA into `bag.key` and leaves the ASN.1 unset, so it is rebuilt for those.
const keyBagAsn1 = (bag: forge.pkcs12.Bag) =>
  bag.asn1 ?? (bag.key ? forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(bag.key)) : null);

const readAltNames = (cert: x509.X509Certificate) => {
  const extension = cert.extensions.find((ext) => ext.type === "2.5.29.17");
  if (!extension) return null;

  try {
    const names = new x509.GeneralNames(extension.value);
    return names.items
      .map((name) => name.value)
      .join(", ")
      .slice(0, MAX_SUBJECT_LENGTH);
  } catch {
    return null;
  }
};

const sha256Fingerprint = async (der: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", der);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
};

type TParsedCert = {
  pem: string;
  cert: x509.X509Certificate;
  fingerprint: string;
  localKeyId: string | null;
  friendlyName: string | null;
};

type TParsedKey = {
  pem: string;
  keyAlgorithm: string;
  localKeyId: string | null;
  friendlyName: string | null;
};

const EC_CURVE_LABELS: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.132.0.10": "secp256k1"
};

const KEY_ALGORITHM_LABELS: Record<string, string> = {
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
  "2.16.840.1.101.3.4.3.17": "ML-DSA-44",
  "2.16.840.1.101.3.4.3.18": "ML-DSA-65",
  "2.16.840.1.101.3.4.3.19": "ML-DSA-87"
};

const RSA_OIDS = new Set(["1.2.840.113549.1.1.1", "1.2.840.113549.1.1.10"]);
const EC_OID = "1.2.840.10045.2.1";

// The browser has no equivalent of Node's key inspection, so the algorithm is read straight out of
// the PrivateKeyInfo: an OID, and for RSA a modulus whose length is the key size.
const describeKey = (keyAsn1: forge.asn1.Asn1) => {
  if (!Array.isArray(keyAsn1.value)) return "";
  const algorithm = keyAsn1.value[1];
  if (!Array.isArray(algorithm?.value)) return "";

  const [oidNode, paramNode] = algorithm.value;
  if (oidNode?.type !== forge.asn1.Type.OID || typeof oidNode.value !== "string") return "";
  const oid = forge.asn1.derToOid(oidNode.value);

  if (RSA_OIDS.has(oid)) {
    const keyBytes = keyAsn1.value[2];
    if (typeof keyBytes?.value !== "string") return "RSA";
    try {
      const inner = forge.asn1.fromDer(keyBytes.value);
      const modulus = Array.isArray(inner.value) ? inner.value[1] : null;
      if (typeof modulus?.value !== "string") return "RSA";
      // A leading zero byte keeps the modulus positive and is not part of the key size.
      const bytes =
        modulus.value.charCodeAt(0) === 0 ? modulus.value.length - 1 : modulus.value.length;
      return `RSA ${bytes * 8}`;
    } catch {
      return "RSA";
    }
  }

  if (oid === EC_OID) {
    if (paramNode?.type === forge.asn1.Type.OID && typeof paramNode.value === "string") {
      const curve = forge.asn1.derToOid(paramNode.value);
      return `ECDSA ${EC_CURVE_LABELS[curve] ?? curve}`;
    }
    return "ECDSA";
  }

  return KEY_ALGORITHM_LABELS[oid] ?? "";
};

const readBags = (p12: forge.pkcs12.Pkcs12Pfx) => {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const shrouded =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? [];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const keyBags = [...shrouded, ...plain];

  if (keyBags.length > MAX_KEY_BAGS)
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.TooManyKeys, keyBags.length);
  if (certBags.length > MAX_CERT_BAGS)
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.TooManyCertificates, certBags.length);

  return { certBags, keyBags };
};

const parseCertBags = async (certBags: forge.pkcs12.Bag[]) => {
  const byFingerprint = new Map<string, TParsedCert>();

  await Promise.all(
    certBags.map(async (bag) => {
      const der = certBagToDer(bag);
      if (!der) return;

      try {
        // Parsed from DER rather than the PEM text, so the certificate never depends on how the
        // PEM was formatted.
        const cert = new x509.X509Certificate(derBytes(der));
        const pem = toPem("CERTIFICATE", der);
        const fingerprint = await sha256Fingerprint(cert.rawData);
        if (!byFingerprint.has(fingerprint)) {
          byFingerprint.set(fingerprint, {
            pem,
            cert,
            fingerprint,
            localKeyId: bagAttribute(bag, "localKeyId"),
            friendlyName: bagAttribute(bag, "friendlyName")
          });
        }
      } catch {
        // A malformed entry must not fail the rest.
      }
    })
  );

  return [...byFingerprint.values()];
};

const parseKeyBags = (keyBags: forge.pkcs12.Bag[]) => {
  const keys: TParsedKey[] = [];

  keyBags.forEach((bag) => {
    const asn1 = keyBagAsn1(bag);
    if (!asn1) return;

    keys.push({
      pem: toPem("PRIVATE KEY", forge.asn1.toDer(asn1).getBytes()),
      keyAlgorithm: describeKey(asn1),
      localKeyId: bagAttribute(bag, "localKeyId"),
      friendlyName: bagAttribute(bag, "friendlyName")
    });
  });

  return keys;
};

// A keystore links a key to its certificate with a shared localKeyId, which is what the format
// provides for exactly this. Where a keystore omits it there is nothing to disambiguate, so a lone
// key is paired with the lone leaf. importCert verifies the pairing again on the server, so a wrong
// guess is rejected there rather than stored.
const findLeafForKey = (
  key: TParsedKey,
  keys: TParsedKey[],
  certs: TParsedCert[],
  leaves: TParsedCert[]
) => {
  if (key.localKeyId) {
    const tagged = certs.find((cert) => cert.localKeyId === key.localKeyId);
    if (tagged) return tagged;
  }

  if (keys.length === 1 && leaves.length === 1) return leaves[0];

  if (key.friendlyName) {
    const named = certs.find((cert) => cert.friendlyName === key.friendlyName);
    if (named) return named;
  }

  return null;
};

// Issuers are matched by signature, not by name: a keystore that has been through a CA renewal
// carries two intermediates with the same subject, and picking by name builds a chain that fails at
// import. `signatureOnly` matters too, or an expired certificate loses its chain here.
const buildChain = async (leaf: TParsedCert, certs: TParsedCert[]) => {
  const chain: TParsedCert[] = [];
  const visited = new Set<string>([leaf.fingerprint]);
  let current = leaf;
  let truncated = false;

  while (chain.length < MAX_CHAIN_DEPTH) {
    const subject = current;
    if (subject.cert.subject === subject.cert.issuer) break;

    const candidates = certs
      .filter((c) => !visited.has(c.fingerprint))
      .sort((a, b) => {
        const aMatch = a.cert.subject === subject.cert.issuer ? 0 : 1;
        const bMatch = b.cert.subject === subject.cert.issuer ? 0 : 1;
        return aMatch - bMatch;
      });

    let issuer: TParsedCert | null = null;
    // eslint-disable-next-line no-restricted-syntax
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const signed = await subject.cert
        .verify({ publicKey: candidate.cert.publicKey, signatureOnly: true })
        .catch(() => false);
      if (signed) {
        issuer = candidate;
        break;
      }
    }

    if (!issuer) break;

    chain.push(issuer);
    visited.add(issuer.fingerprint);
    current = issuer;

    if (chain.length === MAX_CHAIN_DEPTH && current.cert.subject !== current.cert.issuer) {
      truncated = true;
    }
  }

  return { chain, truncated };
};

// A keystore states its own key-derivation cost in the clear, so an expensive one is refused before
// any decryption happens rather than by running out of time. PBKDF2 and the PKCS#12 PBE algorithms
// all carry the count as the first integer of their parameters. The counts are summed rather than
// compared one by one, since the cost of opening the file is the sum of every derivation it asks
// for. Real keystores are nowhere near the ceiling: openssl writes 2048 and keytool 10000.
const ITERATION_PARAM_OIDS = new Set([
  "1.2.840.113549.1.5.12",
  "1.2.840.113549.1.12.1.1",
  "1.2.840.113549.1.12.1.2",
  "1.2.840.113549.1.12.1.3",
  "1.2.840.113549.1.12.1.4",
  "1.2.840.113549.1.12.1.5",
  "1.2.840.113549.1.12.1.6"
]);

const MAX_KDF_ROUNDS = 500_000;
const MAX_NESTING_DEPTH = 16;

const asn1Integer = (node: forge.asn1.Asn1) => {
  if (typeof node.value !== "string") return 0;
  try {
    return forge.asn1.derToInteger(node.value);
  } catch {
    // Wider than an iteration count ever is, so it is not one.
    return 0;
  }
};

const declaredKdfRounds = (node: forge.asn1.Asn1, depth = 0): number => {
  if (depth > MAX_NESTING_DEPTH) return 0;

  // A PKCS#12 carries its safe contents as DER inside an octet string, and the shrouded key bags
  // that state the largest counts live in there, so the walk has to open them.
  if (!Array.isArray(node.value)) {
    if (node.type !== forge.asn1.Type.OCTETSTRING || typeof node.value !== "string") return 0;
    try {
      return declaredKdfRounds(forge.asn1.fromDer(node.value), depth + 1);
    } catch {
      return 0;
    }
  }

  const children = node.value;
  let total = 0;

  const [first, second, third] = children;
  if (
    first?.type === forge.asn1.Type.OID &&
    typeof first.value === "string" &&
    Array.isArray(second?.value)
  ) {
    if (ITERATION_PARAM_OIDS.has(forge.asn1.derToOid(first.value))) {
      const count = second.value.find((param) => param.type === forge.asn1.Type.INTEGER);
      if (count) total += asn1Integer(count);
    }
  }

  // MacData: the digest, its salt, then the count.
  if (
    children.length === 3 &&
    Array.isArray(first?.value) &&
    second?.type === forge.asn1.Type.OCTETSTRING &&
    third?.type === forge.asn1.Type.INTEGER
  ) {
    total += asn1Integer(third);
  }

  children.forEach((child) => {
    total += declaredKdfRounds(child, depth + 1);
  });

  return total;
};

const binaryString = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
};

const extractPkcs12Entries = async ({
  pkcs12,
  password
}: {
  pkcs12: Uint8Array;
  password: string;
}): Promise<{ entries: TPkcs12Entry[] }> => {
  let asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(binaryString(pkcs12)));
  } catch {
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NotAKeystore);
  }

  if (declaredKdfRounds(asn1) > MAX_KDF_ROUNDS) {
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.TooExpensive);
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (err) {
    // Skipping the bags forge cannot model would mean re-encoding the authSafe, invalidating the
    // MAC and letting any password through. Refuse the keystore instead.
    if (err instanceof Error && err.message.includes("Unsupported PKCS#12 SafeBag type")) {
      throw new Pkcs12ExtractionError(Pkcs12ErrorCode.UnsupportedEntries);
    }
    // A MAC-less keystore surfaces a wrong password as an ASN.1 error, so this is not "corrupt".
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.BadPassword);
  }

  const { certBags, keyBags } = readBags(p12);
  const certs = await parseCertBags(certBags);
  const keys = parseKeyBags(keyBags);

  const entries: TPkcs12Entry[] = [];
  const seenPairs = new Set<string>();

  const describeCert = (cert: TParsedCert) => ({
    subject: cert.cert.subject.slice(0, MAX_SUBJECT_LENGTH),
    commonName: cert.cert.subjectName.getField("CN")[0]?.slice(0, MAX_SUBJECT_LENGTH) ?? null,
    altNames: readAltNames(cert.cert),
    notAfter: cert.cert.notAfter.toISOString(),
    fingerprintSha256: cert.fingerprint,
    certificatePem: cert.pem
  });

  if (!keys.length) {
    if (keyBags.length) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NoPairs, keyBags.length);
    if (!certs.length) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NoEntries);

    return {
      entries: certs.map((cert) => ({
        ...describeCert(cert),
        alias: cert.friendlyName?.slice(0, MAX_ALIAS_LENGTH) ?? null,
        chainWarning: null
      }))
    };
  }

  // A leaf is a certificate that signed nothing else in the file, which is what a keystore holding
  // one key and its issuers leaves over.
  const issuerSubjects = new Set(certs.map((cert) => cert.cert.issuer));
  const leaves = certs.filter(
    (cert) => !issuerSubjects.has(cert.cert.subject) || cert.cert.subject === cert.cert.issuer
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const key of keys) {
    const leaf = findLeafForKey(key, keys, certs, leaves);
    const pairId = leaf ? `${leaf.fingerprint}:${key.pem}` : null;

    if (leaf && pairId && !seenPairs.has(pairId)) {
      seenPairs.add(pairId);

      // eslint-disable-next-line no-await-in-loop
      const { chain, truncated } = await buildChain(leaf, certs);

      // importCert date-checks every certificate whose signature it verifies, so one member that is
      // expired or not yet valid would fail the whole chain. Send the entry on its own instead.
      const now = Date.now();
      const dateChecked = [leaf, ...chain.slice(0, -1)];
      const anyOutOfDate = dateChecked.some(
        (c) => c.cert.notAfter.getTime() < now || c.cert.notBefore.getTime() > now
      );
      const keepChain = chain.length > 0 && !anyOutOfDate && !truncated;

      entries.push({
        ...describeCert(leaf),
        alias: (key.friendlyName ?? leaf.friendlyName)?.slice(0, MAX_ALIAS_LENGTH) ?? null,
        keyAlgorithm: key.keyAlgorithm,
        chainWarning: keepChain ? null : CHAIN_WARNING,
        chainPem: keepChain ? chain.map((c) => c.pem).join("\n") : undefined,
        privateKeyPem: key.pem
      });
    }
  }

  if (!entries.length) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NoPairs, keys.length);

  return { entries };
};

const pkcs12ErrorMessage = (code: TPkcs12ErrorCode, count?: number) => {
  switch (code) {
    case Pkcs12ErrorCode.NotAKeystore:
      return "This file is not a valid PKCS#12 keystore. Upload a .p12 or .pfx file.";
    case Pkcs12ErrorCode.UnsupportedEntries:
      return "This keystore contains unsupported entry types, such as secret keys. Re-export it with only the certificate and its private key.";
    case Pkcs12ErrorCode.TooManyKeys:
      return `This keystore contains ${count ?? "too many"} private keys. Import at most ${MAX_KEY_BAGS} at a time, splitting the keystore if needed.`;
    case Pkcs12ErrorCode.TooManyCertificates:
      return `This keystore contains ${count ?? "too many"} certificates. Import at most ${MAX_CERT_BAGS} at a time, splitting the keystore if needed.`;
    case Pkcs12ErrorCode.TooExpensive:
      return `This keystore declares more than ${MAX_KDF_ROUNDS.toLocaleString()} key-derivation rounds, which is too expensive to open.`;
    case Pkcs12ErrorCode.NoEntries:
      return "This keystore contains no certificates or private keys.";
    case Pkcs12ErrorCode.NoPairs:
      return `This keystore contains ${count ?? "one or more"} private key${count === 1 ? "" : "s"} with no matching certificate. Re-export it with each certificate and its private key together.`;
    case Pkcs12ErrorCode.BadPassword:
    default:
      return "Could not decrypt the keystore. Check the password and try again.";
  }
};

// The dialog's single entry point. Errors come back as a message rather than a throw, so the modal
// never needs to import this module eagerly just to name the error class.
export const readKeystore = async (
  file: ArrayBuffer,
  password: string
): Promise<{ entries: TPkcs12Entry[]; error?: never } | { entries?: never; error: string }> => {
  try {
    return await extractPkcs12Entries({ pkcs12: new Uint8Array(file), password });
  } catch (err) {
    if (err instanceof Pkcs12ExtractionError)
      return { error: pkcs12ErrorMessage(err.code, err.count) };
    return { error: "Could not read this keystore." };
  }
};
