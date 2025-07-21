import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TBitbucketEnvironment,
  TBitbucketRepo,
  TBitbucketWorkspace,
  useBitbucketConnectionListEnvironments,
  useBitbucketConnectionListRepositories,
  useBitbucketConnectionListWorkspaces
} from "@app/hooks/api/appConnections/bitbucket";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const BitbucketSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Bitbucket }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const workspace = useWatch({ name: "destinationConfig.workspaceSlug", control });
  const repository = useWatch({ name: "destinationConfig.repositorySlug", control });

  const { data: workspaces = [], isPending: isWorkspacesLoading } =
    useBitbucketConnectionListWorkspaces(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: repositories = [], isPending: isRepositoriesLoading } =
    useBitbucketConnectionListRepositories(connectionId, workspace ?? "", {
      enabled: Boolean(connectionId) && Boolean(workspace)
    });

  const { data: environments = [], isPending: isEnvironmentsLoading } =
    useBitbucketConnectionListEnvironments(connectionId, workspace ?? "", repository ?? "", {
      enabled: Boolean(connectionId) && Boolean(workspace) && Boolean(repository)
    });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.workspaceSlug", "");
          setValue("destinationConfig.repositorySlug", "");
          setValue("destinationConfig.environmentId", "");
        }}
      />

      <Controller
        name="destinationConfig.workspaceSlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Bitbucket Workspace"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isWorkspacesLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={workspaces.find((w) => w.slug === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TBitbucketWorkspace>;
                onChange(v?.slug ?? "");
                // Clear downstream selections
                setValue("destinationConfig.repositorySlug", "");
                setValue("destinationConfig.environmentId", "");
              }}
              options={workspaces}
              placeholder="Select workspace..."
              getOptionLabel={(option) => option.slug}
              getOptionValue={(option) => option.slug}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.repositorySlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Bitbucket Repository"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isRepositoriesLoading && Boolean(workspace)}
              isDisabled={!workspace}
              value={repositories.find((r) => r.slug === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TBitbucketRepo>;
                onChange(v?.slug ?? "");
                // Clear downstream selections
                setValue("destinationConfig.environmentId", "");
              }}
              options={repositories}
              placeholder="Select repository..."
              getOptionLabel={(option) => option.full_name}
              getOptionValue={(option) => option.slug}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.environmentId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            isOptional
            label="Bitbucket Deployment Environment"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isEnvironmentsLoading && Boolean(repository)}
              isDisabled={!repository}
              value={environments.find((e) => e.uuid === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TBitbucketEnvironment>;
                onChange(v?.uuid ?? "");
              }}
              options={environments}
              placeholder="Select environment..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.uuid}
              isClearable
            />
          </FormControl>
        )}
      />
    </>
  );
};
