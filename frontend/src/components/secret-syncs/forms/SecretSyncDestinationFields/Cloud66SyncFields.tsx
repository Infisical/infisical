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
import { TCloud66Stack } from "@app/hooks/api/appConnections/cloud-66";
import { useCloud66ConnectionListStacks } from "@app/hooks/api/appConnections/cloud-66/queries";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const Cloud66SyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Cloud66 }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: stacks, isLoading: isStacksLoading } = useCloud66ConnectionListStacks(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.stackId", "");
          setValue("destinationConfig.stackName", "");
        }}
      />

      <Controller
        name="destinationConfig.stackId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Stack</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isStacksLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={stacks?.find((stack) => stack.id === value) ?? null}
                onChange={(option) => {
                  const selectedStack = option as SingleValue<TCloud66Stack>;
                  onChange(selectedStack?.id ?? "");
                  setValue("destinationConfig.stackName", selectedStack?.name ?? "");
                }}
                options={stacks}
                placeholder="Select a stack..."
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
