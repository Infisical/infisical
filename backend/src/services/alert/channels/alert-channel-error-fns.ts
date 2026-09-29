import { isAxiosError } from "axios";
import RE2 from "re2";

const MAX_PROVIDER_REASON_LENGTH = 200;
const WHITESPACE_RUN_REGEX = new RE2("\\s+", "g");

const extractProviderReason = (data: unknown): string | undefined => {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return undefined;

  const body = data as { errors?: unknown; message?: unknown; error?: unknown };
  if (Array.isArray(body.errors) && body.errors.length) return body.errors.map(String).join(", ");
  if (typeof body.message === "string") return body.message;
  if (typeof body.error === "string") return body.error;
  return undefined;
};

export const describeDeliveryError = (err: unknown): string => {
  if (!(err instanceof Error)) return "Unknown error";
  if (!isAxiosError(err) || !err.response) return err.message;

  const reason = extractProviderReason(err.response.data)?.replace(WHITESPACE_RUN_REGEX, " ").trim();
  return reason ? `${err.message}: ${reason.slice(0, MAX_PROVIDER_REASON_LENGTH)}` : err.message;
};
