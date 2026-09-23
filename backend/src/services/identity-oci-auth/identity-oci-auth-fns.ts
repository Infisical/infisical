import { AxiosError } from "axios";
import RE2 from "re2";

const SIGNATURE_SCHEME = "signature ";
const SIGNATURE_PARAM_REGEX = new RE2('^([A-Za-z]+)\\s*=\\s*"([^"]*)"$');
const LOGGABLE_IDENTIFIER_REGEX = new RE2("^[A-Za-z0-9._:/-]{1,128}$");

const toLoggableIdentifier = (value: unknown) =>
  typeof value === "string" && LOGGABLE_IDENTIFIER_REGEX.test(value) ? value : undefined;

export const getOciErrorForLog = (err: AxiosError) => {
  const data = err.response?.data as { code?: unknown } | undefined;
  return {
    status: err.response?.status,
    code: err.code,
    ociErrorCode: toLoggableIdentifier(data?.code),
    ociRequestId: toLoggableIdentifier(err.response?.headers?.["opc-request-id"])
  };
};

const parseOciSignatureParams = (authorizationHeader: string): Map<string, string> | null => {
  const header = authorizationHeader.trim();
  if (!header.slice(0, SIGNATURE_SCHEME.length).toLowerCase().startsWith(SIGNATURE_SCHEME)) return null;

  const params = new Map<string, string>();
  for (const rawParam of header.slice(SIGNATURE_SCHEME.length).split(",")) {
    const match = SIGNATURE_PARAM_REGEX.exec(rawParam.trim());
    if (!match) return null;

    const name = match[1].toLowerCase();
    if (params.has(name)) return null;
    params.set(name, match[2]);
  }

  return params;
};

export const getOciSignerUserOcid = (authorizationHeader: string): string | null => {
  const keyId = parseOciSignatureParams(authorizationHeader)?.get("keyid");
  if (!keyId) return null;

  const segments = keyId.split("/");
  if (segments.length !== 3) return null;

  const [tenancyOcid, userOcid, fingerprint] = segments;
  if (!tenancyOcid || !userOcid || !fingerprint) return null;

  return userOcid;
};
