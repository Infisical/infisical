/* eslint-disable max-classes-per-file */

export class AcmPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcmPendingError";
  }
}

export class AcmTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcmTerminalError";
  }
}
