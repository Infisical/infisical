import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPublicKeyFormat, parsePublicKey } from "./utils";

const spkiBase64 =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKPYcb/bj7vUM2NPbo+6dH0BMN8uL5Zl/Vp3VcpbUQYp/xyWjnM9uuMGLkp8HTADcMF0hUiW4O0v4u1kk61Az1A==";
const spkiBytes = Buffer.from(spkiBase64, "base64");
const spkiPem = `-----BEGIN PUBLIC KEY-----
${spkiBase64.match(/.{1,64}/g)?.join("\n")}
-----END PUBLIC KEY-----`;

describe("public key parsing", () => {
  it("accepts PEM, base64 DER/SPKI, hexadecimal, and byte-array public keys", () => {
    const inputs = [
      ["pem", spkiPem],
      ["base64", spkiBase64],
      ["hexadecimal", `0x${spkiBytes.toString("hex")}`],
      ["byte-array", JSON.stringify([...spkiBytes])]
    ] as const;

    inputs.forEach(([format, input]) => {
      assert.equal(getPublicKeyFormat(input), format);
      assert.deepEqual(parsePublicKey(input), spkiBytes);
    });
  });

  it("rejects malformed values and PEM values that are not public keys", () => {
    assert.equal(getPublicKeyFormat("not a public key"), undefined);
    assert.equal(getPublicKeyFormat("[1, 256]"), undefined);
    assert.equal(
      getPublicKeyFormat("-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----"),
      undefined
    );
  });
});
