import { MfaMethod } from "@app/services/auth/auth-type";

export enum MfaSessionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE"
}

export const MfaStepUpResource = {
  MfaManagement: "mfa-management",
  MfaActivation: "mfa-activation"
} as const;

export type TMfaStepUpResource = (typeof MfaStepUpResource)[keyof typeof MfaStepUpResource];

export type TMfaSession = {
  sessionId: string;
  userId: string;
  resourceId: string; // Generic - can be accountId, documentId, etc.
  status: MfaSessionStatus;
  mfaMethod: MfaMethod;
  // The login session (tokenVersionId) that INITIATED this step-up. Only set for
  // MFA-management step-ups; it binds verification, status polling, and consumption
  // to the initiating session so a challenge initiated by one session cannot be
  // completed by another (e.g. tricking a victim into finishing a stolen session's
  // challenge). Undefined for PAM sessions, which are account-scoped and unaffected.
  initiatingTokenVersionId?: string;
};

export type TCreateMfaSessionDTO = {
  userId: string;
  resourceId: string;
  mfaMethod: MfaMethod;
};

export type TVerifyMfaSessionDTO = {
  mfaSessionId: string;
  userId: string;
  tokenVersionId: string;
  mfaToken: string;
  mfaMethod: MfaMethod;
};

export type TGetMfaSessionStatusDTO = {
  mfaSessionId: string;
  userId: string;
  tokenVersionId: string;
};

export type TIsMfaSessionActiveDTO = {
  mfaSessionId: string;
  userId: string;
  resourceId: string;
  tokenVersionId: string;
};
