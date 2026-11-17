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
import { COOLIFY_RESOURCE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { useCoolifyConnectionListResources } from "@app/hooks/api/appConnections/coolify";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CoolifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Coolify }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const {
    data: resources = [],
    isPending: isResourcesLoading,
    error: resourcesError
  } = useCoolifyConnectionListResources(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.resourceId", "");
          setValue("destinationConfig.resourceName", "");
        }}
      />
      <Controller
        name="destinationConfig.resourceId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-coolify-resource-label"
              htmlFor="secret-sync-coolify-resource"
            >
              Resource
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-coolify-resource-label"
                aria-describedby={error ? "secret-sync-coolify-resource-error" : undefined}
                id="secret-sync-coolify-resource"
                isError={Boolean(error)}
                isLoading={isResourcesLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={resources.find((resource) => resource.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.id ?? "");
                  setValue("destinationConfig.resourceName", option?.name ?? "");
                  if (option) setValue("destinationConfig.resourceType", option.type);
                }}
                options={resources}
                placeholder="Select a resource..."
                emptyMessage={
                  resourcesError
                    ? "Unable to load Coolify resources. Check the connection's instance URL and API token."
                    : undefined
                }
                getOptionLabel={(option) =>
                  `${option.name} (${COOLIFY_RESOURCE_TYPE_LABELS[option.type]})`
                }
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                getOptionGroup={(option) => `${option.projectName} / ${option.environmentName}`}
                modal
              />
              <FieldError id="secret-sync-coolify-resource-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
