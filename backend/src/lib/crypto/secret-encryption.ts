import nodeCrypto from "crypto";
import { z } from "zod";

import {
  IntegrationAuthsSchema,
  SecretApprovalRequestsSecretsSchema,
  SecretsSchema,
  SecretVersionsSchema,
  TIntegrationAuths,
  TProjectKeys,
  TSecretApprovalRequestsSecrets,
  TSecrets,
  TSecretVersions
} from "../../db/schemas";
import { crypto } from "./cryptography";

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

const DecryptedIntegrationAuthsSchema = z.object({
  decrypted: z.object({
    id: z.string(),
    access: z.string(),
    accessId: z.string(),
    refresh: z.string()
  }),
  original: IntegrationAuthsSchema
});

const DecryptedSecretVersionsSchema = z.object({
  decrypted: DecryptedValuesSchema,
  original: SecretVersionsSchema
});

const DecryptedSecretApprovalsSchema = z.object({
  decrypted: DecryptedValuesSchema,
  original: SecretApprovalRequestsSecretsSchema
});

type DecryptedSecret = z.infer<typeof DecryptedSecretSchema>;
type DecryptedSecretVersions = z.infer<typeof DecryptedSecretVersionsSchema>;
type DecryptedSecretApprovals = z.infer<typeof DecryptedSecretApprovalsSchema>;
type DecryptedIntegrationAuths = z.infer<typeof DecryptedIntegrationAuthsSchema>;

type TLatestKey = TProjectKeys & {
  sender: {
    publicKey: string;
  };
};

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
  const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  let cleartext = decipher.update(ciphertext, "base64", "utf8");
  cleartext += decipher.final("utf8");

  return cleartext;
};

const getDecryptedValues = (data: Array<{ ciphertext: string; iv: string; tag: string }>, key: string | Buffer) => {
  const results: string[] = [];

  for (const { ciphertext, iv, tag } of data) {
    if (!ciphertext || !iv || !tag) {
      results.push("");
    } else {
      results.push(decryptCipher({ ciphertext, iv, tag, key }));
    }
  }

  return results;
};
export const decryptSecrets = (encryptedSecrets: TSecrets[], privateKey: string, latestKey: TLatestKey) => {
  const key = crypto.encryption().asymmetric().decrypt({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey
  });

  const decryptedSecrets: DecryptedSecret[] = [];

  encryptedSecrets.forEach((encSecret) => {
    const [secretKey, secretValue, secretComment] = getDecryptedValues(
      [
        {
          ciphertext: encSecret.secretKeyCiphertext,
          iv: encSecret.secretKeyIV,
          tag: encSecret.secretKeyTag
        },
        {
          ciphertext: encSecret.secretValueCiphertext,
          iv: encSecret.secretValueIV,
          tag: encSecret.secretValueTag
        },
        {
          ciphertext: encSecret.secretCommentCiphertext || "",
          iv: encSecret.secretCommentIV || "",
          tag: encSecret.secretCommentTag || ""
        }
      ],
      key
    );

    const decryptedSecret: DecryptedSecret = {
      decrypted: {
        secretKey,
        secretValue,
        secretComment,
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
  latestKey: TLatestKey
) => {
  const key = crypto.encryption().asymmetric().decrypt({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey
  });

  const decryptedSecrets: DecryptedSecretVersions[] = [];

  encryptedSecretVersions.forEach((encSecret) => {
    const [secretKey, secretValue, secretComment] = getDecryptedValues(
      [
        {
          ciphertext: encSecret.secretKeyCiphertext,
          iv: encSecret.secretKeyIV,
          tag: encSecret.secretKeyTag
        },
        {
          ciphertext: encSecret.secretValueCiphertext,
          iv: encSecret.secretValueIV,
          tag: encSecret.secretValueTag
        },
        {
          ciphertext: encSecret.secretCommentCiphertext || "",
          iv: encSecret.secretCommentIV || "",
          tag: encSecret.secretCommentTag || ""
        }
      ],
      key
    );

    const decryptedSecret: DecryptedSecretVersions = {
      decrypted: {
        secretKey,
        secretValue,
        secretComment,
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
  latestKey: TLatestKey
) => {
  const key = crypto.encryption().asymmetric().decrypt({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey
  });

  const decryptedSecrets: DecryptedSecretApprovals[] = [];

  encryptedSecretApprovals.forEach((encApproval) => {
    const [secretKey, secretValue, secretComment] = getDecryptedValues(
      [
        {
          ciphertext: encApproval.secretKeyCiphertext,
          iv: encApproval.secretKeyIV,
          tag: encApproval.secretKeyTag
        },
        {
          ciphertext: encApproval.secretValueCiphertext,
          iv: encApproval.secretValueIV,
          tag: encApproval.secretValueTag
        },
        {
          ciphertext: encApproval.secretCommentCiphertext || "",
          iv: encApproval.secretCommentIV || "",
          tag: encApproval.secretCommentTag || ""
        }
      ],
      key
    );

    const decryptedSecret: DecryptedSecretApprovals = {
      decrypted: {
        secretKey,
        secretValue,
        secretComment,
        id: encApproval.id
      },
      original: encApproval
    };

    decryptedSecrets.push(DecryptedSecretApprovalsSchema.parse(decryptedSecret));
  });

  return decryptedSecrets;
};

export const decryptIntegrationAuths = (
  encryptedIntegrationAuths: TIntegrationAuths[],
  privateKey: string,
  latestKey: TLatestKey
) => {
  const key = crypto.encryption().asymmetric().decrypt({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey
  });

  const decryptedIntegrationAuths: DecryptedIntegrationAuths[] = [];

  encryptedIntegrationAuths.forEach((encAuth) => {
    const [access, accessId, refresh] = getDecryptedValues(
      [
        {
          ciphertext: encAuth.accessCiphertext || "",
          iv: encAuth.accessIV || "",
          tag: encAuth.accessTag || ""
        },
        {
          ciphertext: encAuth.accessIdCiphertext || "",
          iv: encAuth.accessIdIV || "",
          tag: encAuth.accessIdTag || ""
        },
        {
          ciphertext: encAuth.refreshCiphertext || "",
          iv: encAuth.refreshIV || "",
          tag: encAuth.refreshTag || ""
        }
      ],
      key
    );

    decryptedIntegrationAuths.push({
      decrypted: {
        id: encAuth.id,
        access,
        accessId,
        refresh
      },
      original: encAuth
    });
  });

  return decryptedIntegrationAuths;
};
