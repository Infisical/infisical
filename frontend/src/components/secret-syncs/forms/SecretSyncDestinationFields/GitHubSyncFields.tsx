import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem } from "@app/components/v2";
import {
  TGitHubConnectionEnvironment,
  TGitHubConnectionOrganization,
  TGitHubConnectionRepository,
  useGitHubConnectionListEnvironments,
  useGitHubConnectionListOrganizations,
  useGitHubConnectionListRepositories
} from "@app/hooks/api/appConnections/github";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  GitHubSyncScope,
  GitHubSyncVisibility
} from "@app/hooks/api/secretSyncs/types/github-sync";

import { TSecretSyncForm } from "../schemas";

export const GitHubSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GitHub }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const currentScope = watch("destinationConfig.scope");
  const currentVisibility = watch("destinationConfig.visibility");
  const currentOrg = watch("destinationConfig.org");
  const currentRepo = watch("destinationConfig.repo");
  const currentOwner = watch("destinationConfig.owner");

  const { data: repositories = [], isPending: isRepositoriesPending } =
    useGitHubConnectionListRepositories(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: organizations = [], isPending: isOrganizationsPending } =
    useGitHubConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId && currentScope === GitHubSyncScope.Organization)
    });

  const { data: environments = [], isPending: isEnvironmentsPending } =
    useGitHubConnectionListEnvironments(
      {
        connectionId,
        repo: currentRepo,
        owner: currentOwner
      },
      {
        enabled: Boolean(
          connectionId &&
            currentRepo &&
            currentOwner &&
            currentScope === GitHubSyncScope.RepositoryEnvironment
        )
      }
    );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.repo", "");
          setValue("destinationConfig.owner", "");
          setValue("destinationConfig.selectedRepositoryIds", undefined);
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GitHubSyncScope.Repository}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl errorText={error?.message} isError={Boolean(error?.message)} label="Scope">
            <Select
              value={value}
              onValueChange={(val) => {
                onChange(val);
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(GitHubSyncScope).map((scope) => (
                <SelectItem className="capitalize" value={scope} key={scope}>
                  {scope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {currentScope === GitHubSyncScope.Organization && (
        <>
          <Controller
            name="destinationConfig.org"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl isError={Boolean(error)} errorText={error?.message} label="Organization">
                <FilterableSelect
                  isLoading={isOrganizationsPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={organizations.find((org) => org.login === value) ?? null}
                  onChange={(option) =>
                    onChange((option as SingleValue<TGitHubConnectionOrganization>)?.login ?? null)
                  }
                  options={organizations}
                  placeholder="Select an organization..."
                  getOptionLabel={(option) => option.login}
                  getOptionValue={(option) => option.login}
                />
              </FormControl>
            )}
          />
          <Controller
            name="destinationConfig.visibility"
            control={control}
            defaultValue={GitHubSyncVisibility.All}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Visibility"
              >
                <Select
                  value={value}
                  onValueChange={(val) => {
                    onChange(val);
                    setValue("destinationConfig.selectedRepositoryIds", undefined);
                  }}
                  className="w-full border border-mineshaft-500 capitalize"
                  position="popper"
                  placeholder="Select visibility..."
                  dropdownContainerClassName="max-w-none"
                >
                  {Object.values(GitHubSyncVisibility).map((scope) => (
                    <SelectItem className="capitalize" value={scope} key={scope}>
                      {scope.replace("-", " ")} Repositories
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          {currentVisibility === GitHubSyncVisibility.Selected && (
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error)}
                  errorText={error?.message}
                  label="Selected Repositories"
                >
                  <FilterableSelect
                    menuPlacement="top"
                    isLoading={isRepositoriesPending && Boolean(currentOrg)}
                    isDisabled={!currentOrg || !connectionId}
                    isMulti
                    value={repositories.filter((repo) => value?.includes(repo.id))}
                    onChange={(option) => {
                      const repos = option as MultiValue<TGitHubConnectionRepository>;
                      onChange(repos.map((repo) => repo.id));
                    }}
                    options={repositories.filter((repo) => repo.owner.login === currentOrg)}
                    placeholder="Select one or more repositories..."
                    getOptionLabel={(option) => `${option.owner.login}/${option.name}`}
                    getOptionValue={(option) => option.id.toString()}
                  />
                </FormControl>
              )}
              control={control}
              name="destinationConfig.selectedRepositoryIds"
            />
          )}
        </>
      )}
      {currentScope !== GitHubSyncScope.Organization && (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} label="Repository">
              <FilterableSelect
                menuPlacement="top"
                isLoading={isRepositoriesPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={repositories.find((repo) => repo.name === value) ?? null}
                onChange={(option) => {
                  const repo = option as SingleValue<TGitHubConnectionRepository>;

                  onChange(repo?.name);
                  setValue("destinationConfig.owner", repo?.owner.login ?? "");
                  setValue("destinationConfig.env", "");
                }}
                options={repositories}
                placeholder="Select a repository..."
                getOptionLabel={(option) => `${option.owner.login}/${option.name}`}
                getOptionValue={(option) => option.id.toString()}
              />
            </FormControl>
          )}
          control={control}
          name="destinationConfig.repo"
        />
      )}
      {currentScope === GitHubSyncScope.RepositoryEnvironment && (
        <Controller
          name="destinationConfig.env"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} label="Environment">
              <FilterableSelect
                menuPlacement="top"
                isLoading={isEnvironmentsPending && Boolean(connectionId) && Boolean(currentRepo)}
                isDisabled={!connectionId || !currentRepo}
                value={environments.find((env) => env.name === value) ?? null}
                onChange={(option) =>
                  onChange((option as SingleValue<TGitHubConnectionEnvironment>)?.name ?? null)
                }
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
              />
            </FormControl>
          )}
        />
      )}
    </>
  );
};
