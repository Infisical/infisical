import { AxiosError } from "axios";

type TDigiCertErrorResponse = { errors?: { code?: string; message?: string }[] };

export const extractDigiCertErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as TDigiCertErrorResponse | undefined;
    const firstError = data?.errors?.[0];
    if (firstError?.message) {
      return firstError.code ? `${firstError.message} (${firstError.code})` : firstError.message;
    }
    return error.message || "Unknown error";
  }
  return (error as Error).message || "Unknown error";
};
