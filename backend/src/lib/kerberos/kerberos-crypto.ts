/* eslint-disable no-bitwise */
import { crypto } from "@app/lib/crypto/cryptography";

import { KerberosKeyUsage } from "./kerberos-types";

const AES_BLOCK_BYTES = 16;
const HMAC_SHA1_96_BYTES = 12;
const USAGE_CONSTANT_BYTES = 5;
const NFOLD_ROTATION_BITS = 13;

enum KeyDerivationSuffix {
  Checksum = 0x99,
  Encryption = 0xaa,
  Integrity = 0x55
}

const greatestCommonDivisor = (a: number, b: number): number => (b ? greatestCommonDivisor(b, a % b) : a);

export const nfold = (input: Buffer, outBytes: number) => {
  const inBits = input.length * 8;
  const outBits = outBytes * 8;
  const lcm = (inBits * outBits) / greatestCommonDivisor(inBits, outBits);
  const expanded = Buffer.alloc(lcm / 8);
  for (let copy = 0; copy < lcm / inBits; copy += 1) {
    const rotation = NFOLD_ROTATION_BITS * copy;
    for (let bit = 0; bit < inBits; bit += 1) {
      const source = (((bit - rotation) % inBits) + inBits) % inBits;
      if ((input[source >> 3] >> (7 - (source & 7))) & 1) {
        const target = copy * inBits + bit;
        expanded[target >> 3] |= 1 << (7 - (target & 7));
      }
    }
  }

  const out = Buffer.alloc(outBytes);
  for (let offset = 0; offset < expanded.length; offset += outBytes) {
    let carry = 0;
    for (let index = outBytes - 1; index >= 0; index -= 1) {
      const sum = out[index] + expanded[offset + index] + carry;
      out[index] = sum & 0xff;
      carry = sum >> 8;
    }
    for (let index = outBytes - 1; carry && index >= 0; index -= 1) {
      const sum = out[index] + carry;
      out[index] = sum & 0xff;
      carry = sum >> 8;
    }
  }
  return out;
};

const aesEcbEncrypt = (key: Buffer, data: Buffer) => {
  const cipher = crypto.nativeCrypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
};

const aesEcbDecrypt = (key: Buffer, data: Buffer) => {
  const decipher = crypto.nativeCrypto.createDecipheriv(`aes-${key.length * 8}-ecb`, key, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

const xorBuffers = (a: Buffer, b: Buffer) => Buffer.from(a.map((value, index) => value ^ b[index]));

export const ctsEncrypt = (key: Buffer, data: Buffer) => {
  if (data.length <= AES_BLOCK_BYTES) {
    return aesEcbEncrypt(key, Buffer.concat([data, Buffer.alloc(AES_BLOCK_BYTES - data.length)]));
  }
  const padded = Buffer.concat([
    data,
    Buffer.alloc((AES_BLOCK_BYTES - (data.length % AES_BLOCK_BYTES)) % AES_BLOCK_BYTES)
  ]);
  const blocks: Buffer[] = [];
  let previous: Buffer = Buffer.alloc(AES_BLOCK_BYTES);
  for (let offset = 0; offset < padded.length; offset += AES_BLOCK_BYTES) {
    previous = aesEcbEncrypt(key, xorBuffers(padded.subarray(offset, offset + AES_BLOCK_BYTES), previous));
    blocks.push(previous);
  }
  const count = blocks.length;
  const lastLength = data.length - (count - 1) * AES_BLOCK_BYTES;
  return Buffer.concat([...blocks.slice(0, count - 2), blocks[count - 1], blocks[count - 2].subarray(0, lastLength)]);
};

export const ctsDecrypt = (key: Buffer, data: Buffer) => {
  if (data.length === AES_BLOCK_BYTES) return aesEcbDecrypt(key, data);
  const count = Math.ceil(data.length / AES_BLOCK_BYTES);
  const lastLength = data.length - (count - 1) * AES_BLOCK_BYTES;
  const blocks: Buffer[] = [];
  for (let index = 0; index < count; index += 1) {
    blocks.push(data.subarray(index * AES_BLOCK_BYTES, Math.min((index + 1) * AES_BLOCK_BYTES, data.length)));
  }
  const decryptedPenultimate = aesEcbDecrypt(key, blocks[count - 2]);
  const paddedLast = Buffer.concat([blocks[count - 1], decryptedPenultimate.subarray(lastLength)]);
  const lastPlain = xorBuffers(decryptedPenultimate.subarray(0, lastLength), blocks[count - 1]);
  const plainBlocks: Buffer[] = [];
  let previous: Buffer = Buffer.alloc(AES_BLOCK_BYTES);
  for (const block of [...blocks.slice(0, count - 2), paddedLast]) {
    plainBlocks.push(xorBuffers(aesEcbDecrypt(key, block), previous));
    previous = block;
  }
  return Buffer.concat([...plainBlocks, lastPlain]);
};

const deriveKey = (key: Buffer, usage: KerberosKeyUsage, suffix: KeyDerivationSuffix) => {
  const constant = Buffer.alloc(USAGE_CONSTANT_BYTES);
  constant.writeUInt32BE(usage);
  constant[4] = suffix;
  let block = nfold(constant, AES_BLOCK_BYTES);
  const derived: Buffer[] = [];
  let derivedLength = 0;
  while (derivedLength < key.length) {
    block = aesEcbEncrypt(key, block);
    derived.push(block);
    derivedLength += AES_BLOCK_BYTES;
  }
  return Buffer.concat(derived).subarray(0, key.length);
};

const hmacSha196 = (key: Buffer, data: Buffer) =>
  crypto.nativeCrypto.createHmac("sha1", key).update(data).digest().subarray(0, HMAC_SHA1_96_BYTES);

export const kerberosDecrypt = (key: Buffer, usage: KerberosKeyUsage, cipher: Buffer) => {
  if (cipher.length < AES_BLOCK_BYTES + HMAC_SHA1_96_BYTES) {
    throw new Error("Kerberos ciphertext is too short");
  }
  const plain = ctsDecrypt(
    deriveKey(key, usage, KeyDerivationSuffix.Encryption),
    cipher.subarray(0, cipher.length - HMAC_SHA1_96_BYTES)
  );
  const expectedMac = hmacSha196(deriveKey(key, usage, KeyDerivationSuffix.Integrity), plain);
  if (!crypto.nativeCrypto.timingSafeEqual(expectedMac, cipher.subarray(cipher.length - HMAC_SHA1_96_BYTES))) {
    throw new Error("Kerberos integrity check failed");
  }
  return plain.subarray(AES_BLOCK_BYTES);
};

export const kerberosEncrypt = (key: Buffer, usage: KerberosKeyUsage, plain: Buffer) => {
  const data = Buffer.concat([crypto.randomBytes(AES_BLOCK_BYTES), plain]);
  const mac = hmacSha196(deriveKey(key, usage, KeyDerivationSuffix.Integrity), data);
  return Buffer.concat([ctsEncrypt(deriveKey(key, usage, KeyDerivationSuffix.Encryption), data), mac]);
};

export const kerberosChecksum = (key: Buffer, usage: KerberosKeyUsage, data: Buffer) =>
  hmacSha196(deriveKey(key, usage, KeyDerivationSuffix.Checksum), data);
