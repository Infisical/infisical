import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSecureRandExp } from "./secure-randexp";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("secure RandExp", () => {
  it("uses Web Crypto for choices, repetitions and characters, never Math.random", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Insecure random source used");
    });
    const secureRandom = vi.spyOn(globalThis.crypto, "getRandomValues");
    const pattern = /^(ab|cd)[A-Z]{12,24}[0-9]{2}$/i;
    const value = buildSecureRandExp(pattern).gen();

    expect(value).toMatch(pattern);
    expect(secureRandom).toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it("includes both integer bounds and rejects the biased tail", () => {
    const samples = [0, 5, 2 ** 32 - 5, 2 ** 32 - 4, 2 ** 32 - 1, 2];
    const getRandomValues = vi.fn((array: Uint32Array) => {
      array.set([samples.shift()!]);
      return array;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const generator = buildSecureRandExp(/[a-f]/);

    expect(generator.randInt(10, 15)).toBe(10);
    expect(generator.randInt(10, 15)).toBe(15);
    expect(generator.randInt(10, 15)).toBe(15);
    expect(generator.randInt(10, 15)).toBe(12);
    expect(getRandomValues).toHaveBeenCalledTimes(6);
  });

  it("handles singleton and full uint32 ranges and refuses invalid bounds", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint32Array) => array.fill(2 ** 32 - 1)
    });
    const generator = buildSecureRandExp(/[a-z]/);

    expect(generator.randInt(7, 7)).toBe(7);
    expect(generator.randInt(0, 2 ** 32 - 1)).toBe(2 ** 32 - 1);
    expect(() => generator.randInt(1, 0)).toThrow(RangeError);
    expect(() => generator.randInt(0, 2 ** 32)).toThrow(RangeError);
    expect(() => generator.randInt(0.5, 2)).toThrow(RangeError);
    expect(() => generator.randInt(0, Infinity)).toThrow(RangeError);
  });

  it("fails without a value when Web Crypto is missing or fails", () => {
    const random = vi.spyOn(Math, "random");
    const generator = buildSecureRandExp(/[A-Z]{16}/);
    vi.stubGlobal("crypto", undefined);
    expect(() => generator.gen()).toThrow();

    vi.stubGlobal("crypto", {
      getRandomValues: () => {
        throw new Error("Secure randomness unavailable");
      }
    });
    expect(() => generator.gen()).toThrow("Secure randomness unavailable");
    expect(random).not.toHaveBeenCalled();
  });
});
