import crypto from "node:crypto";

export const keyAgreementService = () => {
  /**
   * @param publicKey utf8 string | Buffer
   * @param privateKey base64 string | Buffer
   * @returns
   */
  const deriveSharedSecret = (publicKey: string | Buffer, privateKey: string | Buffer) => {
    // Convert base64 keys back to key objects
    const pubKeyObj = crypto.createPublicKey({
      key: typeof publicKey === "string" ? Buffer.from(publicKey, "utf8") : publicKey,
      type: "spki",
      format: "der"
    });

    const privKeyObj = crypto.createPrivateKey({
      key: typeof privateKey === "string" ? Buffer.from(privateKey, "base64") : privateKey,
      type: "pkcs8",
      format: "pem"
    });

    // Generate same shared secret
    const sharedSecret = crypto.diffieHellman({
      privateKey: privKeyObj,
      publicKey: pubKeyObj
    });

    return sharedSecret;
  };

  return {
    deriveSharedSecret
  };
};
