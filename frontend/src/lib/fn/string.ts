import { ReservedFolders } from "@app/hooks/api/secretFolders/types";

export const formatReservedPaths = (secretPath: string) => {
  const i = secretPath.indexOf(ReservedFolders.SecretReplication);
  if (i !== -1) {
    return `${secretPath.slice(0, i)} - (replication)`;
  }
  return secretPath;
};

export const camelCaseToSpaces = (input: string) => {
  return input.replace(/([a-z])([A-Z])/g, "$1 $2");
};
