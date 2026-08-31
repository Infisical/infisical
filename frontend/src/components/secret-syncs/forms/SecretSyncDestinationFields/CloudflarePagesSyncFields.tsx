import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useCloudflareConnectionListPagesProjects } from "@app/hooks/api/appConnections/cloudflare";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const CLOUDFLARE_ENVIRONMENTS = [
  {
    name: "Preview",
    value: "preview"
  },
  {
    name: "Production",
    value: "production"
  }
];

export const CloudflarePagesSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflarePages }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects = [], isPending: isProjectsPending } =
    useCloudflareConnectionListPagesProjects(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environment", "preview");
        }}
      />
      <Controller
        name="destinationConfig.projectName"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Project</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isProjectsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects.find((project) => project.name === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.name ?? null);
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.environment"
        control={control}
        defaultValue="preview"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select an environment..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {CLOUDFLARE_ENVIRONMENTS.map(({ name, value: envValue }) => (
                    <SelectItem className="capitalize" value={envValue} key={envValue}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
