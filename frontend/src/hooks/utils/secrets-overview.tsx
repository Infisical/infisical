import { useCallback, useMemo } from "react";

import { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";

type FolderNameAndDescription = {
  name: string;
  description?: string;
};

export const useFolderOverview = (folders: DashboardProjectSecretsOverview["folders"]) => {
  const folderNamesAndDescriptions = useMemo(() => {
    const namesAndDescriptions = new Map<string, FolderNameAndDescription>();

    folders?.forEach((folder) => {
      if (!namesAndDescriptions.has(folder.name)) {
        namesAndDescriptions.set(folder.name, {
          name: folder.name,
          description: folder.description
        });
      }
    });

    return Array.from(namesAndDescriptions.values());
  }, [folders]);

  const isFolderPresentInEnv = useCallback(
    (name: string, env: string) => {
      return Boolean(
        folders?.find(
          ({ name: folderName, environment }) => folderName === name && environment === env
        )
      );
    },
    [folders]
  );

  const getFolderByNameAndEnv = useCallback(
    (name: string, env: string) => {
      return folders?.find(
        ({ name: folderName, environment }) => folderName === name && environment === env
      );
    },
    [folders]
  );

  return { folderNamesAndDescriptions, isFolderPresentInEnv, getFolderByNameAndEnv };
};

export const useDynamicSecretOverview = (
  dynamicSecrets: DashboardProjectSecretsOverview["dynamicSecrets"]
) => {
  const dynamicSecretNames = useMemo(() => {
    const names = new Set<string>();
    dynamicSecrets?.forEach((dynamicSecret) => {
      names.add(dynamicSecret.name);
    });
    return [...names];
  }, [dynamicSecrets]);

  const isDynamicSecretPresentInEnv = useCallback(
    (name: string, env: string) => {
      return Boolean(
        dynamicSecrets?.find(
          ({ name: dynamicSecretName, environment }) =>
            dynamicSecretName === name && environment === env
        )
      );
    },
    [dynamicSecrets]
  );

  return { dynamicSecretNames, isDynamicSecretPresentInEnv };
};

export const useSecretOverview = (secrets: DashboardProjectSecretsOverview["secrets"]) => {
  const secKeys = useMemo(() => {
    const keys = new Set<string>();
    secrets?.forEach((secret) => keys.add(secret.key));
    return [...keys];
  }, [secrets]);

  const getEnvSecretKeyCount = useCallback(
    (env: string) => {
      return secrets?.filter((secret) => secret.env === env).length ?? 0;
    },
    [secrets]
  );

  return { secKeys, getEnvSecretKeyCount };
};
