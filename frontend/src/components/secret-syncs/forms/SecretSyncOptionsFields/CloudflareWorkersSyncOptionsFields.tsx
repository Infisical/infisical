import { Controller, useFormContext } from "react-hook-form";
import { TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
import { CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareWorkersVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

import { TSecretSyncForm } from "../schemas";

export const CloudflareWorkersSyncOptionsFields = () => {
  const { control, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");
  const syncNonSecretBindings = watch("syncOptions.syncNonSecretBindings");
  const variableType = watch(
    "destinationConfig.variableType",
    CloudflareWorkersVariableType.Secret
  );

  return (
    <>
      <Controller
        name="destinationConfig.variableType"
        control={control}
        defaultValue={CloudflareWorkersVariableType.Secret}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="cloudflare-workers-variable-type">Variable type</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger
                  id="cloudflare-workers-variable-type"
                  className="w-full"
                  isError={Boolean(error)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.entries(CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS).map(([type, label]) => (
                    <SelectItem value={type} key={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Secrets are encrypted in Cloudflare, while text and JSON variables stay readable.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {variableType === CloudflareWorkersVariableType.Secret && (
        <>
          <Controller
            name="syncOptions.syncNonSecretBindings"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <Label htmlFor="sync-non-secret-bindings">
                      Sync plaintext and JSON variables
                    </Label>
                    <FieldDescription>
                      Keep existing plaintext and JSON variables as their type and update their
                      values, instead of converting them to secrets.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    id="sync-non-secret-bindings"
                    variant="project"
                    checked={value}
                    onCheckedChange={onChange}
                  />
                </Field>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          {syncNonSecretBindings && !disableSecretDeletion && (
            <Alert variant="warning" className="mb-4">
              <TriangleAlert />
              <AlertTitle>Plaintext and JSON variables may be deleted</AlertTitle>
              <AlertDescription>
                With &quot;Prevent secret deletion&quot; turned off and non-secret binding sync
                turned on, any plaintext or JSON variables in Cloudflare Workers that are not
                present in Infisical will be removed during a sync. Turn on &quot;Prevent secret
                deletion&quot; above to keep them.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </>
  );
};
