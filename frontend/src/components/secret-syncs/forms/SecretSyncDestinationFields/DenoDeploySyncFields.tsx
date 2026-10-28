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
import { useDenoDeployConnectionListApps } from "@app/hooks/api/appConnections/deno-deploy";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  DENO_DEPLOY_SYNC_CONTEXT_OPTIONS,
  DenoDeploySyncContext
} from "@app/hooks/api/secretSyncs/types/deno-deploy-sync";

import { TSecretSyncForm } from "../schemas";

export const DenoDeploySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.DenoDeploy }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps, isLoading: isAppsLoading } = useDenoDeployConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
          setValue("destinationConfig.appSlug", "");
        }}
      />

      <Controller
        name="destinationConfig.appId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-deno-deploy-app-id-label"
              htmlFor="secret-sync-deno-deploy-app-id"
            >
              App
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-deno-deploy-app-id-label"
                aria-describedby={error ? "secret-sync-deno-deploy-app-id-error" : undefined}
                id="secret-sync-deno-deploy-app-id"
                isError={Boolean(error)}
                isLoading={isAppsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={apps?.find((app) => app.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.id ?? null);
                  setValue("destinationConfig.appSlug", option?.slug ?? "");
                }}
                options={apps}
                placeholder="Select an app..."
                getOptionLabel={(option) => option.slug}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id, option.slug]}
                modal
              />
              <FieldError id="secret-sync-deno-deploy-app-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.context"
        control={control}
        defaultValue={DenoDeploySyncContext.Production}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="secret-sync-deno-deploy-context">Context</FieldLabel>
            <FieldContent>
              <Select value={value || DenoDeploySyncContext.Production} onValueChange={onChange}>
                <SelectTrigger
                  id="secret-sync-deno-deploy-context"
                  className="w-full"
                  isError={Boolean(error)}
                >
                  <SelectValue placeholder="Select a context..." />
                </SelectTrigger>
                <SelectContent>
                  {DENO_DEPLOY_SYNC_CONTEXT_OPTIONS.map((option) => (
                    <SelectItem value={option.value} key={option.value}>
                      {option.label}
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
