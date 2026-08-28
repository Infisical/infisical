import { isIP } from "node:net";

import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

const SCHEME_PREFIX = "^https?://";

// The stored host may omit a scheme. URL parsing, SSRF validation and Axios all need one.
export const withKubernetesHostScheme = (kubernetesHost: string) =>
  new RE2(SCHEME_PREFIX).test(kubernetesHost) ? kubernetesHost : `https://${kubernetesHost}`;

// Undefined for a bare IP: SNI carries host names only, so an IP host is matched on IP SANs.
// Passing the IP as SNI makes verification fail outright.
export const getKubernetesServerName = (kubernetesHost: string) => {
  let servername = new RE2(SCHEME_PREFIX).replace(kubernetesHost, "");
  const lastColonIndex = servername.lastIndexOf(":");
  if (lastColonIndex !== -1) {
    servername = servername.substring(0, lastColonIndex);
  }
  return isIP(servername) ? undefined : servername;
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
