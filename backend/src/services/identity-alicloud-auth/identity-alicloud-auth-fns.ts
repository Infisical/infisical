import { AxiosError } from "axios";
import RE2 from "re2";

const LOGGABLE_IDENTIFIER_REGEX = new RE2("^[A-Za-z0-9._:/-]{1,128}$");

const toLoggableIdentifier = (value: unknown) =>
  typeof value === "string" && LOGGABLE_IDENTIFIER_REGEX.test(value) ? value : undefined;

export const getAliCloudErrorForLog = (err: AxiosError) => {
  const data = err.response?.data as { Code?: unknown; RequestId?: unknown } | undefined;
  return {
    status: err.response?.status,
    code: err.code,
    aliCloudErrorCode: toLoggableIdentifier(data?.Code),
    aliCloudRequestId: toLoggableIdentifier(data?.RequestId)
  };
};
