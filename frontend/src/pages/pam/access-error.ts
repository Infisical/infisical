import axios from "axios";

export const getAccessErrorMessage = (error: unknown, fallback: string): string => {
  if (!axios.isAxiosError(error)) return fallback;
  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  if (typeof message === "string") return message || fallback;
  if (Array.isArray(message)) {
    return (
      message
        .map((issue: { message?: unknown }) => issue?.message)
        .filter((text): text is string => typeof text === "string")
        .join(". ") || fallback
    );
  }
  return fallback;
};
