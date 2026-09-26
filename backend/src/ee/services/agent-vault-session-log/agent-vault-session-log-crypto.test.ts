import crypto from "node:crypto";

import { describe, expect, test } from "vitest";

const AAD_VERSION = "v1";

const buildAad = ({ sessionId, chunkId }: { sessionId: string; chunkId: string }) =>
  crypto.createHash("sha256").update(`${sessionId}|${chunkId}|${AAD_VERSION}`).digest();

const seal = (key: Buffer, iv: Buffer, aad: Buffer, plaintext: Buffer) => {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
};

const open = (key: Buffer, iv: Buffer, aad: Buffer, sealed: Buffer) => {
  const tag = sealed.subarray(sealed.length - 16);
  const body = sealed.subarray(0, sealed.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
};

const CONTEXT = {
  sessionId: "sess-1",
  chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab"
};

const KEY = Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex");
const IV = Buffer.from("aabbccddeeff001122334455", "hex");

const RECORDS = [
  {
    ts: "2026-09-16T10:31:04.221Z",
    seq: 1,
    proxyId: "proxy-1",
    method: "GET",
    host: "api.github.com",
    port: "443",
    path: "/zen",
    status: 200,
    decision: "brokered",
    service: "github",
    accessBundle: "code-review"
  }
];

describe("the sealed chunk wire contract", () => {
  test("a chunk round trips", () => {
    const aad = buildAad(CONTEXT);
    const plaintext = Buffer.from(JSON.stringify(RECORDS));
    expect(open(KEY, IV, aad, seal(KEY, IV, aad, plaintext)).toString()).toBe(plaintext.toString());
  });

  test("the sealed size is the plaintext plus a 16-byte tag, which is what ciphertextBytes reports", () => {
    const plaintext = Buffer.from(JSON.stringify(RECORDS));
    expect(seal(KEY, IV, buildAad(CONTEXT), plaintext)).toHaveLength(plaintext.length + 16);
  });

  test.each(["sessionId", "chunkId"] as const)("a chunk cannot be replayed under a different %s", (field) => {
    const sealed = seal(KEY, IV, buildAad(CONTEXT), Buffer.from(JSON.stringify(RECORDS)));
    const wrongAad = buildAad({ ...CONTEXT, [field]: "somewhere-else" });
    expect(() => open(KEY, IV, wrongAad, sealed)).toThrow();
  });

  test("a tampered byte fails the tag rather than decoding to something else", () => {
    const sealed = seal(KEY, IV, buildAad(CONTEXT), Buffer.from(JSON.stringify(RECORDS)));
    sealed.writeUInt8(sealed.readUInt8(0) === 0 ? 1 : 0, 0);
    expect(() => open(KEY, IV, buildAad(CONTEXT), sealed)).toThrow();
  });

  // Go's TestSealMatchesNodeVector and the browser's decryptSessionLogPage test both use these exact bytes.
  test("matches the pinned vector the Go proxy and the browser are checked against", () => {
    expect(buildAad(CONTEXT).toString("hex")).toBe("38d8f3b86fbbd1061f9d2a8bd91e6c49c51b6231936a7ecfc21c56e129f37a1c");
    expect(IV.toString("base64").replace(/=+$/, "")).toBe("qrvM3e7/ABEiM0RV");

    const sealed = seal(KEY, IV, buildAad(CONTEXT), Buffer.from(JSON.stringify(RECORDS)));
    expect(sealed.toString("base64")).toBe(
      "PLRwxBbgu+W68Br1N9gY1oUy8wjJxQClAtBh0NfJS1UcWOCPn3laS615sIqwFONhPIPNWRI3CA+a5tUJ7aoim0sQkE4d9gzou2mc/AWiCdToVBJPtdumA9jIzh3yAI81YPwcoDXEVnq2+7ooNNJShGdLX95itbrna/t4nFKRKSSgNzbH23eMtSMcSo72puk/2iwh4sVbTKzC2kwvbf1U6Mgd21zkIq2jDKKwhcT6mTfjPivW4FzmmkspQVMoWwANRX+QVyXzrMipZfoq5N/UcUI6rCvRUkqg+3ST5GVMelW0mjOO"
    );
  });
});
