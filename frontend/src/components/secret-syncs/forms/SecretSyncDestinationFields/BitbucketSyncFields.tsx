import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
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
            <FieldLabel
              id="secret-sync-bitbucket-workspace-slug-label"
              htmlFor="secret-sync-bitbucket-workspace-slug"
            >
              Bitbucket Workspace
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-bitbucket-workspace-slug-label"
                aria-describedby={error ? "secret-sync-bitbucket-workspace-slug-error" : undefined}
                id="secret-sync-bitbucket-workspace-slug"
                isError={Boolean(error)}
                isLoading={isWorkspacesLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={value || null}
                onValueChange={(option) => {
                  if (option === value) return;
                  onChange(option);
                  setValue("destinationConfig.repositorySlug", "");
                  setValue("destinationConfig.environmentId", "");
                }}
                onInputValueChange={(newValue) => setWorkspaceSearch(newValue)}
                shouldFilter={false}
                includeMissingSelectedOptions={!workspaceSearch}
                options={workspaces.map((w) => w.slug)}
                placeholder="Search for a workspace..."
                getOptionLabel={(option) => option}
                getOptionValue={(option) => option}
                emptyMessage={(inputValue) =>
                  inputValue ? "No workspaces found matching your search." : "No workspaces found."
                }
                modal
              />
              <FieldError id="secret-sync-bitbucket-workspace-slug-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.repositorySlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-bitbucket-repository-slug-label"
              htmlFor="secret-sync-bitbucket-repository-slug"
            >
              Bitbucket Repository
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-bitbucket-repository-slug-label"
                aria-describedby={error ? "secret-sync-bitbucket-repository-slug-error" : undefined}
                id="secret-sync-bitbucket-repository-slug"
                isError={Boolean(error)}
                isLoading={isRepositoriesLoading && Boolean(workspace)}
                isDisabled={!workspace}
                value={value || null}
                onValueChange={(option) => {
                  if (option === value) return;
                  onChange(option);
                  setValue("destinationConfig.environmentId", "");
                }}
                onInputValueChange={(newValue) => setRepoSearch(newValue)}
                shouldFilter={false}
                includeMissingSelectedOptions={!repoSearch}
                options={repositories.map((r) => r.slug)}
                placeholder="Search for a repository..."
                getOptionLabel={(option) =>
                  repositories.find((r) => r.slug === option)?.full_name ?? `${workspace}/${option}`
                }
                getOptionValue={(option) => option}
                emptyMessage={(inputValue) =>
                  inputValue
                    ? "No repositories found matching your search."
                    : "No repositories found."
                }
                modal
              />
              <FieldError id="secret-sync-bitbucket-repository-slug-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.environmentId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-bitbucket-environment-id-label"
              htmlFor="secret-sync-bitbucket-environment-id"
            >
              Bitbucket Deployment Environment (Optional)
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-bitbucket-environment-id-label"
                aria-describedby={error ? "secret-sync-bitbucket-environment-id-error" : undefined}
                id="secret-sync-bitbucket-environment-id"
                isError={Boolean(error)}
                isLoading={isEnvironmentsLoading && Boolean(repository)}
                isDisabled={!repository}
                value={value || null}
                onValueChange={(option) => {
                  onChange(option);
                }}
                onClear={() => onChange("")}
                options={environments.map((e) => e.uuid)}
                placeholder="Select environment..."
                getOptionLabel={(option) =>
                  environments.find((e) => e.uuid === option)?.name ?? option
                }
                getOptionValue={(option) => option}
                getOptionKeywords={(option) => [option]}
                modal
              />
              <FieldError id="secret-sync-bitbucket-environment-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
