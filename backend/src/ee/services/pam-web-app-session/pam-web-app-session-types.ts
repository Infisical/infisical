import { TPamSessions } from "@app/db/schemas";

import { TWebRecordingChunk, TWebRecordingFinal } from "../pam-session-recording/pam-web-recording-fns";
import { TWebAppPolicySnapshot } from "./pam-web-app-config";

export const PAM_WEB_APP_SESSION_TABLE = "pam_web_app_sessions";
export const PAM_WEB_APP_TICKET_TABLE = "pam_web_app_attach_tickets";
export const PAM_RECORDING_STORAGE_TABLE = "pam_session_recording_storage";
export const PAM_RECORDING_MANIFEST_TABLE = "pam_session_recording_manifests";
export const WEB_WORKER_STATES = [
  "allocating",
  "provisioning",
  "provisioned",
  "recording-ready",
  "active",
  "detached",
  "ending",
  "stop-unconfirmed",
  "stopped",
  "failed"
] as const;
export type TWebWorkerState = (typeof WEB_WORKER_STATES)[number];
export type TWebAppSession = {
  sessionId: string;
  createdByUserId: string | null;
  accountId: string | null;
  idempotencyKey: string | null;
  idempotencyPayloadHash: Buffer | null;
  allocationGen: number;
  controllerGen: number;
  gatewayId: string | null;
  workerState: TWebWorkerState;
  workerStateReason: string | null;
  workerReportSeq: number;
  lastWorkerContactAt: Date | null;
  leaseUntil: Date | null;
  reconnectDeadlineAt: Date | null;
  stopConfirmedAt: Date | null;
  policySnapshot: TWebAppPolicySnapshot;
  chunksEmitted: number;
  recordingFinalReport: TWebRecordingFinal | null;
  createdAt: Date;
  updatedAt: Date;
};
export type TWebAppTicket = {
  id: string;
  sessionId: string;
  userId: string;
  tokenHash: Buffer;
  controllerGen: number;
  takeControl: boolean;
  tokenVersionId: string | null;
  accessVersion: number | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};
export type TWebAppRecord = {
  session: TPamSessions & { orgId: string; gatewayName: string | null };
  web: TWebAppSession;
};
export type TWebRecordingChunkMetadata = TWebRecordingChunk & {
  id: string;
  sessionId: string;
  hasCiphertext: boolean;
};
export type TRecordingStorageSnapshot = {
  sessionId: string;
  backend: string;
  connectionId: string | null;
  connectionName: string | null;
  bucket: string | null;
  region: string | null;
  keyPrefix: string | null;
  snapshotAt: Date;
};
