import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

export const notifyUnhandledHostCommandError = (error: unknown, title: string) => {
  if (!axios.isAxiosError(error)) return;

  const serverResponse = error.response?.data as TApiErrors | undefined;
  if (serverResponse?.error !== ApiErrorTypes.BadRequestError) return;

  const text = typeof serverResponse.message === "string" ? serverResponse.message : "Try again.";
  createNotification({ title, text, type: "error" });
};
