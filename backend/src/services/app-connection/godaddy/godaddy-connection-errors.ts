import { AxiosError } from "axios";

type TGoDaddyErrorResponse = {
  code?: string;
  message?: string;
  fields?: { path?: string; message?: string; code?: string }[];
};

export const extractGoDaddyErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as TGoDaddyErrorResponse | undefined;
    const fieldError = data?.fields?.[0];
    if (fieldError?.message) {
      return fieldError.path ? `${fieldError.message} (${fieldError.path})` : fieldError.message;
    }
    if (data?.message) {
      return data.code ? `${data.message} (${data.code})` : data.message;
    }
    return error.message || "Unknown error";
  }
  return (error as Error).message || "Unknown error";
};
