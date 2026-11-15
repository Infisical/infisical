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

export type TMfaStepUpChallenge = { mfaSessionId: string; mfaMethod: MfaMethod };

export const getMfaStepUpChallenge = (error: unknown): TMfaStepUpChallenge | null => {
  if (!axios.isAxiosError(error) || error.response?.data?.error !== "SESSION_MFA_REQUIRED") {
    return null;
  }
  const details = error.response.data.details as Partial<TMfaStepUpChallenge> | undefined;
  if (!details?.mfaSessionId || !details.mfaMethod) return null;
  return { mfaSessionId: details.mfaSessionId, mfaMethod: details.mfaMethod };
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
