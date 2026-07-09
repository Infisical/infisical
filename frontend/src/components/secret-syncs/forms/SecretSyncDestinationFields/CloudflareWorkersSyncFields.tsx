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
import {
  TCloudflareWorkersScript,
  useCloudflareConnectionListWorkersScripts
} from "@app/hooks/api/appConnections/cloudflare";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CloudflareWorkersSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: scripts = [], isPending: isScriptsPending } =
    useCloudflareConnectionListWorkersScripts(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scriptId", "");
        }}
      />
      <Controller
        name="destinationConfig.scriptId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Worker Script</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isScriptsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={scripts?.find((script) => script.id === value) || []}
                onChange={(option) => {
                  onChange((option as SingleValue<TCloudflareWorkersScript>)?.id ?? null);
                }}
                options={scripts}
                placeholder="Select a worker script..."
                getOptionLabel={(option) => option.id}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
