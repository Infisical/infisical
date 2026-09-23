import { isIP } from "node:net";

import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

const SCHEME_PREFIX = "^https?://";

// The stored host may omit a scheme. URL parsing, SSRF validation and Axios all need one.
export const withKubernetesHostScheme = (kubernetesHost: string) =>
  new RE2(SCHEME_PREFIX).test(kubernetesHost) ? kubernetesHost : `https://${kubernetesHost}`;

// The host as a bare name or address: scheme, port and IPv6 brackets removed. Parsing rather
// than splitting on the last colon is what makes IPv6 come out right; the split truncates
// "[::1]:6443" to "[::1]" and a bare "::1" to ":".
export const getKubernetesHostname = (kubernetesHost: string): string | undefined => {
  let hostname: string;
  try {
    ({ hostname } = new URL(withKubernetesHostScheme(kubernetesHost)));
  } catch {
    return undefined;
  }

  // `new URL` keeps IPv6 literals bracketed, which isIP does not recognize.
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  return hostname || undefined;
};

// Undefined for a bare IP: SNI carries host names only, so an IP host is matched on IP SANs.
// Passing the IP as SNI makes verification fail outright.
//
// Only correct when the request is addressed to the Kubernetes host itself, so that Node can
// fall back to the URL host for the certificate identity check. A request tunnelled through a
// gateway is addressed to localhost and needs getKubernetesHostname instead.
export const getKubernetesServerName = (kubernetesHost: string): string | undefined => {
  const hostname = getKubernetesHostname(kubernetesHost);
  return !hostname || isIP(hostname) ? undefined : hostname;
};

/**
 * Extracts the K8s service account name and namespace
 * from the username in this format: system:serviceaccount:default:infisical-auth
 */
export const extractK8sUsername = (username: string) => {
  const parts = username.split(":");
  // Ensure that the username format is correct
  if (parts.length === 4 && parts[0] === "system" && parts[1] === "serviceaccount") {
    return {
      namespace: parts[2],
      name: parts[3]
    };
  }
  throw new BadRequestError({
    name: "KubernetesUsernameParseError",
    message: `Invalid Kubernetes service account username format: "${username}". Expected format: system:serviceaccount:<namespace>:<name>`
  });
};
