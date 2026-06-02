import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  SecretPathInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  const currentSecretPath = useWatch({ name: "destinationConfig.secretPath", control });

  const { data: projects = [], isPending: isProjectsLoading } =
    useExternalInfisicalConnectionListProjects(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: folderTree = {} } = useExternalInfisicalConnectionGetEnvironmentFolderTree(
    connectionId,
    projectId,
    { enabled: Boolean(connectionId) && Boolean(projectId) }
  );

  const environments = useMemo(() => {
    return projects.find((p) => p.id === projectId)?.environments ?? [];
  }, [projects, projectId]);

  const childFolderNamesAtPath = useMemo(() => {
    if (!environmentSlug) return [];

    const tree = folderTree as TRemoteInfisicalEnvironmentFolderTree;
    const envData =
      tree[environmentSlug] ?? Object.values(tree).find((env) => env.slug === environmentSlug);
    const allFolders = envData?.folders ?? [];

    const browsedPath =
      currentSecretPath && !currentSecretPath.endsWith("/")
        ? `${currentSecretPath}/`
        : (currentSecretPath ?? "/");

    return allFolders
      .filter((f) => {
        if (!f.path.startsWith(browsedPath)) return false;
        const remainder = f.path.slice(browsedPath.length);
        return remainder.length > 0 && !remainder.includes("/");
      })
      .map((f) => f.name);
  }, [folderTree, environmentSlug, currentSecretPath]);

  return (
    <FieldGroup>
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
          <Field>
            <FieldLabel>
              Project
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  The project on the remote Infisical instance to sync secrets to. Ensure the
                  machine identity used by this connection has access to the project.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.environment"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Environment
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>The environment on the remote Infisical instance.</TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.secretPath"
        control={control}
        defaultValue="/"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Secret path
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  The folder path on the remote Infisical instance to sync secrets to.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <SecretPathInput
                disabled={!connectionId || !projectId || !environmentSlug}
                value={value}
                onChange={onChange}
                folderNames={childFolderNamesAtPath}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
