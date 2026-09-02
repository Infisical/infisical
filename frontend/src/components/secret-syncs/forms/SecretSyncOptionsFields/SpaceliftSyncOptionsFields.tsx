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

export const SpaceliftSyncOptionsFields = () => {
  const { control, watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Spacelift }
  >();

  const writeOnly = watch("syncOptions.writeOnly");
  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");

  return (
    <>
      <Controller
        name="syncOptions.writeOnly"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <Field orientation="horizontal">
              <FieldContent>
                <Label htmlFor="spacelift-write-only">Mark as secret</Label>
                <FieldDescription>
                  Secret values are only made available to Runs and Tasks and are not accessible in
                  the web GUI or through the API.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="spacelift-write-only"
                variant="project"
                checked={value}
                onCheckedChange={onChange}
              />
            </Field>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      {writeOnly && !disableSecretDeletion && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Secret values cannot be read back</AlertTitle>
          <AlertDescription>
            Existing secret values in the Spacelift context cannot be read by Infisical. Any secret
            values not present in Infisical will be deleted during sync. Turn on &quot;Prevent
            secret deletion&quot; above to keep them.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
