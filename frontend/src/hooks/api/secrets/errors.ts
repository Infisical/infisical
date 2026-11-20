import axios from "axios";

import { createNotification } from "@app/components/notifications";

import { onRequestError, wasErrorReported } from "../reactQuery";

export type TSecretWriteFailure<TField extends string = string> = {
  error: unknown;
  // The form field the failed request was sent from. Without it the failure is toasted.
  field?: TField;
  // Set when one submit wrote to several environments, so each field message names its environment.
  environmentName?: string;
};

// Secret create, update and rename requests name one key in one environment, so a 400 from one of
// them belongs to the field the caller sent it from.
const getFieldMessage = (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return undefined;
  const message = (error.response.data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : undefined;
};

const getToastKey = (error: unknown) => {
  if (axios.isAxiosError(error))
    return `${error.response?.status}:${JSON.stringify(error.response?.data?.message ?? error.message)}`;
  return error instanceof Error ? error.message : String(error);
};

// Shows each failure once: on its field when the server rejected the request itself, otherwise in
// one toast per distinct error. Failures the global mutation handler already toasted are skipped, so
// this is safe after mutations with or without `meta.skipErrorToast`.
export const showSecretWriteErrors = <TField extends string>(
  failures: TSecretWriteFailure<TField>[],
  setFieldError?: (field: TField, message: string) => void
) => {
  const fieldMessages = new Map<TField, Set<string>>();
  const toastKeys = new Set<string>();
  failures.forEach(({ error, field, environmentName }) => {
    if (wasErrorReported(error)) return;
    const message = setFieldError && field !== undefined ? getFieldMessage(error) : undefined;
    if (field !== undefined && message) {
      const messages = fieldMessages.get(field) ?? new Set<string>();
      messages.add(environmentName ? `${environmentName}: ${message}` : message);
      fieldMessages.set(field, messages);
      return;
    }
    const toastKey = getToastKey(error);
    if (toastKeys.has(toastKey)) return;
    toastKeys.add(toastKey);
    if (axios.isAxiosError(error)) {
      onRequestError(error);
      return;
    }
    createNotification({
      type: "error",
      text: error instanceof Error ? error.message : "The change could not be saved. Try again."
    });
  });
  fieldMessages.forEach((messages, field) => setFieldError?.(field, [...messages].join("\n")));
};
