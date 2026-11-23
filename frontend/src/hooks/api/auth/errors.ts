import axios from "axios";

export const BREACHED_PASSWORD_ERROR = "BREACHED_PASSWORD";

export const getBreachedPasswordMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ error?: string; message?: string }>(error)) return undefined;
  const data = error.response?.data;
  return data?.error === BREACHED_PASSWORD_ERROR ? data.message : undefined;
};
