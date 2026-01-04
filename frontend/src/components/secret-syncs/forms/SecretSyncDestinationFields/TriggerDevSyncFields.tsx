import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TriggerDevEnvironment } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

import { TSecretSyncForm } from "../schemas";

const ENVIRONMENT_LABELS: Record<TriggerDevEnvironment, string> = {
  [TriggerDevEnvironment.Dev]: "Development",
  [TriggerDevEnvironment.Staging]: "Staging",
  [TriggerDevEnvironment.Prod]: "Production"
};

export const TriggerDevSyncFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.TriggerDev }>();

  return (
    <>
      <SecretSyncConnectionField />
      <Controller
        name="destinationConfig.projectRef"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project Ref"
            helperText="Example: proj_abc123"
          >
            <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="proj_abc123" />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.environment"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Environment"
            helperText="Match the Trigger.dev environment for the selected API token."
          >
            <Select
              value={value}
              onValueChange={(val) => onChange(val)}
              className="w-full border border-mineshaft-500"
              position="popper"
              dropdownContainerClassName="max-w-none"
              placeholder="Select an environment..."
            >
              {Object.values(TriggerDevEnvironment).map((env) => (
                <SelectItem value={env} key={env}>
                  {ENVIRONMENT_LABELS[env]}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};
