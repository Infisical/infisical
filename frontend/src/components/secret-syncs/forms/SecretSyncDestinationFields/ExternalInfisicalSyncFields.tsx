import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Input } from "@app/components/v2";
import {
  TRemoteInfisicalEnvironmentFolderTree,
  TRemoteInfisicalProject,
  useExternalInfisicalConnectionGetEnvironmentFolderTree,
  useExternalInfisicalConnectionListProjects
} from "@app/hooks/api/appConnections/external-infisical";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ExternalInfisicalSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.ExternalInfisical }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const environmentSlug = useWatch({ name: "destinationConfig.environment", control });

  const { data: projects = [], isPending: isProjectsLoading } =
    useExternalInfisicalConnectionListProjects(connectionId, {
      enabled: Boolean(connectionId)
    });

  const {
    data: folderTree = {},
    isPending: isFolderTreeLoading,
    isError: isFolderTreeError
  } = useExternalInfisicalConnectionGetEnvironmentFolderTree(connectionId, projectId, {
    enabled: Boolean(connectionId) && Boolean(projectId)
  });

  const environments = useMemo(() => {
    return projects.find((p) => p.id === projectId)?.environments ?? [];
  }, [projects, projectId]);

  const folderOptions = useMemo(() => {
    const root = { path: "/", name: "Root" };
    if (!environmentSlug) return [root];

    const tree = folderTree as TRemoteInfisicalEnvironmentFolderTree;
    // Remote API may key by env slug or by env id; support both
    const envData =
      tree[environmentSlug] ?? Object.values(tree).find((env) => env.slug === environmentSlug);
    const folders = envData?.folders ?? [];
    return [root, ...folders];
  }, [folderTree, environmentSlug]);

  // When folder tree fails or returns empty, allow manual path entry, since the target env might not have the API
  // modified to allow MI access to folder tree yet
  const showManualPathInput =
    Boolean(connectionId && projectId && environmentSlug) &&
    !isFolderTreeLoading &&
    (isFolderTreeError || folderOptions.length <= 1);

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.environment", "");
          setValue("destinationConfig.secretPath", "/");
        }}
      />
      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Project"
            tooltipText="The project on the remote Infisical instance to sync secrets to"
          >
            <FilterableSelect
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TRemoteInfisicalProject>;
                onChange(v?.id ?? "");
                setValue("destinationConfig.environment", "");
                setValue("destinationConfig.secretPath", "/");
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.environment"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Environment"
            tooltipText="The environment on the remote Infisical instance"
          >
            <FilterableSelect
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId || !projectId}
              value={environments.find((e) => e.slug === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<{ id: string; name: string; slug: string }>;
                onChange(v?.slug ?? "");
                setValue("destinationConfig.secretPath", "/");
              }}
              options={environments}
              placeholder="Select an environment..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.slug}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.secretPath"
        control={control}
        defaultValue="/"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Secret path"
            tooltipText="The folder path on the remote Infisical instance to sync secrets to"
            helperText={showManualPathInput ? "Enter the path (e.g. / or /my-folder)" : undefined}
          >
            {showManualPathInput ? (
              <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/" />
            ) : (
              <FilterableSelect
                isLoading={isFolderTreeLoading && Boolean(projectId)}
                isDisabled={!connectionId || !projectId || !environmentSlug}
                value={folderOptions.find((f) => f.path === value) ?? folderOptions[0]}
                onChange={(option) => {
                  const v = option as SingleValue<{ path: string; name: string }>;
                  onChange(v?.path ?? "/");
                }}
                options={folderOptions}
                placeholder="Select a path..."
                getOptionLabel={(option) => option.path}
                getOptionValue={(option) => option.path}
              />
            )}
          </FormControl>
        )}
      />
    </>
  );
};
