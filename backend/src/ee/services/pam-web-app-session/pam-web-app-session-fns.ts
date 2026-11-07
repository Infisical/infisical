import { createHash } from "node:crypto";

import { ConflictError } from "@app/lib/errors";

import { canonicalizeRecording } from "../pam-session-recording/pam-web-recording-fns";
import { TWebWorkerState } from "./pam-web-app-session-types";

const transitions: Record<TWebWorkerState, TWebWorkerState[]> = {
  allocating: ["provisioning", "ending", "failed"],
  provisioning: ["provisioned", "ending", "failed"],
  provisioned: ["recording-ready", "ending", "failed"],
  "recording-ready": ["active", "ending", "failed"],
  active: ["detached", "ending", "failed"],
  detached: ["active", "ending", "failed"],
  ending: ["stopped", "stop-unconfirmed", "failed"],
  "stop-unconfirmed": ["stopped", "failed"],
  failed: ["stopped"],
  stopped: []
};
export const assertWebWorkerTransition = (from: TWebWorkerState, to: TWebWorkerState) => {
  if (from !== to && !transitions[from].includes(to))
    throw new ConflictError({
      message: `The browser cannot move from '${from}' to '${to}'. Refresh the session state.`
    });
};
export const webStopConfirmation = (
  stopConfirmedAt: Date | null,
  lastWorkerContactAt: Date | null,
  now = Date.now()
) => {
  if (stopConfirmedAt) return "confirmed" as const;
  if (lastWorkerContactAt && now - lastWorkerContactAt.getTime() <= 30_000) return "pending" as const;
  return "not-confirmed" as const;
};
export const webLaunchPayloadHash = (accountId: string, reason?: string) =>
  createHash("sha256")
    .update(canonicalizeRecording({ accountId, reason: reason?.trim() || null }))
    .digest();
export const webLeaseUntil = (expiresAt: Date, remainingAccessMs: number | null, now = Date.now()) =>
  new Date(
    Math.min(
      now + 45_000,
      expiresAt.getTime(),
      remainingAccessMs === null ? Infinity : now + Math.max(0, remainingAccessMs)
    )
  );
export const webLeaseSeconds = (leaseUntil: Date, expiresAt: Date, now = Date.now()) =>
  Math.max(0, Math.floor((Math.min(leaseUntil.getTime(), expiresAt.getTime()) - now) / 1000));
export const isWebWorkerTerminal = (state: TWebWorkerState) => state === "failed" || state === "stopped";
