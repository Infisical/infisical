import axios from "axios";

import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

export const getAccessErrorMessage = (error: unknown, fallback: string): string => {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as TApiErrors | undefined;
  if (!data?.message) return fallback;
  if (data.error === ApiErrorTypes.ValidationError) {
    return data.message.map((issue) => issue.message).join(". ") || fallback;
  }
  return typeof data.message === "string" ? data.message : fallback;
};
