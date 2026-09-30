import { describe, expect, it } from "vitest";

import { ecdsaRawRsToDer } from "./pkcs11-algorithm-map";

const parseDerLength = (der: Buffer) => {
  expect(der[0]).toBe(0x30);
  if (der[1] <= 0x7f) return { headerBytes: 2, length: der[1] };
  expect(der[1]).toBe(0x81);
  return { headerBytes: 3, length: der[2] };
};

describe("ecdsaRawRsToDer", () => {
  it("should use the short form when the body fits in 127 bytes (P-256)", () => {
    const der = ecdsaRawRsToDer(Buffer.alloc(64, 0x11));
    const { headerBytes, length } = parseDerLength(der);

    expect(headerBytes).toBe(2);
    expect(der.length).toBe(headerBytes + length);
  });

  it("should use the long form when the body exceeds 127 bytes (P-521)", () => {
    const der = ecdsaRawRsToDer(Buffer.alloc(132, 0x7f));
    const { headerBytes, length } = parseDerLength(der);

    expect(headerBytes).toBe(3);
    expect(length).toBeGreaterThan(0x7f);
    expect(der.length).toBe(headerBytes + length);
  });

  it("should sign-pad a component whose high bit is set", () => {
    const der = ecdsaRawRsToDer(Buffer.alloc(64, 0xff));
    const { headerBytes } = parseDerLength(der);

    expect(der[headerBytes]).toBe(0x02);
    expect(der[headerBytes + 2]).toBe(0x00);
  });

  it("should reject an odd-length raw signature", () => {
    expect(() => ecdsaRawRsToDer(Buffer.alloc(65, 0x11))).toThrow();
  });
});
