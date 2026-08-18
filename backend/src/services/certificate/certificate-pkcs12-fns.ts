import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import forge from "node-forge";
import RE2 from "re2";

// This module is loaded inside a worker thread, so it must not reach into services, DALs or
// anything that touches config at import time. Keep the imports above to leaf libraries only.

// Deliberately a const object rather than an enum: this module is loaded by the extraction worker,
// which in development is read straight off disk by Node's type stripping. That rejects enums and
// anything else non-erasable.
export const Pkcs12ErrorCode = {
  NotAKeystore: "not_a_keystore",
  BadPassword: "bad_password",
  UnsupportedEntries: "unsupported_entries",
  TooManyBags: "too_many_bags",
  NoEntries: "no_entries",
  NoPairs: "no_pairs"
} as const;

export type TPkcs12ErrorCode = (typeof Pkcs12ErrorCode)[keyof typeof Pkcs12ErrorCode];

export class Pkcs12ExtractionError extends Error {
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
  keyAlgorithm: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  fingerprintSha256: string;
  chainWarning: string | null;
  certificatePem: string;
  chainPem?: string;
  // Absent for a keystore that holds certificates only, which imports the same way a certificate
  // pasted into the PEM form without a key does.
  privateKeyPem?: string;
};

export type TExtractPkcs12Result = {
  entries: TPkcs12Entry[];
};

const MAX_KEY_BAGS = 20;
const MAX_CERT_BAGS = 100;
const MAX_CHAIN_DEPTH = 10;

// Every reason a chain is missing leads to the same outcome, so they read the same. Which reason it
// was stays in the shape of the result: no chainPem.
const CHAIN_WARNING = "No usable issuer chain was found in the keystore, so this will be imported on its own.";

// Subject and serial come from the uploaded file and have no useful bound of their own. A
// certificate with dozens of subject attributes would otherwise fail the response schema, which
// surfaces as a 500 rather than as anything the caller can act on.
const MAX_SUBJECT_LENGTH = 2048;
const MAX_SERIAL_LENGTH = 256;
const MAX_ALIAS_LENGTH = 1024;

const toPem = (type: string, derBytes: string) => forge.pem.encode({ type, body: derBytes });

const bagAttribute = (bag: forge.pkcs12.Bag, name: "friendlyName" | "localKeyId"): string | null => {
  const values = (bag.attributes as Record<string, string[] | undefined>)[name];
  return values?.length ? values[0] : null;
};

/**
 * forge cannot build key or certificate objects for EC (and anything else non-RSA): it leaves
 * `bag.key` / `bag.cert` null and hands back the decrypted ASN.1 instead. Reading the ASN.1 is
 * what makes EC, Ed25519 and PQC keystores work, so never consume the parsed objects directly.
 */
const certBagToPem = (bag: forge.pkcs12.Bag) => {
  const asn1 = bag.cert ? forge.pki.certificateToAsn1(bag.cert) : bag.asn1;
  if (!asn1) return null;
  return toPem("CERTIFICATE", forge.asn1.toDer(asn1).getBytes());
};

const keyBagToPem = (bag: forge.pkcs12.Bag) => {
  // bag.asn1 is already a PKCS#8 PrivateKeyInfo; an RSA key parsed into an object has to be
  // wrapped back into one so both paths hand out the same PEM type.
  const asn1 = bag.asn1 ?? (bag.key ? forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(bag.key)) : null);
  if (!asn1) return null;
  return toPem("PRIVATE KEY", forge.asn1.toDer(asn1).getBytes());
};

const sha256Fingerprint = (der: Buffer) => {
  const hex = crypto.createHash("sha256").update(der).digest("hex").toUpperCase();
  return new RE2(".{2}", "g").match(hex)?.join(":") ?? hex;
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
  spki: string;
  keyAlgorithm: string;
  localKeyId: string | null;
  friendlyName: string | null;
};

const EC_CURVE_LABELS: Record<string, string> = {
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521",
  secp256k1: "secp256k1"
};

/**
 * Label the key from the private key object rather than from the certificate's WebCrypto
 * algorithm name, which reads as "RSASSA-PKCS1-v1_5" and degrades to a bare OID for PQC.
 */
const describeKey = (key: crypto.KeyObject) => {
  const type = key.asymmetricKeyType ?? "unknown";
  const details = key.asymmetricKeyDetails;

  if (type === "rsa" || type === "rsa-pss") {
    return details?.modulusLength ? `RSA ${details.modulusLength}` : "RSA";
  }
  if (type === "ec") {
    const curve = details?.namedCurve;
    return `ECDSA ${curve ? (EC_CURVE_LABELS[curve] ?? curve) : ""}`.trim();
  }
  if (type === "ed25519") return "Ed25519";
  if (type === "ed448") return "Ed448";
  return type.toUpperCase();
};

const readBags = (p12: forge.pkcs12.Pkcs12Pfx) => {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const shrouded =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const keyBags = [...shrouded, ...plain];

  if (keyBags.length > MAX_KEY_BAGS) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.TooManyBags, keyBags.length);
  if (certBags.length > MAX_CERT_BAGS) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.TooManyBags, certBags.length);

  return { certBags, keyBags };
};

const parseCertBags = (certBags: forge.pkcs12.Bag[]) => {
  const byFingerprint = new Map<string, TParsedCert>();

  certBags.forEach((bag) => {
    const pem = certBagToPem(bag);
    if (!pem) return;

    try {
      const cert = new x509.X509Certificate(pem);
      const fingerprint = sha256Fingerprint(Buffer.from(cert.rawData));
      // keytool writes one copy of each CA certificate per entry, so the same certificate shows
      // up several times in a bundle.
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
      // A certificate we cannot parse is not something we can import; the keystore's other
      // entries are still usable.
    }
  });

  return [...byFingerprint.values()];
};

const parseKeyBags = (keyBags: forge.pkcs12.Bag[]) => {
  const keys: TParsedKey[] = [];

  keyBags.forEach((bag) => {
    const pem = keyBagToPem(bag);
    const friendlyName = bagAttribute(bag, "friendlyName");

    let spki: string | null = null;
    let keyAlgorithm = "";
    if (pem) {
      try {
        const keyObject = crypto.createPrivateKey(pem);
        spki = crypto.createPublicKey(keyObject).export({ format: "der", type: "spki" }).toString("hex");
        keyAlgorithm = describeKey(keyObject);
      } catch {
        spki = null;
      }
    }

    if (pem && spki) {
      keys.push({ pem, spki, keyAlgorithm, localKeyId: bagAttribute(bag, "localKeyId"), friendlyName });
    }
  });

  return keys;
};

/**
 * Pair on the public key rather than on localKeyId. A mangled or duplicated localKeyId otherwise
 * pairs a key with the wrong certificate, which only surfaces later as a confusing "private key
 * does not match certificate" at import. localKeyId is used only to break ties.
 */
const findLeafForKey = (key: TParsedKey, certs: TParsedCert[]) => {
  const matches = certs.filter((c) => Buffer.from(c.cert.publicKey.rawData).toString("hex") === key.spki);
  if (matches.length <= 1) return matches[0] ?? null;
  return matches.find((c) => c.localKeyId && c.localKeyId === key.localKeyId) ?? matches[0];
};

/**
 * Walk from the leaf to the root by signature, not by matching issuer and subject names. A
 * keystore that has been through a CA renewal carries two intermediates with the same subject and
 * different keys, and picking by name silently produces a chain that fails verification at import.
 *
 * `signatureOnly` is required: the default also checks validity dates, so an expired certificate
 * would lose its chain entirely.
 */
const buildChain = async (leaf: TParsedCert, certs: TParsedCert[]) => {
  const chain: TParsedCert[] = [];
  const visited = new Set<string>([leaf.fingerprint]);
  let current = leaf;
  let truncated = false;

  while (chain.length < MAX_CHAIN_DEPTH) {
    const subject = current;
    if (subject.cert.subject === subject.cert.issuer) break;

    // Name matches first: this only orders the search, the signature decides.
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
      const signed = await subject.cert.verify({ publicKey: candidate.cert.publicKey, signatureOnly: true }).catch(
        // A key type WebCrypto cannot verify (ML-DSA, secp256k1) is not a failed match, it is an
        // unanswerable question; treat it as no match and let the caller warn.
        () => false
      );
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

export const extractPkcs12Entries = async ({
  pkcs12,
  password
}: {
  pkcs12: Buffer;
  password: string;
}): Promise<TExtractPkcs12Result> => {
  let asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(pkcs12.toString("binary")));
  } catch {
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NotAKeystore);
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (err) {
    // forge aborts the whole parse on a bag type it does not model (secret keys from keytool, for
    // one). Stripping those bags would mean re-encoding the authSafe, which invalidates the MAC
    // and would let any password through, so the keystore is refused by name instead.
    if (err instanceof Error && err.message.includes("Unsupported PKCS#12 SafeBag type")) {
      throw new Pkcs12ExtractionError(Pkcs12ErrorCode.UnsupportedEntries);
    }
    // Everything from here on is a decryption failure of some kind. MAC-less keystores surface a
    // wrong password as an ASN.1 error, so this must not be reported as a corrupt file.
    throw new Pkcs12ExtractionError(Pkcs12ErrorCode.BadPassword);
  }

  const { certBags, keyBags } = readBags(p12);
  const certs = parseCertBags(certBags);
  const keys = parseKeyBags(keyBags);

  const entries: TPkcs12Entry[] = [];
  const seenPairs = new Set<string>();

  const describeCert = (cert: TParsedCert) => ({
    subject: cert.cert.subject.slice(0, MAX_SUBJECT_LENGTH),
    commonName: cert.cert.subjectName.getField("CN")[0]?.slice(0, MAX_SUBJECT_LENGTH) ?? null,
    serialNumber: cert.cert.serialNumber.slice(0, MAX_SERIAL_LENGTH),
    notBefore: cert.cert.notBefore.toISOString(),
    notAfter: cert.cert.notAfter.toISOString(),
    fingerprintSha256: cert.fingerprint,
    certificatePem: cert.pem
  });

  // A keystore holding only certificates is a trust store. The PEM form accepts a certificate
  // without a private key, so this does too: each certificate becomes its own entry, flat.
  if (!keys.length) {
    if (keyBags.length) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NoPairs, keyBags.length);
    if (!certs.length) throw new Pkcs12ExtractionError(Pkcs12ErrorCode.NoEntries);

    return {
      entries: certs.map((cert) => ({
        ...describeCert(cert),
        alias: cert.friendlyName?.slice(0, MAX_ALIAS_LENGTH) ?? null,
        keyAlgorithm: cert.cert.publicKey.algorithm.name,
        chainWarning: null
      }))
    };
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const key of keys) {
    const leaf = findLeafForKey(key, certs);
    const pairId = leaf ? `${leaf.fingerprint}:${key.spki}` : null;

    // The same pair stored under two aliases is one certificate; importing it twice would just
    // fail on the duplicate serial.
    if (leaf && pairId && !seenPairs.has(pairId)) {
      seenPairs.add(pairId);

      // eslint-disable-next-line no-await-in-loop
      const { chain, truncated } = await buildChain(leaf, certs);

      // The import endpoint verifies each link including validity dates, and it checks the dates of
      // every certificate whose signature it verifies: the leaf and every chain member except the
      // last. An expired certificate in any of those positions makes the whole chain fail there, so
      // the entry is sent on its own instead. The last chain member is only used as a verifying key,
      // so its own expiry does not matter.
      const dateChecked = [leaf, ...chain.slice(0, -1)];
      const anyExpired = dateChecked.some((c) => c.cert.notAfter.getTime() < Date.now());
      const keepChain = chain.length > 0 && !anyExpired && !truncated;

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
