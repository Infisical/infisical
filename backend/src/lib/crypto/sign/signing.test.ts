import nodeCrypto from "node:crypto";

// logger is initialized at app boot and is undefined under unit tests; stub it so failure
// paths surface their real result instead of a "logger is undefined" error
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { BadRequestError } from "@app/lib/errors";

// eslint-disable-next-line import/first
import { normalizeEcdsaSignatureToLowS, signingService } from "./signing";
// eslint-disable-next-line import/first
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "./types";

const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const SECP256K1_HALF_N = SECP256K1_N / BigInt(2);

const parseDerSignature = (sig: Buffer): { r: bigint; s: bigint } => {
  expect(sig[0]).toBe(0x30);
  let offset = 2;
  const readInt = (): bigint => {
    expect(sig[offset]).toBe(0x02);
    const length = sig[offset + 1];
    const bytes = sig.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    return BigInt(`0x${bytes.toString("hex")}`);
  };
  const r = readInt();
  const s = readInt();
  return { r, s };
};

const encodeDerSignature = (r: bigint, s: bigint): Buffer => {
  const toDerInt = (value: bigint) => {
    let hex = value.toString(16);
    if (hex.length % 2 === 1) hex = `0${hex}`;
    let bytes = Buffer.from(hex, "hex");
    if (bytes[0] >= 0x80) bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
    return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
  };
  const body = Buffer.concat([toDerInt(r), toDerInt(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
};

describe("signingService ECC_SECG_P256K1", () => {
  const service = signingService(AsymmetricKeyAlgorithm.ECC_SECG_P256K1);
  const data = Buffer.from("signing service test payload");

  test("generates a PKCS8 PEM private key on the secp256k1 curve with an SPKI DER public key", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    expect(privateKey.toString("utf8")).toContain("-----BEGIN PRIVATE KEY-----");

    const keyObj = nodeCrypto.createPrivateKey({ key: privateKey, format: "pem", type: "pkcs8" });
    expect(keyObj.asymmetricKeyType).toBe("ec");
    expect(keyObj.asymmetricKeyDetails?.namedCurve).toBe("secp256k1");

    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    // secp256k1 OID 1.3.132.0.10
    expect(publicKey.toString("hex")).toContain("06052b8104000a");
    // SPKI ends with the uncompressed EC point: 0x04 marker + 64 bytes of coordinates
    expect(publicKey.length).toBeGreaterThan(65);
    expect(publicKey.subarray(-65)[0]).toBe(0x04);
  });

  test("signs and verifies raw data", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);

    const signature = await service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_256, false);

    await expect(service.verify(data, signature, publicKey, SigningAlgorithm.ECDSA_SHA_256, false)).resolves.toBe(true);
    await expect(
      service.verify(Buffer.from("tampered payload"), signature, publicKey, SigningAlgorithm.ECDSA_SHA_256, false)
    ).resolves.toBe(false);
  });

  test("signs and verifies an externally computed 32-byte digest", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    // arbitrary 32-byte digest — provenance must not matter, only length
    const digest = nodeCrypto.randomBytes(32);

    const signature = await service.sign(digest, privateKey, SigningAlgorithm.ECDSA_SHA_256, true);

    await expect(service.verify(digest, signature, publicKey, SigningAlgorithm.ECDSA_SHA_256, true)).resolves.toBe(
      true
    );
    await expect(
      service.verify(nodeCrypto.randomBytes(32), signature, publicKey, SigningAlgorithm.ECDSA_SHA_256, true)
    ).resolves.toBe(false);
  }, 30000);

  test("always emits canonical low-s signatures on both the raw and digest paths", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();

    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const rawSig = await service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_256, false);
      expect(parseDerSignature(rawSig).s <= SECP256K1_HALF_N).toBe(true);

      // eslint-disable-next-line no-await-in-loop
      const digestSig = await service.sign(
        nodeCrypto.randomBytes(32),
        privateKey,
        SigningAlgorithm.ECDSA_SHA_256,
        true
      );
      expect(parseDerSignature(digestSig).s <= SECP256K1_HALF_N).toBe(true);
    }
  }, 60000);

  test("still verifies non-canonical high-s signatures", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);

    const signature = await service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_256, false);
    const { r, s } = parseDerSignature(signature);
    const highSSignature = encodeDerSignature(r, SECP256K1_N - s);

    await expect(service.verify(data, highSSignature, publicKey, SigningAlgorithm.ECDSA_SHA_256, false)).resolves.toBe(
      true
    );
  });

  test("rejects signing algorithms other than ECDSA_SHA_256", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    const signature = await service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_256, false);

    for (const signingAlgorithm of [
      SigningAlgorithm.ECDSA_SHA_384,
      SigningAlgorithm.ECDSA_SHA_512,
      SigningAlgorithm.RSASSA_PSS_SHA_256,
      SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(service.sign(data, privateKey, signingAlgorithm, false)).rejects.toThrow(BadRequestError);
    }

    await expect(service.verify(data, signature, publicKey, SigningAlgorithm.ECDSA_SHA_384, false)).rejects.toThrow(
      BadRequestError
    );
  });

  test("does not verify signatures against a different key", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const otherPrivateKey = await service.generateAsymmetricPrivateKey();
    const otherPublicKey = await service.getPublicKeyFromPrivateKey(otherPrivateKey);

    const signature = await service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_256, false);

    await expect(service.verify(data, signature, otherPublicKey, SigningAlgorithm.ECDSA_SHA_256, false)).resolves.toBe(
      false
    );
  });
});

describe("normalizeEcdsaSignatureToLowS", () => {
  test("returns low-s signatures unchanged", () => {
    const signature = encodeDerSignature(BigInt(5), BigInt(7));
    expect(normalizeEcdsaSignatureToLowS(signature, SECP256K1_N).equals(signature)).toBe(true);
  });

  test("flips high-s signatures and preserves r", () => {
    const r = SECP256K1_N - BigInt(1);
    const signature = encodeDerSignature(r, SECP256K1_N - BigInt(7));

    const normalized = parseDerSignature(normalizeEcdsaSignatureToLowS(signature, SECP256K1_N));
    expect(normalized.r).toBe(r);
    expect(normalized.s).toBe(BigInt(7));
  });

  test("rejects malformed input", () => {
    expect(() => normalizeEcdsaSignatureToLowS(Buffer.from("not a signature"), SECP256K1_N)).toThrow(BadRequestError);
    expect(() => normalizeEcdsaSignatureToLowS(Buffer.from([0x30, 0x02, 0x01, 0x01]), SECP256K1_N)).toThrow(
      BadRequestError
    );
  });
});

describe("signingService ECC_NIST_P256 regression", () => {
  const service = signingService(AsymmetricKeyAlgorithm.ECC_NIST_P256);
  const data = Buffer.from("p256 regression payload");

  test("keeps multi-hash ECDSA support and round-trips on both paths", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);

    const rawSig = await service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_384, false);
    await expect(service.verify(data, rawSig, publicKey, SigningAlgorithm.ECDSA_SHA_384, false)).resolves.toBe(true);

    const digest = nodeCrypto.createHash("sha256").update(data).digest();
    const digestSig = await service.sign(digest, privateKey, SigningAlgorithm.ECDSA_SHA_256, true);
    await expect(service.verify(digest, digestSig, publicKey, SigningAlgorithm.ECDSA_SHA_256, true)).resolves.toBe(
      true
    );
  }, 30000);
});
