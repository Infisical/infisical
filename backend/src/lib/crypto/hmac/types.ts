import { z } from "zod";

export type THmacFns = {
  generateMac: (data: Buffer, key: Buffer) => Buffer;
  verifyMac: (data: Buffer, mac: Buffer, key: Buffer) => boolean;
  generateKeyMaterial: () => Buffer;
  getKeyByteLength: () => number;
};

export enum HmacAlgorithm {
  HMAC_SHA_1 = "HMAC_SHA_1",
  HMAC_SHA_224 = "HMAC_SHA_224",
  HMAC_SHA_256 = "HMAC_SHA_256",
  HMAC_SHA_384 = "HMAC_SHA_384",
  HMAC_SHA_512 = "HMAC_SHA_512"
}

export const HmacAlgorithmEnum = z.enum(Object.values(HmacAlgorithm) as [string, ...string[]]).options;
