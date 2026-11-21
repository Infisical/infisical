import {
  certKeyAlgorithms,
  certKeyAlgorithmToNameMap,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";

import { orgHref } from "../../links";

export const keyAlgorithmOptions = certKeyAlgorithms
  .filter(({ value }) => !isPqcAlgorithm(value))
  .map(({ value }) => ({ value, label: certKeyAlgorithmToNameMap[value] }));

export const keyAlgorithmName = (value: string | null) =>
  certKeyAlgorithmToNameMap[(value as CertKeyAlgorithm) || CertKeyAlgorithm.RSA_2048] ?? value;

export const kmipLinks = {
  servers: (orgId: string) => orgHref(orgId, "/projects/kms/kmip-servers"),
  server: (orgId: string, kmipServerId: string) =>
    orgHref(orgId, `/projects/kms/kmip-servers/${kmipServerId}`)
};

export const KMIP_SERVER_DOCS = "https://infisical.com/docs/documentation/platform/kms/kmip-server";
export const KMIP_CLIENT_DOCS =
  "https://infisical.com/docs/documentation/platform/kms/kmip-clients";

export const HOSTNAMES_HINT =
  "Comma-separated hostnames or IPs that KMIP clients use to reach this server. They become the server certificate's subject alternative names.";

export const hostnamesError = (value: string) => {
  if (!value.trim()) return "At least one hostname or IP is required";
  if (value.trim().length > 4096) return "Hostnames or IPs must be at most 4096 characters";
  return undefined;
};

export const errorStatus = (error: unknown) =>
  (error as { status?: number; response?: { status?: number } } | null)?.response?.status ??
  (error as { status?: number } | null)?.status;
