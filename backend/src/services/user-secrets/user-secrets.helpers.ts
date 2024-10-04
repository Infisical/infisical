import { decryptSymmetric, encryptSymmetric } from "@app/lib/crypto";

const KEY = "gazkgS0QKEzHdTprx6EIGZxIvwYTtx6SxYQBJzOzquk=";

export const encryptFields = (fields: Record<string, string>) => {
  const stringifiedFields = JSON.stringify(fields);
  const encryptedFields = encryptSymmetric(stringifiedFields, KEY);
  console.log({ KEY });
  return encryptedFields;
};

export const decryptFields = (encryptedFields: string, iv: string, tag: string): Record<string, string> => {
  const decryptedFields = decryptSymmetric({
    ciphertext: encryptedFields,
    iv,
    tag,
    key: KEY
  });
  return JSON.parse(decryptedFields) as Record<string, string>;
};
