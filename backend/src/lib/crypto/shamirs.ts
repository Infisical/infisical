import shamirs from "secrets.js-grempe";

import { getConfig } from "../config/env";
import { symmetricCipherService, SymmetricEncryption } from "./cipher";

export const shamirsService = () => {
  const $generateBasicEncryptionKey = () => {
    const appCfg = getConfig();

    const encryptionKey = appCfg.ENCRYPTION_KEY || appCfg.ROOT_ENCRYPTION_KEY;
    const isBase64 = !appCfg.ENCRYPTION_KEY;
    if (!encryptionKey)
      throw new Error(
        "Root encryption key not found for KMS service. Did you set the ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY environment variables?"
      );

    return Buffer.from(encryptionKey, isBase64 ? "base64" : "utf8");
  };

  const share = (secretBuffer: Buffer, partsCount: number, thresholdCount: number) => {
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const hexSecret = Buffer.from(cipher.encrypt(secretBuffer, $generateBasicEncryptionKey())).toString("hex");

    const secretParts = shamirs.share(hexSecret, partsCount, thresholdCount);
    return secretParts;
  };

  const combine = (parts: string[]) => {
    const encryptedSecret = shamirs.combine(parts);

    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const decryptedSecret = cipher.decrypt(Buffer.from(encryptedSecret, "hex"), $generateBasicEncryptionKey());

    return decryptedSecret;
  };

  return { share, combine };
};
