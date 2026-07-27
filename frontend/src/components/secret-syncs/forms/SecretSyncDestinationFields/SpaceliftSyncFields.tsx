import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel, FilterableSelect } from "@app/components/v3";
import { TSpaceliftContext, useSpaceliftConnectionListContexts } from "@app/hooks/api/appConnections/spacelift";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const SpaceliftSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Spacelift }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: contexts = [], isPending: isContextsPending } = useSpaceliftConnectionListContexts(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.contextId", "");
          setValue("destinationConfig.contextName", "");
        }}
      />

      <Controller
        name="destinationConfig.contextId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Context</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isContextsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={contexts.find((ctx) => ctx.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TSpaceliftContext>;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.contextName", selected?.name ?? "");
                }}
                options={contexts}
                placeholder="Select a context..."
                getOptionLabel={(option) => option.name}
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
