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
import {
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
    <FieldGroup>
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
          <Field>
            <FieldLabel>Repository</FieldLabel>
            <FieldContent>
              <Combobox
                isError={Boolean(error)}
                isLoading={isRepositoriesPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={repositories.find((repo) => repo.id === value) ?? null}
                onValueChange={(option) => {
                  const repo = option;
                  onChange(repo?.id ?? "");
                  setValue("destinationConfig.repositorySlug", repo?.slug ?? "");
                  setValue("destinationConfig.branch", undefined);
                }}
                options={repositories}
                placeholder="Select a repository..."
                getOptionLabel={(option) => option.slug}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.branch"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Branch (Optional)</FieldLabel>
            <FieldContent>
              <Combobox
                isError={Boolean(error)}
                isLoading={
                  isBranchesPending && Boolean(connectionId) && Boolean(currentRepositoryId)
                }
                isDisabled={!connectionId || !currentRepositoryId}
                value={branches.find((branch) => branch.name === value) ?? null}
                onValueChange={(option) => {
                  const branch = option;
                  onChange(branch?.name ?? undefined);
                }}
                onClear={() => onChange(undefined)}
                options={branches}
                placeholder="Select a branch..."
                getOptionLabel={(option) =>
                  option.isDefault ? `${option.name} (default)` : option.name
                }
                getOptionValue={(option) => option.name}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
