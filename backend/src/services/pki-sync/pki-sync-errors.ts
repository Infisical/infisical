export class PkiSyncError extends Error {
  public context?: Record<string, unknown>;

  public cause?: Error;

  public shouldRetry: boolean;

  constructor({
    message,
    cause,
    context,
    shouldRetry = true
  }: {
    message: string;
    cause?: Error;
    context?: Record<string, unknown>;
    shouldRetry?: boolean;
  }) {
    super(message);
    this.name = "PkiSyncError";
    this.cause = cause;
    this.context = context;
    this.shouldRetry = shouldRetry;
  }
}
