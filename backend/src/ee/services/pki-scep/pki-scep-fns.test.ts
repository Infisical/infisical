/* eslint-disable no-bitwise */
import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, test } from "vitest";

import { decodeAsn1ChallengePasswordValue, extractScepChallengePassword } from "./pki-scep-fns";

// Builds a DER-encoded ASN.1 string (tag + length + value) like @peculiar/x509 surfaces the attribute value.
const derString = (tag: number, value: string): Uint8Array => {
  const valueBytes = Buffer.from(value, "utf-8");
  const len = valueBytes.length;
  if (len < 0x80) {
    return Uint8Array.from([tag, len, ...valueBytes]);
  }
  // Long-form length: 0x80 | number-of-length-bytes, then the big-endian length bytes.
  const lenBytes: number[] = [];
  let remaining = len;
  while (remaining > 0) {
    lenBytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.from([tag, 0x80 | lenBytes.length, ...lenBytes, ...valueBytes]);
};

const UTF8_STRING_TAG = 0x0c;
const PRINTABLE_STRING_TAG = 0x13;

describe("decodeAsn1ChallengePasswordValue", () => {
  test("decodes a short-form UTF8String", () => {
    expect(decodeAsn1ChallengePasswordValue(derString(UTF8_STRING_TAG, "s3cret-pass"))).toBe("s3cret-pass");
  });

  test("decodes a PrintableString tag the same way", () => {
    expect(decodeAsn1ChallengePasswordValue(derString(PRINTABLE_STRING_TAG, "abc123"))).toBe("abc123");
  });

  test("decodes a long-form length (value >= 128 bytes)", () => {
    const long = "x".repeat(200);
    expect(decodeAsn1ChallengePasswordValue(derString(UTF8_STRING_TAG, long))).toBe(long);
  });

  test("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const u8 = derString(UTF8_STRING_TAG, "buffer-pass");
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    expect(decodeAsn1ChallengePasswordValue(ab)).toBe("buffer-pass");
  });

  test("preserves multibyte UTF-8 content", () => {
    expect(decodeAsn1ChallengePasswordValue(derString(UTF8_STRING_TAG, "pÄss-wörd-✓"))).toBe("pÄss-wörd-✓");
  });

  test("returns a plain string input unchanged", () => {
    expect(decodeAsn1ChallengePasswordValue("already-a-string")).toBe("already-a-string");
  });
});

describe("extractScepChallengePassword", () => {
  beforeAll(() => {
    x509.cryptoProvider.set(webcrypto as Crypto);
  });

  const generateCsr = async (attributes: x509.Attribute[]) => {
    const keys = await webcrypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: "CN=scep-device",
      keys,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      attributes
    });
    return new x509.Pkcs10CertificateRequest(csr.rawData);
  };

  test("extracts the challenge password embedded in a real CSR", async () => {
    const csr = await generateCsr([new x509.ChallengePasswordAttribute("device-challenge-123")]);
    expect(extractScepChallengePassword(csr)).toBe("device-challenge-123");
  });

  test("returns an empty string when the CSR carries no challenge password", async () => {
    const csr = await generateCsr([]);
    expect(extractScepChallengePassword(csr)).toBe("");
  });
});
