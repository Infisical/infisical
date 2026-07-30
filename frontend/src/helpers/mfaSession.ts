import axios from "axios";

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

export const isMfaLockoutError = (
  error: any
): error is { response: { data: { message: string } } } =>
  axios.isAxiosError(error) &&
  error.response?.status === 403 &&
  error.response?.data?.error === "UserLocked";

const mfaLockoutStorageKey = (mfaSessionId: string) => `mfa-session-lockout:${mfaSessionId}`;

export const stashMfaLockoutError = (mfaSessionId: string, message: string) => {
  localStorage.setItem(mfaLockoutStorageKey(mfaSessionId), message);
};

export const consumeMfaLockoutError = (mfaSessionId: string): string | null => {
  const key = mfaLockoutStorageKey(mfaSessionId);
  const message = localStorage.getItem(key);
  if (message) localStorage.removeItem(key);
  return message;
};
