import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TGiteaRepo,
  useGiteaConnectionListRepositories
} from "@app/hooks/api/appConnections/gitea";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GiteaSyncScope } from "@app/hooks/api/secretSyncs/types/gitea-sync";

import { TSecretSyncForm } from "../schemas";

export const GiteaSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Gitea }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const owner = useWatch({ name: "destinationConfig.owner", control });
  const repo = useWatch({ name: "destinationConfig.repo", control });

  const { data: repositories = [], isPending: isRepositoriesLoading } =
    useGiteaConnectionListRepositories(connectionId, {
      enabled: Boolean(connectionId)
    });

  const selectedRepo = repositories.find((r) => r.owner.login === owner && r.name === repo) ?? null;

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", GiteaSyncScope.Repository);
          setValue("destinationConfig.owner", "");
          setValue("destinationConfig.repo", "");
        }}
      />

      <Controller
        name="destinationConfig.owner"
        control={control}
        defaultValue=""
        render={({ fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Gitea Repository"
            tooltipClassName="max-w-md"
            tooltipText="The Gitea repository (owner/name) to sync secrets to. Repository-level Action Secrets only."
          >
            <FilterableSelect
              isLoading={isRepositoriesLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={selectedRepo}
              onChange={(option) => {
                const v = option as SingleValue<TGiteaRepo>;
                setValue("destinationConfig.owner", v?.owner.login ?? "", { shouldDirty: true });
                setValue("destinationConfig.repo", v?.name ?? "", { shouldDirty: true });
              }}
              options={repositories}
              placeholder="Select repository..."
              getOptionLabel={(option) => option.full_name}
              getOptionValue={(option) => String(option.id)}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GiteaSyncScope.Repository}
        render={({ field }) => <input type="hidden" {...field} />}
      />
    </>
  );
};
