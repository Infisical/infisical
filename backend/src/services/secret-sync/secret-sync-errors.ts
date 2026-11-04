export class SecretSyncError extends Error {
  name: string;

  error?: unknown;

  secretKey?: string;

  shouldRetry?: boolean;

  // Set only where Infisical rejects the sync's own configuration before or without calling the destination,
  // so the failure says nothing about the destination's health. Never set it on an error built from a
  // destination's response, 4xx included.
  isConfigError: boolean;

  constructor({
    name,
    error,
    secretKey,
    message,
    shouldRetry = true,
    isConfigError = false
  }: {
    name?: string;
    error?: unknown;
    secretKey?: string;
    shouldRetry?: boolean;
    message?: string;
    isConfigError?: boolean;
  } = {}) {
    super(message);
    this.name = name || "SecretSyncError";
    this.error = error;
    this.secretKey = secretKey;
    this.shouldRetry = shouldRetry;
    this.isConfigError = isConfigError;
  }
}

// Many destinations wrap whatever they catch in a new SecretSyncError, so a config error raised inside their try
// block arrives one level down.
export const isSecretSyncConfigError = (err: unknown) =>
  err instanceof SecretSyncError &&
  (err.isConfigError || (err.error instanceof SecretSyncError && err.error.isConfigError));
