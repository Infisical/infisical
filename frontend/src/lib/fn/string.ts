import { ReservedFolders } from "@app/hooks/api/secretFolders/types";

export const formatReservedPaths = (paths: string | string[]) => {
  const secretPaths = Array.isArray(paths) ? paths : [paths];

  const formattedSecretPaths = secretPaths.map((secretPath) => {
    const i = secretPath.indexOf(ReservedFolders.SecretReplication);
    if (i !== -1) {
      return `${secretPath.slice(0, i)} - (replication)`;
    }
    return secretPath;
  });

  return formattedSecretPaths.join(", ");
};
