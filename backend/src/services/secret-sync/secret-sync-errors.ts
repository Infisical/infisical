export class SecretSyncError extends Error {
  name: string;

  error?: unknown;

  secretKey?: string;

  shouldRetry?: boolean;

  constructor({
    name,
    error,
    secretKey,
    message,
    shouldRetry = true
  }: { name?: string; error?: unknown; secretKey?: string; shouldRetry?: boolean; message?: string } = {}) {
    super(message);
    this.name = name || "SecretSyncError";
    this.error = error;
    this.secretKey = secretKey;
    this.shouldRetry = shouldRetry;
  }
}
