import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { useConvexConnectionListDeployments } from "@app/hooks/api/appConnections/convex";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ConvexSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Convex }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: deployments, isLoading: isDeploymentsLoading } = useConvexConnectionListDeployments(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.deploymentUrl", "");
          setValue("destinationConfig.deploymentName", "");
        }}
      />

      <Controller
        name="destinationConfig.deploymentUrl"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-convex-deployment-label"
              htmlFor="secret-sync-convex-deployment"
            >
              Deployment
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-convex-deployment-label"
                aria-describedby={error ? "secret-sync-convex-deployment-error" : undefined}
                id="secret-sync-convex-deployment"
                isError={Boolean(error)}
                isLoading={isDeploymentsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={
                  deployments?.find((deployment) => deployment.deploymentUrl === value) ?? null
                }
                onValueChange={(option) => {
                  onChange(option?.deploymentUrl ?? "");
                  setValue("destinationConfig.deploymentName", option?.name ?? "");
                }}
                options={deployments}
                placeholder="Select a deployment..."
                getOptionLabel={(option) =>
                  option.deploymentType ? `${option.name} (${option.deploymentType})` : option.name
                }
                getOptionValue={(option) => option.deploymentUrl}
                getOptionKeywords={(option) => [
                  option.name,
                  option.deploymentUrl,
                  option.deploymentType
                ]}
                modal
              />
              <FieldError id="secret-sync-convex-deployment-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
