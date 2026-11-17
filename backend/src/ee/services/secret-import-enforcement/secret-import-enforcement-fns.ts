import { crypto } from "@app/lib/crypto/cryptography";

// Same precedence as the replication job (`$getReplicatedSecretsV2` in secret-replication-service.ts): the
// source's own secrets first, then its imports from last to first. The copy a conversion writes has to equal
// the one the job would write, or the job's next run would report the difference as a change.
export const mergeReplicatedSecrets = <TLocal extends { key: string }, TImported extends { key: string }>(
  localSecrets: TLocal[],
  importedSecrets: { secrets: TImported[] }[]
): (TLocal | TImported)[] => {
  const seen = new Set<string>(localSecrets.map(({ key }) => key));
  const secrets: (TLocal | TImported)[] = [...localSecrets];

  for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
    importedSecrets[i].secrets.forEach((secret) => {
      if (seen.has(secret.key)) return;
      seen.add(secret.key);
      secrets.push(secret);
    });
  }
  return secrets;
};

// Identifies what a copy holds without decrypting it. The values are copied ciphertext, so a change to any
// source secret changes the fingerprint.
export const fingerprintReplicatedSecrets = (
  secrets: {
    key: string;
    encryptedValue?: Buffer | null;
    encryptedComment?: Buffer | null;
    skipMultilineEncoding?: boolean | null;
    rawSecretMetadata?: { key: string; value?: string | null; encryptedValue?: Buffer | null }[] | null;
  }[]
) => {
  const entries = secrets
    .map((secret) =>
      JSON.stringify([
        secret.key,
        secret.encryptedValue?.toString("base64") ?? null,
        secret.encryptedComment?.toString("base64") ?? null,
        Boolean(secret.skipMultilineEncoding),
        (secret.rawSecretMetadata ?? []).map((meta) => [
          meta.key,
          meta.value ?? null,
          meta.encryptedValue?.toString("base64") ?? null
        ])
      ])
    )
    .sort();
  return crypto.nativeCrypto.createHash("sha256").update(entries.join("\n")).digest("hex");
};
