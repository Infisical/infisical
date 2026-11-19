import RandExp from "randexp";

export const buildSecureRandExp = (pattern: RegExp): RandExp => {
  const instance = new RandExp(pattern);
  instance.randInt = (min, max) => {
    const range = max - min + 1;
    const sampleSpace = 2 ** 32;
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      range < 1 ||
      range > sampleSpace
    ) {
      throw new RangeError("Unsupported password generation bounds");
    }

    const limit = sampleSpace - (sampleSpace % range);
    const sample = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(sample);
    } while (sample[0] >= limit);

    return min + (sample[0] % range);
  };
  return instance;
};
