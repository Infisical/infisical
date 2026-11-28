import axios from "axios";

import { SessionStorageKeys } from "@app/const";
import { ApiErrorTypes } from "@app/hooks/api/types";

const blockedErrorCode = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 403
    ? (error.response.data as { error?: unknown } | undefined)?.error
    : undefined;

export const isAccountBlockedError = (error: unknown) =>
  blockedErrorCode(error) === ApiErrorTypes.AccountBlocked;

export const isOrganizationBlockedError = (error: unknown) =>
  blockedErrorCode(error) === ApiErrorTypes.OrganizationBlocked;

export const getBlockedMessage = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : undefined;
};

// The account blocked page renders after the session is gone, so it can't ask the API for the reason.
export const saveAccountBlockedMessage = (message: string | undefined) => {
  try {
    if (message) sessionStorage.setItem(SessionStorageKeys.ACCOUNT_BLOCKED_MESSAGE, message);
  } catch (err) {
    console.warn("Could not save the account blocked message:", err);
  }
};

export const readAccountBlockedMessage = (): string | undefined => {
  try {
    return sessionStorage.getItem(SessionStorageKeys.ACCOUNT_BLOCKED_MESSAGE) ?? undefined;
  } catch {
    return undefined;
  }
};
