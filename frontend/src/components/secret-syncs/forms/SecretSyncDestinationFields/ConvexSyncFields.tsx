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

  const {
    data: deployments = [],
    isPending: isDeploymentsLoading,
    error: deploymentsError
  } = useConvexConnectionListDeployments(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.deploymentName", "");
        }}
      />

      <Controller
        name="destinationConfig.deploymentName"
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
                  deployments.find((deployment) => deployment.name === value) ??
                  (value ? { name: value, deploymentType: "" } : null)
                }
                onValueChange={(option) => {
                  onChange(option?.name ?? "");
                }}
                options={deployments}
                placeholder="Select a deployment..."
                emptyMessage={
                  deploymentsError
                    ? "Unable to load Convex deployments. Check the connection's access token."
                    : undefined
                }
                getOptionLabel={(option) =>
                  option.deploymentType ? `${option.name} (${option.deploymentType})` : option.name
                }
                getOptionValue={(option) => option.name}
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
