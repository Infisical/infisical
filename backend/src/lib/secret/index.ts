import crypto from "crypto";
import { z } from "zod";

import {
  SecretApprovalRequestsSecretsSchema,
  SecretsSchema,
  SecretVersionsSchema,
  TProjectKeys,
  TSecretApprovalRequestsSecrets,
  TSecrets,
  TSecretVersions
} from "@app/db/schemas";

import { decryptAsymmetric } from "../crypto";

const DecryptedValuesSchema = z.object({
  id: z.string(),
  secretKey: z.string(),
  secretValue: z.string(),
  secretComment: z.string().optional()
});

const DecryptedSecretSchema = z.object({
  decrypted: DecryptedValuesSchema,
  original: SecretsSchema
});

const DecryptedSecretVersionsSchema = z.object({
  decrypted: DecryptedValuesSchema,
  original: SecretVersionsSchema
});

export const DecryptedSecretApprovalsSchema = z.object({
  decrypted: DecryptedValuesSchema,
  original: SecretApprovalRequestsSecretsSchema
});

export type DecryptedSecret = z.infer<typeof DecryptedSecretSchema>;
export type DecryptedSecretVersions = z.infer<typeof DecryptedSecretVersionsSchema>;
export type DecryptedSecretApprovals = z.infer<typeof DecryptedSecretApprovalsSchema>;

const decryptCipher = ({
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

const getDecryptedValues = ({
  secretKeyCiphertext,
  secretKeyIV,
  secretKeyTag,
  secretValueCiphertext,
  secretValueIV,
  secretValueTag,

  secretCommentCiphertext,
  secretCommentIV,
  secretCommentTag,
  key
}: {
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentCiphertext?: string | null;
  secretCommentIV?: string | null;
  secretCommentTag?: string | null;
  key: string | Buffer;
}) => {
  const secretKey = decryptCipher({
    ciphertext: secretKeyCiphertext,
    iv: secretKeyIV,
    tag: secretKeyTag,
    key
  });

  const secretValue = decryptCipher({
    ciphertext: secretValueCiphertext,
    iv: secretValueIV,
    tag: secretValueTag,
    key
  });

  const secretComment =
    secretCommentCiphertext && secretCommentIV && secretCommentTag
      ? decryptCipher({
          ciphertext: secretCommentCiphertext,
          iv: secretCommentIV,
          tag: secretCommentTag,
          key
        })
      : "";

  return {
    secretKey,
    secretValue,
    secretComment
  };
};
export const decryptSecrets = (
  encryptedSecrets: TSecrets[],
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

  const decryptedSecrets: DecryptedSecret[] = [];

  encryptedSecrets.forEach((encSecret) => {
    const decrypted = getDecryptedValues({
      secretKeyCiphertext: encSecret.secretKeyCiphertext,
      secretKeyIV: encSecret.secretKeyIV,
      secretKeyTag: encSecret.secretKeyTag,
      secretValueCiphertext: encSecret.secretValueCiphertext,
      secretValueIV: encSecret.secretValueIV,
      secretValueTag: encSecret.secretValueTag,
      secretCommentCiphertext: encSecret.secretCommentCiphertext,
      secretCommentIV: encSecret.secretCommentIV,
      secretCommentTag: encSecret.secretCommentTag,
      key
    });

    const decryptedSecret: DecryptedSecret = {
      decrypted: {
        ...decrypted,
        id: encSecret.id
      },
      original: encSecret
    };

    decryptedSecrets.push(DecryptedSecretSchema.parse(decryptedSecret));
  });

  return decryptedSecrets;
};

export const decryptSecretVersions = (
  encryptedSecretVersions: TSecretVersions[],
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

  const decryptedSecrets: DecryptedSecretVersions[] = [];

  encryptedSecretVersions.forEach((encSecret) => {
    const decrypted = getDecryptedValues({
      secretKeyCiphertext: encSecret.secretKeyCiphertext,
      secretKeyIV: encSecret.secretKeyIV,
      secretKeyTag: encSecret.secretKeyTag,
      secretValueCiphertext: encSecret.secretValueCiphertext,
      secretValueIV: encSecret.secretValueIV,
      secretValueTag: encSecret.secretValueTag,
      secretCommentCiphertext: encSecret.secretCommentCiphertext,
      secretCommentIV: encSecret.secretCommentIV,
      secretCommentTag: encSecret.secretCommentTag,
      key
    });

    const decryptedSecret: DecryptedSecretVersions = {
      decrypted: {
        ...decrypted,
        id: encSecret.id
      },
      original: encSecret
    };

    decryptedSecrets.push(DecryptedSecretVersionsSchema.parse(decryptedSecret));
  });

  return decryptedSecrets;
};

export const decryptSecretApprovals = (
  encryptedSecretApprovals: TSecretApprovalRequestsSecrets[],
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

  const decryptedSecrets: DecryptedSecretApprovals[] = [];

  encryptedSecretApprovals.forEach((encSecret) => {
    const decrypted = getDecryptedValues({
      secretKeyCiphertext: encSecret.secretKeyCiphertext,
      secretKeyIV: encSecret.secretKeyIV,
      secretKeyTag: encSecret.secretKeyTag,
      secretValueCiphertext: encSecret.secretValueCiphertext,
      secretValueIV: encSecret.secretValueIV,
      secretValueTag: encSecret.secretValueTag,
      secretCommentCiphertext: encSecret.secretCommentCiphertext,
      secretCommentIV: encSecret.secretCommentIV,
      secretCommentTag: encSecret.secretCommentTag,
      key
    });

    const decryptedSecret: DecryptedSecretApprovals = {
      decrypted: {
        ...decrypted,
        id: encSecret.id
      },
      original: encSecret
    };

    decryptedSecrets.push(DecryptedSecretApprovalsSchema.parse(decryptedSecret));
  });

  return decryptedSecrets;
};
