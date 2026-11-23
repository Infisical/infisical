import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { COOLIFY_RESOURCE_TYPE_LABELS, COOLIFY_SYNC_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import {
  CoolifyResourceType,
  useCoolifyConnectionListResources
} from "@app/hooks/api/appConnections/coolify";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CoolifySyncScope } from "@app/hooks/api/secretSyncs/types/coolify-sync";

import { TSecretSyncForm } from "../schemas";

const SCOPE_HELP_TEXT: Record<CoolifySyncScope, string> = {
  [CoolifySyncScope.Production]: "Secrets are written to the application's production variables.",
  [CoolifySyncScope.Preview]:
    "Secrets are written to the variables Coolify gives preview deployments of pull requests. Sync them from a non-production environment."
};

export const CoolifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Coolify }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const resourceType = useWatch({ name: "destinationConfig.resourceType", control });

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
          setValue("destinationConfig.scope", CoolifySyncScope.Production);
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
                  setValue("destinationConfig.scope", CoolifySyncScope.Production);
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
      {resourceType === CoolifyResourceType.Application && (
        <Controller
          name="destinationConfig.scope"
          control={control}
          defaultValue={CoolifySyncScope.Production}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Scope</FieldLabel>
              <FieldContent>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-full" isError={Boolean(error)}>
                    <SelectValue placeholder="Select a scope..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(CoolifySyncScope).map((coolifyScope) => (
                      <SelectItem value={coolifyScope} key={coolifyScope}>
                        {COOLIFY_SYNC_SCOPE_LABELS[coolifyScope]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {value && <FieldDescription>{SCOPE_HELP_TEXT[value]}</FieldDescription>}
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
