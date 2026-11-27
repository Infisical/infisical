/* eslint-disable max-classes-per-file */

// `pendingStatus` omits the retry note, so the failure recorded once retries run out doesn't promise another.
export class AcmPendingError extends Error {
  readonly pendingStatus: string;

  constructor(pendingStatus: string) {
    super(`${pendingStatus}; will retry`);
    this.name = "AcmPendingError";
    this.pendingStatus = pendingStatus;
  }
}

export class AcmTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcmTerminalError";
  }
}
