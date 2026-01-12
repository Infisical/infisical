import { MfaMethod } from "@app/hooks/api/auth/types";

export type TMfaSessionError = {
  name: "SESSION_MFA_REQUIRED";
  message: string;
  error: {
    mfaSessionId: string;
    mfaMethod: MfaMethod;
  };
};

export const isMfaSessionError = (
  error: any
): error is { response: { data: TMfaSessionError } } => {
  return error?.response?.data?.name === "SESSION_MFA_REQUIRED";
};
