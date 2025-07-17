import { KeyObject } from "crypto";
import fs from "fs/promises";
import path from "path";

import { crypto } from "./cryptography";

export const verifySignature = (data: string, signature: Buffer, publicKey: KeyObject) => {
  const verify = crypto.nativeCrypto.createVerify("SHA256");
  verify.update(data);
  verify.end();
  return verify.verify(publicKey, signature);
};

export const verifyOfflineLicense = async (licenseContents: string, signature: string) => {
  const publicKeyPem = await fs.readFile(path.join(__dirname, "license_public_key.pem"), "utf8");

  const publicKey = crypto.nativeCrypto.createPublicKey({
    key: publicKeyPem,
    format: "pem",
    type: "pkcs1"
  });

  return verifySignature(licenseContents, Buffer.from(signature, "base64"), publicKey);
};
