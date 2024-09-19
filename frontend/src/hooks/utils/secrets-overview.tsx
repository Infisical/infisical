import { useCallback, useMemo } from "react";

import { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

export const useFolderOverview = (
  folders: DashboardProjectSecretsOverview["folders"],
  orderDirection: OrderByDirection
) => {
  const folderNames = useMemo(() => {
    const names = new Set<string>();
    Object.values(folders ?? {})?.forEach((folderGroup) => {
      folderGroup.forEach((folder) => {
        names.add(folder.name);
      });
    });
    return [...names].sort((a, b) =>
      orderDirection === OrderByDirection.ASC ? a.localeCompare(b) : b.localeCompare(a)
    );
  }, [folders]);

  const isFolderPresentInEnv = useCallback(
    (name: string, env: string) => {
      return Boolean(folders?.[env]?.find(({ name: folderName }) => folderName === name));
    },
    [folders]
  );

  const getFolderByNameAndEnv = useCallback(
    (name: string, env: string) => {
      return folders?.[env]?.find(({ name: folderName }) => folderName === name);
    },
    [folders]
  );

  return { folderNames, isFolderPresentInEnv, getFolderByNameAndEnv };
};

export const useDynamicSecretOverview = (
  dynamicSecrets: DashboardProjectSecretsOverview["dynamicSecrets"],
  orderDirection: OrderByDirection
) => {
  const dynamicSecretNames = useMemo(() => {
    const names = new Set<string>();
    Object.values(dynamicSecrets ?? {})?.forEach((folderGroup) => {
      folderGroup.forEach((folder) => {
        names.add(folder.name);
      });
    });
    return [...names].sort((a, b) =>
      orderDirection === OrderByDirection.ASC ? a.localeCompare(b) : b.localeCompare(a)
    );
  }, [dynamicSecrets]);

  const isDynamicSecretPresentInEnv = useCallback(
    (name: string, env: string) => {
      return Boolean(
        dynamicSecrets?.[env]?.find(({ name: dynamicSecretName }) => dynamicSecretName === name)
      );
    },
    [dynamicSecrets]
  );

  return { dynamicSecretNames, isDynamicSecretPresentInEnv };
};

export const useSecretOverview = (
  secrets: DashboardProjectSecretsOverview["secrets"],
  orderDirection: OrderByDirection
) => {
  const secKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.values(secrets ?? {})?.forEach((secretGroup) => {
      Object.keys(secretGroup || {}).forEach((key) => {
        keys.add(key);
      });
    });
    return [...keys].sort((a, b) =>
      orderDirection === OrderByDirection.ASC ? a.localeCompare(b) : b.localeCompare(a)
    );
  }, [secrets]);

  const getEnvSecretKeyCount = useCallback(
    (env: string) => {
      return Object.keys(secrets?.[env] || {}).length;
    },
    [secrets]
  );

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const sec = secrets?.[env]?.[key];
      return sec;
    },
    [secrets]
  );

  return { secKeys, getSecretByKey, getEnvSecretKeyCount };
};
