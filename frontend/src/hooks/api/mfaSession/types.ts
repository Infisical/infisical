import { MfaMethod } from "../auth/types";

export enum MfaSessionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE"
}

export type TMfaSessionStatusResponse = {
  status: MfaSessionStatus;
  mfaMethod: MfaMethod;
};

export type TVerifyMfaSessionRequest = {
  mfaSessionId: string;
  mfaToken: string;
  mfaMethod: MfaMethod;
};

export type TVerifyMfaSessionResponse = {
  success: boolean;
  message: string;
};
