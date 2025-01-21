export class SecretSyncError extends Error {
  name: string;

  error: unknown;

  secretKey?: string;

  constructor({ name, error, secretKey }: { name?: string; error?: unknown; secretKey?: string } = {}) {
    super();
    this.name = name || "SecretSyncError";
    this.error = error;
    this.secretKey = secretKey;
  }
}
