/* eslint-disable no-bitwise */
import type { JsonWebKey, KeyObject } from "node:crypto";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";

import { splitPemChain } from "./certificate-fns";

const JKS_MAGIC = 0xfeedfeed;
const JKS_VERSION = 2;
const JKS_PRIVATE_KEY_TAG = 1;
const JKS_TRUSTED_CERT_TAG = 2;
const JKS_CERT_TYPE = "X.509";
const JKS_INTEGRITY_WHITENER = "Mighty Aphrodite";
const SHA1_LENGTH = 20;
const MAX_JKS_ALIAS_LENGTH = 0xffff;

// DER of AlgorithmIdentifier { OID 1.3.6.1.4.1.42.2.17.1.1 (Sun JKS KeyProtector), NULL }.
const JKS_KEY_PROTECTOR_ALGORITHM_ID = Buffer.from("300e060a2b060104012a021101010500", "hex");

type TJksEntry =
  | { type: "privateKey"; alias: string; privateKey: string; certificateChain: string[] }
  | { type: "trustedCertificate"; alias: string; certificate: string };

const sha1 = (...parts: Buffer[]) => {
  const hash = crypto.nativeCrypto.createHash("sha1");
  parts.forEach((part) => hash.update(part));
  return hash.digest();
};

const toJavaPasswordBytes = (password: string) => Buffer.from(password, "utf16le").swap16();

const derLength = (length: number): Buffer => {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};

const derTlv = (tag: number, value: Buffer) => Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);

const protectPrivateKey = (pkcs8Der: Buffer, passwordBytes: Buffer): Buffer => {
  const salt = crypto.randomBytes(SHA1_LENGTH);
  const keystream: Buffer[] = [];
  let digest: Buffer = salt;
  for (let produced = 0; produced < pkcs8Der.length; produced += SHA1_LENGTH) {
    digest = sha1(passwordBytes, digest);
    keystream.push(digest);
  }
  const xorKey = Buffer.concat(keystream);
  const encrypted = Buffer.alloc(pkcs8Der.length);
  for (let i = 0; i < pkcs8Der.length; i += 1) {
    encrypted[i] = pkcs8Der[i] ^ xorKey[i];
  }
  const check = sha1(passwordBytes, pkcs8Der);

  const protectedKey = Buffer.concat([salt, encrypted, check]);
  return derTlv(0x30, Buffer.concat([JKS_KEY_PROTECTOR_ALGORITHM_ID, derTlv(0x04, protectedKey)]));
};

const u16 = (value: number) => {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value);
  return buf;
};

const u32 = (value: number) => {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value);
  return buf;
};

const u64 = (value: number) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(value));
  return buf;
};

// Java's DataOutputStream.writeUTF; only differs from UTF-8 for NUL and supplementary characters.
const javaUtf = (value: string) => {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > MAX_JKS_ALIAS_LENGTH) {
    throw new BadRequestError({ message: "JKS alias is too long" });
  }
  return Buffer.concat([u16(bytes.length), bytes]);
};

const certificateDer = (pem: string): Buffer => {
  try {
    return new crypto.nativeCrypto.X509Certificate(pem).raw;
  } catch {
    throw new BadRequestError({ message: "Failed to parse certificate for JKS export" });
  }
};

const JKS_SUPPORTED_KEY_TYPES = new Set(["rsa", "ec"]);
const JKS_SUPPORTED_EC_CURVES = new Set(["P-256", "P-384", "P-521"]);

// Java cannot load an EC key encoded with explicit curve parameters, so re-encode it with the named curve.
const toNamedCurveEcKey = (key: KeyObject): KeyObject => {
  let jwk: JsonWebKey | undefined;
  try {
    jwk = key.export({ format: "jwk" });
  } catch {
    jwk = undefined;
  }
  if (!jwk?.crv || !JKS_SUPPORTED_EC_CURVES.has(jwk.crv)) {
    throw new BadRequestError({
      message:
        "Java KeyStore export supports EC keys on the P-256, P-384, and P-521 curves only. Use PEM format instead."
    });
  }
  return crypto.nativeCrypto.createPrivateKey({ key: jwk, format: "jwk" });
};

const privateKeyPkcs8Der = (privateKeyPem: string, leafCertificatePem: string): Buffer => {
  let key;
  try {
    key = crypto.nativeCrypto.createPrivateKey({ key: privateKeyPem, format: "pem" });
  } catch {
    throw new BadRequestError({
      message: "The certificate's private key could not be read, so it cannot be exported as a Java KeyStore"
    });
  }
  if (!key.asymmetricKeyType || !JKS_SUPPORTED_KEY_TYPES.has(key.asymmetricKeyType)) {
    throw new BadRequestError({
      message: `Java KeyStore export supports RSA and EC keys only, and this certificate uses a '${key.asymmetricKeyType ?? "unknown"}' key. Use PEM format instead.`
    });
  }

  if (key.asymmetricKeyType === "ec") key = toNamedCurveEcKey(key);

  if (!new crypto.nativeCrypto.X509Certificate(leafCertificatePem).checkPrivateKey(key)) {
    throw new BadRequestError({
      message: "The certificate's private key does not match its public key, so it cannot be exported"
    });
  }

  return key.export({ type: "pkcs8", format: "der" });
};

const uniqueCertificates = (pems: string[], exclude: string[] = []): string[] => {
  const seen = new Set(exclude.map((pem) => certificateDer(pem).toString("base64")));
  return pems.filter((pem) => {
    const fingerprint = certificateDer(pem).toString("base64");
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
};

// Stored chains can include the leaf (imported full chains), which must not be repeated or trusted.
export const getJksChainCertificates = (certificate: string, certificateChain?: string): string[] =>
  uniqueCertificates(splitPemChain(certificateChain ?? ""), [certificate]);

// Built from the full stored chain because the delivered chain may have had its root removed.
export const getJksTruststoreCertificates = ({
  certificate,
  fullCertificateChain,
  caCertificate
}: {
  certificate: string;
  fullCertificateChain?: string;
  caCertificate?: string;
}): string[] =>
  uniqueCertificates(
    [...splitPemChain(fullCertificateChain ?? ""), ...splitPemChain(caCertificate ?? "")],
    [certificate]
  );

const encodeCertificate = (pem: string) => {
  const der = certificateDer(pem);
  return Buffer.concat([javaUtf(JKS_CERT_TYPE), u32(der.length), der]);
};

// Aliases are lowercased because JavaKeyStore lowercases every alias it looks up.
const buildJavaKeyStore = ({ entries, password }: { entries: TJksEntry[]; password: string }): Buffer => {
  if (!password || password.trim() === "") {
    throw new BadRequestError({ message: "Password is required for JKS keystore generation" });
  }

  const passwordBytes = toJavaPasswordBytes(password);
  const timestamp = Date.now();

  const encodedEntries = entries.map((entry) => {
    const alias = entry.alias.toLowerCase();

    if (entry.type === "trustedCertificate") {
      return Buffer.concat([
        u32(JKS_TRUSTED_CERT_TAG),
        javaUtf(alias),
        u64(timestamp),
        encodeCertificate(entry.certificate)
      ]);
    }

    const protectedKey = protectPrivateKey(
      privateKeyPkcs8Der(entry.privateKey, entry.certificateChain[0]),
      passwordBytes
    );
    return Buffer.concat([
      u32(JKS_PRIVATE_KEY_TAG),
      javaUtf(alias),
      u64(timestamp),
      u32(protectedKey.length),
      protectedKey,
      u32(entry.certificateChain.length),
      ...entry.certificateChain.map(encodeCertificate)
    ]);
  });

  const body = Buffer.concat([u32(JKS_MAGIC), u32(JKS_VERSION), u32(entries.length), ...encodedEntries]);
  const integrity = sha1(passwordBytes, Buffer.from(JKS_INTEGRITY_WHITENER, "utf8"), body);
  return Buffer.concat([body, integrity]);
};

export const generateJksFromCertificate = ({
  certificate,
  certificateChain,
  privateKey,
  password,
  alias
}: {
  certificate: string;
  certificateChain?: string;
  privateKey: string;
  password: string;
  alias: string;
}): Buffer =>
  buildJavaKeyStore({
    password,
    entries: [
      {
        type: "privateKey",
        alias,
        privateKey,
        certificateChain: [certificate, ...getJksChainCertificates(certificate, certificateChain)]
      }
    ]
  });

export const generateJksTruststore = ({
  trustedCertificates,
  password,
  alias
}: {
  trustedCertificates: string[];
  password: string;
  alias: string;
}): Buffer =>
  buildJavaKeyStore({
    password,
    entries: trustedCertificates.map((certificate, index) => ({
      type: "trustedCertificate" as const,
      alias: `${alias}-ca-${index + 1}`,
      certificate
    }))
  });
