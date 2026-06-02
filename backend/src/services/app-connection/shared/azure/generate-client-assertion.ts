import type { KeyObject } from "crypto";
import RE2 from "re2";
import { v4 as uuidv4 } from "uuid";

import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

export const generateClientAssertion = (
  clientId: string,
  tenantId: string,
  privateKey: string,
  certificate: string
): string => {
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const certBuffer = Buffer.from(
    certificate
      .replace(new RE2("-----BEGIN CERTIFICATE-----"), "")
      .replace(new RE2("-----END CERTIFICATE-----"), "")
      .replace(new RE2("\\s", "g"), ""),
    "base64"
  );

  // thumbprint of the certificate is used for the jwt header
  const thumbprint = crypto.nativeCrypto.createHash("sha1").update(certBuffer).digest("hex");
  const x5t = Buffer.from(thumbprint, "hex").toString("base64url");

  // JWT Header
  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: tokenEndpoint,
    exp: now + 600, // expire the assertion in 10 minutes (not the access access token TTL, but rather the assertion TTL itself)
    iss: clientId,
    jti: uuidv4(), // random ID for the JWT
    nbf: now, // not before the jwt is valid
    sub: clientId
  };

  // encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  let keyObject: KeyObject;

  try {
    if (privateKey.includes("BEGIN PRIVATE KEY")) {
      keyObject = crypto.nativeCrypto.createPrivateKey(privateKey);
    } else {
      // if user forgot to wrap in begin/end private key, decode and use as der format
      keyObject = crypto.nativeCrypto.createPrivateKey({
        key: Buffer.from(privateKey, "base64"),
        format: "der",
        type: "pkcs8"
      });
    }
  } catch (error) {
    throw new BadRequestError({
      message: "Invalid private key format provided. Expected PEM format private key."
    });
  }

  // sign with private key
  const signer = crypto.nativeCrypto.createSign("RSA-SHA256");
  signer.update(signatureInput);
  signer.end();
  const signature = signer.sign(keyObject, "base64url");

  return `${signatureInput}.${signature}`;
};
