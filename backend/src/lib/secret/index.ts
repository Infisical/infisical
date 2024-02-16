import crypto from "crypto";
import { z } from "zod";

import { TProjectKeys } from "@app/db/schemas";
import { logger } from "@app/lib/logger";

import { decryptAsymmetric } from "../crypto";

export enum SecretDocType {
  Secret = "secret",
  SecretVersion = "secretVersion",
  ApprovalSecret = "approvalSecret"
}

export interface TPartialSecret {
  id: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;

  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;

  secretCommentCiphertext?: string | null;
  secretCommentIV?: string | null;
  secretCommentTag?: string | null;

  docType: SecretDocType;
  keyEncoding: string;
}

const PartialDecryptedSecretSchema = z.object({
  id: z.string(),
  secretKey: z.string(),
  secretValue: z.string(),
  secretComment: z.string().optional(),

  docType: z.nativeEnum(SecretDocType)
});
export type TPartialDecryptedSecret = z.infer<typeof PartialDecryptedSecretSchema>;

const decryptSecret = ({
  ciphertext,
  iv,
  tag,
  key
}: {
  ciphertext: string;
  iv: string;
  tag: string;
  key: string | Buffer;
}) => {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  let cleartext = decipher.update(ciphertext, "base64", "utf8");
  cleartext += decipher.final("utf8");

  return cleartext;
};

export const decryptSecrets = (
  encryptedSecrets: TPartialSecret[],
  privateKey: string,
  latestKey: TProjectKeys & {
    sender: {
      publicKey: string;
    };
  }
) => {
  const key = decryptAsymmetric({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey
  });

  const decryptedSecrets: TPartialDecryptedSecret[] = [];

  encryptedSecrets.forEach((encSecret) => {
    try {
      const secretKey = decryptSecret({
        ciphertext: encSecret.secretKeyCiphertext,
        iv: encSecret.secretKeyIV,
        tag: encSecret.secretKeyTag,
        key
      });

      const secretValue = decryptSecret({
        ciphertext: encSecret.secretValueCiphertext,
        iv: encSecret.secretValueIV,
        tag: encSecret.secretValueTag,
        key
      });

      const secretComment =
        encSecret.secretCommentCiphertext && encSecret.secretCommentIV && encSecret.secretCommentTag
          ? decryptSecret({
              ciphertext: encSecret.secretCommentCiphertext,
              iv: encSecret.secretCommentIV,
              tag: encSecret.secretCommentTag,
              key
            })
          : "";

      const decryptedSecret: TPartialDecryptedSecret = {
        id: encSecret.id,
        secretKey,
        secretValue,
        secretComment,
        docType: encSecret.docType
      };

      decryptedSecrets.push(PartialDecryptedSecretSchema.parse(decryptedSecret));
    } catch (err) {
      // This is ok, because we check that the decrypted secrets array length is the same as the encrypted secrets input array length.
      logger.error(`[${encSecret.id}] - failed to decrypt`, err);
    }
  });

  return decryptedSecrets;
};
