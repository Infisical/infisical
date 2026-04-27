import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TTravisCIBranch,
  TTravisCIRepository,
  useTravisCIConnectionListBranches,
  useTravisCIConnectionListRepositories
} from "@app/hooks/api/appConnections/travis-ci";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const TravisCISyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.TravisCI }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const currentRepositoryId = useWatch({ name: "destinationConfig.repositoryId", control });

  const { data: repositories = [], isPending: isRepositoriesPending } =
    useTravisCIConnectionListRepositories(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: branches = [], isPending: isBranchesPending } = useTravisCIConnectionListBranches(
    connectionId,
    currentRepositoryId,
    {
      enabled: Boolean(connectionId && currentRepositoryId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.repositoryId", "");
          setValue("destinationConfig.repositorySlug", "");
          setValue("destinationConfig.branch", undefined);
        }}
      />
      <Controller
        name="destinationConfig.repositoryId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Repository">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isRepositoriesPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={repositories.find((repo) => repo.id === value) ?? null}
              onChange={(option) => {
                const repo = option as SingleValue<TTravisCIRepository>;
                onChange(repo?.id ?? "");
                setValue("destinationConfig.repositorySlug", repo?.slug ?? "");
                setValue("destinationConfig.branch", undefined);
              }}
              options={repositories}
              placeholder="Select a repository..."
              getOptionLabel={(option) => option.slug}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.branch"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Branch"
            isOptional
          >
            <FilterableSelect
              menuPlacement="top"
              isClearable
              isLoading={isBranchesPending && Boolean(connectionId) && Boolean(currentRepositoryId)}
              isDisabled={!connectionId || !currentRepositoryId}
              value={branches.find((branch) => branch.name === value) ?? null}
              onChange={(option) => {
                const branch = option as SingleValue<TTravisCIBranch>;
                onChange(branch?.name ?? undefined);
              }}
              options={branches}
              placeholder="Select a branch..."
              getOptionLabel={(option) =>
                option.isDefault ? `${option.name} (default)` : option.name
              }
              getOptionValue={(option) => option.name}
            />
          </FormControl>
        )}
      />
    </>
  );
};
