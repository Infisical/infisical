import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  TSpaceliftContext,
  useSpaceliftConnectionListContexts
} from "@app/hooks/api/appConnections/spacelift";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { SpaceliftConfigType } from "@app/hooks/api/secretSyncs/types/spacelift-sync";

import { TSecretSyncForm } from "../schemas";

const CONFIG_TYPE_LABELS: Record<SpaceliftConfigType, string> = {
  [SpaceliftConfigType.EnvironmentVariable]: "Environment Variables",
  [SpaceliftConfigType.FileMount]: "File Mount (.env)"
};

export const SpaceliftSyncFields = () => {
  const { control, setValue, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Spacelift }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const configType = watch("destinationConfig.configType");

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

      <Controller
        name="destinationConfig.configType"
        control={control}
        defaultValue={SpaceliftConfigType.EnvironmentVariable}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Config Type</FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val !== SpaceliftConfigType.FileMount) {
                    setValue("destinationConfig.mountPath", "");
                  }
                }}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select config type..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(SpaceliftConfigType).map((type) => (
                    <SelectItem value={type} key={type}>
                      {CONFIG_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {configType === SpaceliftConfigType.FileMount && (
        <Controller
          name="destinationConfig.mountPath"
          control={control}
          rules={{ required: "File path is required" }}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>File Path</FieldLabel>
              <FieldContent>
                <Input
                  value={value}
                  onChange={onChange}
                  placeholder="secrets.env"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
