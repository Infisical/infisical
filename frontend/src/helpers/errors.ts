import axios from "axios";

export const getApiErrorMessage = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const message: unknown = error.response?.data?.message;
  return typeof message === "string" && message ? message : undefined;
};

export const getErrorMessage = (error: unknown): string | undefined =>
  getApiErrorMessage(error) || (error instanceof Error && error.message ? error.message : undefined);

export const hasErrorName = (error: unknown, name: string) =>
  error instanceof Error && error.name === name;
