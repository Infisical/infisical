import { useCallback, useMemo } from "react";

import { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";

export const useFolderOverview = (folders: DashboardProjectSecretsOverview["folders"]) => {
  const folderNames = useMemo(() => {
    const names = new Set<string>();
    folders?.forEach((folder) => {
      names.add(folder.name);
    });
    return [...names];
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

  return { folderNames, isFolderPresentInEnv, getFolderByNameAndEnv };
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

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const sec = secrets?.find((s) => s.env === env && s.key === key);
      return sec;
    },
    [secrets]
  );

  return { secKeys, getSecretByKey, getEnvSecretKeyCount };
};
