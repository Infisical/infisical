import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem } from "@app/components/v2";
import {
  TCloudflareProject,
  useCloudflareConnectionListPagesProjects
} from "@app/hooks/api/appConnections/cloudflare";
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
    <>
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
          <FormControl errorText={error?.message} isError={Boolean(error?.message)} label="Project">
            <FilterableSelect
              isLoading={isProjectsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects ? (projects.find((project) => project.name === value) ?? []) : []}
              onChange={(option) => {
                onChange((option as SingleValue<TCloudflareProject>)?.name ?? null);
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.environment"
        control={control}
        defaultValue="preview"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Environment"
            tooltipClassName="max-w-lg py-3"
          >
            <Select
              value={value}
              onValueChange={(val) => onChange(val)}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select an environment..."
              dropdownContainerClassName="max-w-none"
            >
              {CLOUDFLARE_ENVIRONMENTS.map(({ name, value: envValue }) => (
                <SelectItem className="capitalize" value={envValue} key={envValue}>
                  {name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};
