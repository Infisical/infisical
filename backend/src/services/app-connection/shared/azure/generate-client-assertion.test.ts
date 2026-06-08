import { createPublicKey, createVerify, generateKeyPairSync } from "crypto";

import { BadRequestError } from "@app/lib/errors";

import { generateClientAssertion } from "./generate-client-assertion";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const decodeBase64Url = (segment: string): Buffer => Buffer.from(segment, "base64url");
const decodeJsonSegment = <T>(segment: string): T => JSON.parse(decodeBase64Url(segment).toString("utf8")) as T;

// Generate a real RSA keypair + a base64-wrapped "certificate" body once for the suite.
// generateClientAssertion only base64-decodes the certificate body and SHA-1s it, so any
// PEM-wrapped base64 blob works as the certificate input — no X.509 ASN.1 needed.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
const privateKeyDerBase64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicKeyDerBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const certificatePem = `-----BEGIN CERTIFICATE-----\n${publicKeyDerBase64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;

describe("generateClientAssertion", () => {
  test("returns a three-segment JWT with the expected header and claims", () => {
    const jwt = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyPem, certificatePem);

    const segments = jwt.split(".");
    expect(segments).toHaveLength(3);

    const header = decodeJsonSegment<{ alg: string; typ: string; x5t: string }>(segments[0]);
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("JWT");
    expect(header.x5t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, non-empty

    const payload = decodeJsonSegment<{
      aud: string;
      exp: number;
      iss: string;
      jti: string;
      nbf: number;
      sub: string;
    }>(segments[1]);
    expect(payload.aud).toBe(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`);
    expect(payload.iss).toBe(CLIENT_ID);
    expect(payload.sub).toBe(CLIENT_ID);
    expect(payload.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(payload.exp - payload.nbf).toBe(600);
  });

  test("signature verifies against the matching public key (PEM input)", () => {
    const jwt = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyPem, certificatePem);
    const [headerSeg, payloadSeg, signatureSeg] = jwt.split(".");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerSeg}.${payloadSeg}`);
    verifier.end();
    expect(verifier.verify(publicKey, decodeBase64Url(signatureSeg))).toBe(true);
  });

  test("signature verifies when private key is provided as bare base64 DER (no PEM wrapper)", () => {
    const jwt = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyDerBase64, certificatePem);
    const [headerSeg, payloadSeg, signatureSeg] = jwt.split(".");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerSeg}.${payloadSeg}`);
    verifier.end();
    expect(verifier.verify(publicKey, decodeBase64Url(signatureSeg))).toBe(true);
  });

  test("strips PEM markers and whitespace before computing the thumbprint", () => {
    const messyCertificate = certificatePem
      .replace("-----BEGIN CERTIFICATE-----", "  -----BEGIN CERTIFICATE-----\r\n")
      .replace("-----END CERTIFICATE-----", "\r\n-----END CERTIFICATE-----  ");

    const cleanJwt = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyPem, certificatePem);
    const messyJwt = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyPem, messyCertificate);

    const cleanX5t = decodeJsonSegment<{ x5t: string }>(cleanJwt.split(".")[0]).x5t;
    const messyX5t = decodeJsonSegment<{ x5t: string }>(messyJwt.split(".")[0]).x5t;
    expect(messyX5t).toBe(cleanX5t);
  });

  test("issues a fresh jti per call", () => {
    const a = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyPem, certificatePem);
    const b = generateClientAssertion(CLIENT_ID, TENANT_ID, privateKeyPem, certificatePem);
    const jtiA = decodeJsonSegment<{ jti: string }>(a.split(".")[1]).jti;
    const jtiB = decodeJsonSegment<{ jti: string }>(b.split(".")[1]).jti;
    expect(jtiA).not.toBe(jtiB);
  });

  test("throws BadRequestError when the private key is unparsable text", () => {
    expect(() => generateClientAssertion(CLIENT_ID, TENANT_ID, "not-a-real-private-key", certificatePem)).toThrow(
      BadRequestError
    );
    expect(() => generateClientAssertion(CLIENT_ID, TENANT_ID, "not-a-real-private-key", certificatePem)).toThrow(
      /Invalid private key format/
    );
  });

  test("throws BadRequestError when a PEM-wrapped private key has corrupted contents", () => {
    const corruptPem = "-----BEGIN PRIVATE KEY-----\nnotvalidbase64!!!\n-----END PRIVATE KEY-----";
    expect(() => generateClientAssertion(CLIENT_ID, TENANT_ID, corruptPem, certificatePem)).toThrow(BadRequestError);
  });

  test("throws BadRequestError when the bare base64 DER fallback path receives garbage", () => {
    // No "BEGIN PRIVATE KEY" → falls through to the DER fallback, which fails to parse.
    expect(() => generateClientAssertion(CLIENT_ID, TENANT_ID, "garbage-not-base64-der", certificatePem)).toThrow(
      BadRequestError
    );
  });

  // Sanity check that the suite's keypair fixture is sound — guards against future
  // node-crypto changes that could silently break the assumptions above.
  test("test fixture: regenerated public key from the private key matches the keypair public", () => {
    const recovered = createPublicKey(privateKeyPem);
    expect(recovered.export({ format: "der", type: "spki" }).toString("base64")).toBe(publicKeyDerBase64);
  });
});
