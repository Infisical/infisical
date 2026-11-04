import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import {
  usePortainerConnectionListEnvironments,
  usePortainerConnectionListStacks
} from "@app/hooks/api/appConnections/portainer";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const GIT_STACK_HELP_TEXT =
  "Variables are stored on the stack's Git configuration. The running containers are left untouched - the new values apply on the stack's next deployment.";

const FILE_STACK_HELP_TEXT =
  "Portainer requires the compose file on every update to a file-based stack, so syncing re-deploys it whenever the variables change. Use a Git-backed stack to update variables without a redeploy.";

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
            <FieldLabel
              id="secret-sync-portainer-environment-id-label"
              htmlFor="secret-sync-portainer-environment-id"
            >
              Environment
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-portainer-environment-id-label"
                aria-describedby={error ? "secret-sync-portainer-environment-id-error" : undefined}
                id="secret-sync-portainer-environment-id"
                isError={Boolean(error)}
                isLoading={isEnvironmentsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={environments.find((environment) => environment.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.id);
                  setValue("destinationConfig.stackId", undefined as unknown as number);
                }}
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => String(option.id)}
                modal
              />
              <FieldError id="secret-sync-portainer-environment-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.stackId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-portainer-stack-id-label"
              htmlFor="secret-sync-portainer-stack-id"
            >
              Stack
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-portainer-stack-id-label"
                aria-describedby={error ? "secret-sync-portainer-stack-id-error" : undefined}
                id="secret-sync-portainer-stack-id"
                isError={Boolean(error)}
                isLoading={isStacksLoading && Boolean(connectionId)}
                isDisabled={!environmentId}
                value={environmentStacks.find((stack) => stack.id === value) ?? null}
                onValueChange={(option) => onChange(option?.id)}
                options={environmentStacks}
                placeholder="Select a stack..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => String(option.id)}
                modal
              />
              {selectedStack && (
                <FieldDescription>
                  {selectedStack.isGitBased ? GIT_STACK_HELP_TEXT : FILE_STACK_HELP_TEXT}
                </FieldDescription>
              )}
              <FieldError id="secret-sync-portainer-stack-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
