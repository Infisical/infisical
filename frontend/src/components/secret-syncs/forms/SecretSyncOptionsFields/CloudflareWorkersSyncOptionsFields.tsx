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
  Label,
  Switch
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CloudflareWorkersSyncOptionsFields = () => {
  const { control, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");
  const syncNonSecretBindings = watch("syncOptions.syncNonSecretBindings");

  return (
    <>
      <Controller
        name="syncOptions.syncNonSecretBindings"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <Field orientation="horizontal">
              <FieldContent>
                <Label htmlFor="sync-non-secret-bindings">Sync plaintext and JSON variables</Label>
                <FieldDescription>
                  When enabled, Infisical will also sync plaintext and JSON variable bindings in
                  addition to secret bindings.
                </FieldDescription>
              </FieldContent>
              <Switch
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
            With secret deletion enabled and non-secret binding sync turned on, any plaintext or
            JSON variables in Cloudflare Workers that are not present in Infisical will be removed
            during a sync. Toggle &quot;Disable secret deletion&quot; above to prevent this.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
