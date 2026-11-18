// A plain Error so callers decrypting stored data still answer 500. A route decrypting caller input (CMEK) maps it
// to a 400.
export class KmsCiphertextUndecryptableError extends Error {
  constructor(cause: unknown) {
    super("No version of the KMS key could decrypt the ciphertext", { cause });
    this.name = "KmsCiphertextUndecryptableError";
  }
}
