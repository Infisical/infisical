import { MfaMethod } from "@app/services/auth/auth-type";

export enum MfaSessionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE"
}

export type TMfaSession = {
  sessionId: string;
  userId: string;
  resourceId: string; // Generic - can be accountId, documentId, etc.
  status: MfaSessionStatus;
  mfaMethod: MfaMethod;
};

export type TCreateMfaSessionDTO = {
  userId: string;
  resourceId: string;
  mfaMethod: MfaMethod;
};

export type TVerifyMfaSessionDTO = {
  mfaSessionId: string;
  userId: string;
  mfaToken: string;
  mfaMethod: MfaMethod;
};

export type TGetMfaSessionStatusDTO = {
  mfaSessionId: string;
  userId: string;
};
