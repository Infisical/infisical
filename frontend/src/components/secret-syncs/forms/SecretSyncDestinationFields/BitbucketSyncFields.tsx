import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
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

  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [debouncedWorkspaceSearch] = useDebounce(workspaceSearch, 300);
  const [repoSearch, setRepoSearch] = useState("");
  const [debouncedRepoSearch] = useDebounce(repoSearch, 300);
  const connectionId = useWatch({ name: "connection.id", control });
  const workspace = useWatch({ name: "destinationConfig.workspaceSlug", control });
  const repository = useWatch({ name: "destinationConfig.repositorySlug", control });

  const { data: workspaces = [], isPending: isWorkspacesLoading } =
    useBitbucketConnectionListWorkspaces(connectionId, debouncedWorkspaceSearch || undefined, {
      enabled: Boolean(connectionId)
    });

  const { data: repositories = [], isPending: isRepositoriesLoading } =
    useBitbucketConnectionListRepositories(
      connectionId,
      workspace ?? "",
      debouncedRepoSearch || undefined,
      {
        enabled: Boolean(connectionId) && Boolean(workspace)
      }
    );

  const { data: environments = [], isPending: isEnvironmentsLoading } =
    useBitbucketConnectionListEnvironments(connectionId, workspace ?? "", repository ?? "", {
      enabled: Boolean(connectionId) && Boolean(workspace) && Boolean(repository)
    });

  return (
    <FieldGroup>
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
          <Field>
            <FieldLabel>Bitbucket Workspace</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isWorkspacesLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={workspaces.find((w) => w.slug === value) ?? null}
                onChange={(option) => {
                  const v = option as SingleValue<TBitbucketWorkspace>;
                  onChange(v?.slug ?? "");
                  setValue("destinationConfig.repositorySlug", "");
                  setValue("destinationConfig.environmentId", "");
                }}
                onInputChange={(newValue) => setWorkspaceSearch(newValue)}
                filterOption={null}
                options={workspaces}
                placeholder="Search for a workspace..."
                getOptionLabel={(option) => option.slug}
                getOptionValue={(option) => option.slug}
                noOptionsMessage={({ inputValue }) =>
                  inputValue ? "No workspaces found matching your search." : "No workspaces found."
                }
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.repositorySlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Bitbucket Repository</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isRepositoriesLoading && Boolean(workspace)}
                isDisabled={!workspace}
                value={repositories.find((r) => r.slug === value) ?? null}
                onChange={(option) => {
                  const v = option as SingleValue<TBitbucketRepo>;
                  onChange(v?.slug ?? "");
                  setValue("destinationConfig.environmentId", "");
                }}
                onInputChange={(newValue) => setRepoSearch(newValue)}
                filterOption={null}
                options={repositories}
                placeholder="Search for a repository..."
                getOptionLabel={(option) => option.full_name}
                getOptionValue={(option) => option.slug}
                noOptionsMessage={({ inputValue }) =>
                  inputValue
                    ? "No repositories found matching your search."
                    : "No repositories found."
                }
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.environmentId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Bitbucket Deployment Environment (Optional)</FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
