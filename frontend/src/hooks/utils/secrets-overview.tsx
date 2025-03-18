import { useCallback, useMemo } from "react";

import { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";
import { TSecretImportMultiEnvData } from "@app/hooks/api/secretImports/types";

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

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const sec = secrets?.find((s) => s.env === env && s.key === key);
      return sec;
    },
    [secrets]
  );

  return { secKeys, getSecretByKey, getEnvSecretKeyCount };
};

export const useSecretImportOverview = (secretImports: TSecretImportMultiEnvData[] | undefined) => {
  const uniqueEnvSecretPaths = useMemo(() => {
    const uniqueMap = new Map<string, TSecretImportMultiEnvData>();
    secretImports?.forEach((importData) => {
      if (importData) {
        const key = `${importData.environment}-${importData.secretPath}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, importData);
        }
      }
    });
    return Array.from(uniqueMap.values());
  }, [secretImports]);

  const isSecretImportPresent = useCallback(
    (sourceEnv: string, targetEnv: string, secretPath: string) => {
      return (
        secretImports?.some(
          (importData) =>
            importData?.currentEnv === sourceEnv &&
            importData?.environment === targetEnv &&
            importData?.secretPath === secretPath
        ) ?? false
      );
    },
    [secretImports]
  );

  return {
    uniqueEnvSecretPaths,
    isSecretImportPresent
  };
};
