import { BadRequestError } from "@app/lib/errors";

import { CertificateThumbprintAlgorithm, normalizeThumbprint } from "./certificate-fns";

describe("normalizeThumbprint", () => {
  const sha1Hex = "a".repeat(40);
  const sha256Hex = "b".repeat(64);

  test("detects SHA-1 thumbprints and formats with colons", () => {
    const { algorithm, fingerprint } = normalizeThumbprint(sha1Hex);
    expect(algorithm).toBe(CertificateThumbprintAlgorithm.SHA1);
    expect(fingerprint).toBe(`${"AA:".repeat(19)}AA`);
  });

  test("detects SHA-256 thumbprints", () => {
    const { algorithm, fingerprint } = normalizeThumbprint(sha256Hex);
    expect(algorithm).toBe(CertificateThumbprintAlgorithm.SHA256);
    expect(fingerprint.replace(/:/g, "")).toBe("B".repeat(64));
  });

  test("ignores colons, whitespace, and casing", () => {
    const colonDelimited = sha1Hex.toUpperCase().match(/.{2}/g)!.join(":");
    const messyInput = `  ${colonDelimited.toLowerCase()}  `;

    const { algorithm, fingerprint } = normalizeThumbprint(messyInput);
    expect(algorithm).toBe(CertificateThumbprintAlgorithm.SHA1);
    expect(fingerprint).toBe(colonDelimited);
  });

  test("throws on invalid digest length", () => {
    expect(() => normalizeThumbprint("abc123")).toThrow(BadRequestError);
  });
});
