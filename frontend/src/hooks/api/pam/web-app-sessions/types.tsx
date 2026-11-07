export type TWebAppSession = {
  id: string;
  accountId: string | null;
  accountName: string;
  accountType: "web-app";
  folderName: string | null;
  status: string;
  startedAt: string | null;
  expiresAt: string;
  endedAt: string | null;
  reason: string | null;
  webApp: {
    allocationGen: number;
    controllerGen: number;
    workerState:
      | "allocating"
      | "provisioning"
      | "provisioned"
      | "recording-ready"
      | "active"
      | "detached"
      | "ending"
      | "stop-unconfirmed"
      | "stopped"
      | "failed";
    workerStateReason: string | null;
    lastWorkerContactAt: string | null;
    leaseUntil: string | null;
    reconnectDeadlineAt: string | null;
    stopConfirmedAt: string | null;
    stopConfirmation: "confirmed" | "pending" | "not-confirmed";
    startOrigin: string;
    allowTypedNavigation: boolean;
    reconnectGraceSeconds: number;
    gatewayName: string | null;
  };
  recording: {
    state:
      | "initializing"
      | "recording"
      | "finalizing"
      | "complete"
      | "incomplete"
      | "mismatch"
      | "failed"
      | "unavailable";
    protection: "participant-level";
    chunksEmitted: number;
    chunksVerified: number;
  };
};
export type TCreateWebAppSession = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
  idempotencyKey: string;
};
