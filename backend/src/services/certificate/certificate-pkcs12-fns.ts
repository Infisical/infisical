import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import forge from "node-forge";
import RE2 from "re2";

// The extraction worker imports this module directly, and in development Node strips its types
// without a compiler: no enums or other non-erasable TypeScript anywhere this module reaches.
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
  altNames: string | null;
  keyAlgorithm: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  fingerprintSha256: string;
  chainWarning: string | null;
  certificatePem: string;
  chainPem?: string;
  privateKeyPem?: string;
};

export type TExtractPkcs12Result = {
  entries: TPkcs12Entry[];
};

const MAX_KEY_BAGS = 20;
const MAX_CERT_BAGS = 100;
const MAX_CHAIN_DEPTH = 10;

const CHAIN_WARNING = "No usable issuer chain was found in the keystore, so this will be imported on its own.";

const MAX_SUBJECT_LENGTH = 2048;
const MAX_SERIAL_LENGTH = 256;
const MAX_ALIAS_LENGTH = 1024;

const toPem = (type: string, derBytes: string) => forge.pem.encode({ type, body: derBytes });

const bagAttribute = (bag: forge.pkcs12.Bag, name: "friendlyName" | "localKeyId"): string | null => {
  const values = (bag.attributes as Record<string, string[] | undefined>)[name];
  return values?.length ? values[0] : null;
};

// forge leaves `bag.key` / `bag.cert` null for anything non-RSA and hands back the decrypted ASN.1
// instead, so never consume its parsed objects: the ASN.1 is what makes EC, Ed25519 and PQC work.
const certBagToPem = (bag: forge.pkcs12.Bag) => {
  const asn1 = bag.cert ? forge.pki.certificateToAsn1(bag.cert) : bag.asn1;
  if (!asn1) return null;
  return toPem("CERTIFICATE", forge.asn1.toDer(asn1).getBytes());
};

const keyBagToPem = (bag: forge.pkcs12.Bag) => {
  const asn1 = bag.asn1 ?? (bag.key ? forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(bag.key)) : null);
  if (!asn1) return null;
  return toPem("PRIVATE KEY", forge.asn1.toDer(asn1).getBytes());
};

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
  if (type === "unknown") return "";
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

const findLeafForKey = (key: TParsedKey, certs: TParsedCert[]) => {
  const matches = certs.filter((c) => Buffer.from(c.cert.publicKey.rawData).toString("hex") === key.spki);
  if (matches.length <= 1) return matches[0] ?? null;
  return matches.find((c) => c.localKeyId && c.localKeyId === key.localKeyId) ?? matches[0];
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
    // Skipping the bags forge cannot model would mean re-encoding the authSafe, invalidating the
    // MAC and letting any password through. Refuse the keystore instead.
    if (err instanceof Error && err.message.includes("Unsupported PKCS#12 SafeBag type")) {
      throw new Pkcs12ExtractionError(Pkcs12ErrorCode.UnsupportedEntries);
    }
    // A MAC-less keystore surfaces a wrong password as an ASN.1 error, so this is not "corrupt".
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
    altNames: readAltNames(cert.cert),
    serialNumber: cert.cert.serialNumber.slice(0, MAX_SERIAL_LENGTH),
    notBefore: cert.cert.notBefore.toISOString(),
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
        keyAlgorithm: cert.cert.publicKey.algorithm.name,
        chainWarning: null
      }))
    };
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const key of keys) {
    const leaf = findLeafForKey(key, certs);
    const pairId = leaf ? `${leaf.fingerprint}:${key.spki}` : null;

    if (leaf && pairId && !seenPairs.has(pairId)) {
      seenPairs.add(pairId);

      // eslint-disable-next-line no-await-in-loop
      const { chain, truncated } = await buildChain(leaf, certs);

      // importCert date-checks every certificate whose signature it verifies, so one member that is
      // expired or not yet valid would fail the whole chain. Send the entry on its own instead.
      const now = Date.now();
      const dateChecked = [leaf, ...chain.slice(0, -1)];
      const anyOutOfDate = dateChecked.some((c) => c.cert.notAfter.getTime() < now || c.cert.notBefore.getTime() > now);
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
