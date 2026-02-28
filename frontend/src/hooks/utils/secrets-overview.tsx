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

  const getDynamicSecretByName = useCallback(
    (env: string, name: string) => {
      return dynamicSecrets?.find((ds) => ds.environment === env && ds.name === name);
    },
    [dynamicSecrets]
  );

  const getDynamicSecretStatusesByName = useCallback(
    (name: string) =>
      dynamicSecrets?.filter((ds) => ds.name === name).map((ds) => ds.status ?? null),
    [dynamicSecrets]
  );

  return {
    dynamicSecretNames,
    isDynamicSecretPresentInEnv,
    getDynamicSecretByName,
    getDynamicSecretStatusesByName
  };
};

export const useSecretRotationOverview = (
  secretRotations: DashboardProjectSecretsOverview["secretRotations"]
) => {
  const secretRotationNames = useMemo(() => {
    const names = new Set<string>();
    secretRotations?.forEach((secretRotation) => {
      names.add(secretRotation.name);
    });
    return [...names];
  }, [secretRotations]);

  const isSecretRotationPresentInEnv = useCallback(
    (name: string, env: string) => {
      return Boolean(
        secretRotations?.find(
          ({ name: secretRotationName, environment }) =>
            secretRotationName === name && environment.slug === env
        )
      );
    },
    [secretRotations]
  );

  const getSecretRotationByName = useCallback(
    (env: string, name: string) => {
      const secretRotation = secretRotations?.find(
        (rotation) => rotation.environment.slug === env && rotation.name === name
      );
      return secretRotation;
    },
    [secretRotations]
  );

  const getSecretRotationStatusesByName = useCallback(
    (name: string) =>
      secretRotations
        ?.filter((rotation) => rotation.name === name)
        .map((rotation) => rotation.rotationStatus),
    [secretRotations]
  );

  return {
    secretRotationNames,
    isSecretRotationPresentInEnv,
    getSecretRotationByName,
    getSecretRotationStatusesByName
  };
};

export const useSecretImportOverview = (imports: DashboardProjectSecretsOverview["imports"]) => {
  const secretImportNames = useMemo(() => {
    const keys = new Map<
      string,
      { importEnvSlug: string; importEnvName: string; importPath: string }
    >();
    imports?.forEach((imp) => {
      if (imp.isReserved) return;
      const key = `${imp.importEnv.slug}:${imp.importPath}`;
      if (!keys.has(key)) {
        keys.set(key, {
          importEnvSlug: imp.importEnv.slug,
          importEnvName: imp.importEnv.name,
          importPath: imp.importPath
        });
      }
    });
    return Array.from(keys.values());
  }, [imports]);

  const isSecretImportInEnv = useCallback(
    (importEnvSlug: string, importPath: string, targetEnv: string) => {
      return Boolean(
        imports?.find(
          (imp) =>
            !imp.isReserved &&
            imp.importEnv.slug === importEnvSlug &&
            imp.importPath === importPath &&
            imp.environment === targetEnv
        )
      );
    },
    [imports]
  );

  const getSecretImportByEnv = useCallback(
    (importEnvSlug: string, importPath: string, targetEnv: string) => {
      return imports?.find(
        (imp) =>
          !imp.isReserved &&
          imp.importEnv.slug === importEnvSlug &&
          imp.importPath === importPath &&
          imp.environment === targetEnv
      );
    },
    [imports]
  );

  const getSecretImportsForEnv = useCallback(
    (targetEnv: string) => {
      return (
        imports
          ?.filter((imp) => !imp.isReserved && imp.environment === targetEnv)
          .sort((a, b) => Number(a.position) - Number(b.position)) ?? []
      );
    },
    [imports]
  );

  return {
    secretImportNames,
    isSecretImportInEnv,
    getSecretImportByEnv,
    getSecretImportsForEnv
  };
};

export const useSecretOverview = (secrets: DashboardProjectSecretsOverview["secrets"]) => {
  const secKeys = useMemo(() => {
    const keys = new Set<string>();
    secrets?.forEach((secret) => keys.add(secret.key));
    return [...keys];
  }, [secrets]);

  const getEnvSecretKeyCount = useCallback(
    (env: string) => {
      return (
        secrets?.filter((secret) =>
          secret.sourceEnv ? secret.sourceEnv === env : secret.env === env
        ).length ?? 0
      );
    },
    [secrets]
  );

  return { secKeys, getEnvSecretKeyCount };
};
