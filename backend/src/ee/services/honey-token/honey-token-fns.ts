import { crypto } from "@app/lib/crypto/cryptography";

export const isValidHoneyTokenSignature = ({
  signingKey,
  timestamp,
  rawBody,
  signatureHash
}: {
  signingKey: string;
  timestamp: string;
  rawBody: string;
  signatureHash: string;
}) => {
  const expectedBuf = crypto.nativeCrypto.createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest();
  const receivedBuf = Buffer.from(signatureHash, "hex");

  return (
    expectedBuf.byteLength === receivedBuf.byteLength && crypto.nativeCrypto.timingSafeEqual(expectedBuf, receivedBuf)
  );
};
