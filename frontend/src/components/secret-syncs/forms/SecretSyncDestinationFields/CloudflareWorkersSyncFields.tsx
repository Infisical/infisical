import { useState } from "react";
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
  Input,
  Label,
  Toggle
} from "@app/components/v3";
import { useCloudflareConnectionListWorkersScripts } from "@app/hooks/api/appConnections/cloudflare";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CloudflareWorkersSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const previewName = useWatch({ name: "destinationConfig.previewName", control });

  const [isPreview, setIsPreview] = useState(previewName !== undefined);

  const { data: scripts = [], isPending: isScriptsPending } =
    useCloudflareConnectionListWorkersScripts(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scriptId", "");
        }}
      />
      <Controller
        name="destinationConfig.scriptId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-cloudflare-workers-script-id-label"
              htmlFor="secret-sync-cloudflare-workers-script-id"
            >
              Worker Script
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-cloudflare-workers-script-id-label"
                aria-describedby={
                  error ? "secret-sync-cloudflare-workers-script-id-error" : undefined
                }
                id="secret-sync-cloudflare-workers-script-id"
                isError={Boolean(error)}
                isLoading={isScriptsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={scripts?.find((script) => script.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.id ?? null);
                }}
                options={scripts}
                placeholder="Select a worker script..."
                getOptionLabel={(option) => option.id}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldError id="secret-sync-cloudflare-workers-script-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Field orientation="horizontal">
        <FieldContent>
          <Label htmlFor="secret-sync-cloudflare-workers-preview">Sync to a Preview</Label>
          <FieldDescription>
            Sync to one of this Worker&apos;s Previews instead of production.
          </FieldDescription>
        </FieldContent>
        <Toggle
          id="secret-sync-cloudflare-workers-preview"
          variant="project"
          checked={isPreview}
          onCheckedChange={(checked) => {
            setIsPreview(checked);
            // An empty name fails validation, so a Preview sync can't be saved without one.
            setValue("destinationConfig.previewName", checked ? "" : undefined, {
              shouldValidate: !checked
            });
          }}
        />
      </Field>
      {isPreview && (
        <Controller
          name="destinationConfig.previewName"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="secret-sync-cloudflare-workers-preview-name">
                Preview Name
              </FieldLabel>
              <FieldContent>
                <Input
                  id="secret-sync-cloudflare-workers-preview-name"
                  aria-describedby={
                    error
                      ? "secret-sync-cloudflare-workers-preview-name-description secret-sync-cloudflare-workers-preview-name-error"
                      : "secret-sync-cloudflare-workers-preview-name-description"
                  }
                  value={value ?? ""}
                  onChange={onChange}
                  placeholder="staging"
                  isError={Boolean(error)}
                />
                <FieldDescription id="secret-sync-cloudflare-workers-preview-name-description">
                  The name of an existing Preview, usually its branch name.
                </FieldDescription>
                <FieldError
                  id="secret-sync-cloudflare-workers-preview-name-error"
                  errors={[error]}
                />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
