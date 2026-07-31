import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

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
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  TSpaceliftContext,
  useSpaceliftConnectionListContexts
} from "@app/hooks/api/appConnections/spacelift";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  SpaceliftConfigType,
  SpaceliftFileMountFormat
} from "@app/hooks/api/secretSyncs/types/spacelift-sync";

import { TSecretSyncForm } from "../schemas";

const CONFIG_TYPE_LABELS: Record<SpaceliftConfigType, string> = {
  [SpaceliftConfigType.EnvironmentVariable]: "Environment Variables",
  [SpaceliftConfigType.FileMount]: "File Mount"
};

const FILE_MOUNT_FORMAT_LABELS: Record<SpaceliftFileMountFormat, string> = {
  [SpaceliftFileMountFormat.DotEnv]: ".env File",
  [SpaceliftFileMountFormat.SecretPerFile]: "One Secret Per File"
};

export const SpaceliftSyncFields = () => {
  const { control, setValue, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Spacelift }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const configType = watch("destinationConfig.configType");
  const fileMountFormat = watch("destinationConfig.fileMountFormat");

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
                    setValue("destinationConfig.fileMountFormat", undefined);
                  } else {
                    setValue("destinationConfig.fileMountFormat", SpaceliftFileMountFormat.DotEnv);
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
        <>
          <Controller
            name="destinationConfig.fileMountFormat"
            control={control}
            defaultValue={SpaceliftFileMountFormat.DotEnv}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>File Format</FieldLabel>
                <FieldContent>
                  <Select value={value ?? SpaceliftFileMountFormat.DotEnv} onValueChange={onChange}>
                    <SelectTrigger className="w-full" isError={Boolean(error)}>
                      <SelectValue placeholder="Select file format..." />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.values(SpaceliftFileMountFormat).map((fmt) => (
                        <SelectItem value={fmt} key={fmt}>
                          {FILE_MOUNT_FORMAT_LABELS[fmt]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          {fileMountFormat === SpaceliftFileMountFormat.SecretPerFile ? (
            <Controller
              name="destinationConfig.mountPath"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Directory Path (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        {
                          "Files will be mounted at /mnt/workspace/<directory>/<secret-key>. Leave empty to mount directly in /mnt/workspace/."
                        }
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      value={value}
                      onChange={onChange}
                      placeholder="secrets/"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          ) : (
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
        </>
      )}
    </FieldGroup>
  );
};
