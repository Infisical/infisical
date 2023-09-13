export const base32Chars = Object.freeze("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"); // RFC4648 without padding

/**
 * Encode binary data to custom base32 representation.
 * @param {Buffer} input - Input binary data.
 * @returns {string} - Base32 encoded string.
 */
export const customBase32Encode = (input: Buffer): string => {
  if (!Buffer.isBuffer(input)) {
    throw new Error("Input must be a Buffer");
  }

  if (/[^A-Z2-7]/.test(base32Chars)) {
    throw new Error("Invalid characters in base32Chars");
  }

  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < input.length; i++) {
    value = (value << 8) | input[i];
    bits += 8;

    while (bits >= 5) {
      const index = (value >>> (bits - 5)) & 31;
      result += base32Chars[index];
      value &= ~(31 << (bits - 5));
      bits -= 5;
    }
  }

  if (bits > 0) {
    const index = (value << (5 - bits)) & 31;
    result += base32Chars[index];
  }

  return result;
};

/**
 * Decode custom base32 encoded string to binary data.
 * @param {string} input - Base32 encoded string.
 * @returns {Buffer} - Decoded binary data.
 */
export const customBase32Decode = (input: string): Buffer => {
  if (!input) {
    throw new Error("Input string cannot be null or undefined");
  }

  const pad = input.endsWith("=") ? input.lastIndexOf("=") : -1;
  const length = input.length + (pad === -1 ? 0 : 8 - (pad * 5) / 8);
  const output = Buffer.alloc(length);
  let bits = 0;
  let value = 0;
  let outputIndex = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input.charAt(i);
    const index = base32Chars.indexOf(char);

    if (index === -1) {
      throw new Error(`Invalid character "${char}" in input`);
    }

    value = (value << 5) | index;
    bits += 5;

    while (bits >= 8) {
      output[outputIndex++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }

  if (pad !== -1) {
    value <<= (5 * pad) % 8;
    bits += (5 * pad) % 8;

    while (bits >= 8) {
      output[outputIndex++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }

  if (bits > 0) {
    throw new Error("Input ended prematurely");
  }

  return Buffer.from(output.buffer, output.byteOffset, outputIndex);
};
