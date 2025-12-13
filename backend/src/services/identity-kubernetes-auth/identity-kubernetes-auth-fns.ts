import { UnauthorizedError } from "@app/lib/errors";

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
  throw new UnauthorizedError({
    name: "KubernetesUsernameParseError",
    message: `Invalid Kubernetes service account username format: "${username}". Expected format: system:serviceaccount:<namespace>:<name>`
  });
};
