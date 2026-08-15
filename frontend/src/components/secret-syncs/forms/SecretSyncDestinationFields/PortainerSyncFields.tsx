import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  TPortainerEnvironment,
  TPortainerStack,
  usePortainerConnectionListEnvironments,
  usePortainerConnectionListStacks
} from "@app/hooks/api/appConnections/portainer";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const GIT_STACK_HELP_TEXT =
  "Variables are stored on the stack's Git configuration. The running containers are left untouched - the new values apply on the stack's next deployment.";

const FILE_STACK_HELP_TEXT =
  "Portainer requires the compose file on every update to a file-based stack, so syncing re-deploys it. Use a Git-backed stack to update variables without a redeploy.";

export const PortainerSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Portainer }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const environmentId = useWatch({ name: "destinationConfig.environmentId", control });
  const stackId = useWatch({ name: "destinationConfig.stackId", control });

  const { data: environments = [], isPending: isEnvironmentsLoading } =
    usePortainerConnectionListEnvironments(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: stacks = [], isPending: isStacksLoading } = usePortainerConnectionListStacks(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const environmentStacks = stacks.filter((stack) => stack.environmentId === environmentId);
  const selectedStack = stacks.find((stack) => stack.id === stackId);

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.environmentId", undefined as unknown as number);
          setValue("destinationConfig.stackId", undefined as unknown as number);
        }}
      />
      <Controller
        name="destinationConfig.environmentId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isEnvironmentsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={environments.find((environment) => environment.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TPortainerEnvironment>;
                  onChange(selected?.id);
                  setValue("destinationConfig.stackId", undefined as unknown as number);
                }}
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => String(option.id)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
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
                isDisabled={!environmentId}
                value={environmentStacks.find((stack) => stack.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TPortainerStack>;
                  onChange(selected?.id);
                }}
                options={environmentStacks}
                placeholder="Select a stack..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => String(option.id)}
              />
              {selectedStack && (
                <FieldDescription>
                  {selectedStack.isGitBased ? GIT_STACK_HELP_TEXT : FILE_STACK_HELP_TEXT}
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
