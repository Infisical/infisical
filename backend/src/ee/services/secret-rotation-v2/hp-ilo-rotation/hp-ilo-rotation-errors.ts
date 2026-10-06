/* eslint-disable max-classes-per-file */

// Signals that an operation failed without modifying the iLO account, which is what makes it safe for the fallback
// client to retry it; any other error may hide a password change that was applied
export class HpIloAccountUnchangedError extends Error {}

// Signals that a client is unavailable and the user's configuration rules out falling back to the next client
export class HpIloFallbackNotAllowedError extends Error {}
