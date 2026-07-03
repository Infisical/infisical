import { AxiosError } from "axios";

type TDigiCertErrorResponse = { errors?: { code?: string; message?: string }[] };

export const extractDigiCertErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as TDigiCertErrorResponse | undefined;
    // Include every error code, not just the first, so callers can match a code in any position.
    const errors = (data?.errors ?? []).filter((e) => e?.message || e?.code);
    if (errors.length) {
      return errors.map((e) => (e.code ? `${e.message ?? ""} (${e.code})` : e.message)).join("; ");
    }
    return error.message || "Unknown error";
  }
  return (error as Error).message || "Unknown error";
};
