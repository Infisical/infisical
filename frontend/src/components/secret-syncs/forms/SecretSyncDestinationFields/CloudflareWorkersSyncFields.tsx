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
  Label,
  Toggle
} from "@app/components/v3";
import {
  useCloudflareConnectionListWorkersPreviews,
  useCloudflareConnectionListWorkersScripts
} from "@app/hooks/api/appConnections/cloudflare";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CloudflareWorkersSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const scriptId = useWatch({ name: "destinationConfig.scriptId", control });
  const previewName = useWatch({ name: "destinationConfig.previewName", control });

  const [isPreview, setIsPreview] = useState(previewName !== undefined);

  const { data: scripts = [], isPending: isScriptsPending } =
    useCloudflareConnectionListWorkersScripts(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: previews = [], isPending: isPreviewsPending } =
    useCloudflareConnectionListWorkersPreviews(connectionId, scriptId, {
      enabled: isPreview && Boolean(connectionId && scriptId)
    });

  // A Preview belongs to one Worker, so picking another Worker clears it.
  const clearPreview = () => {
    if (isPreview) setValue("destinationConfig.previewName", "");
  };

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scriptId", "");
          clearPreview();
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
                  clearPreview();
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
              shouldDirty: true,
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
              <FieldLabel
                id="secret-sync-cloudflare-workers-preview-name-label"
                htmlFor="secret-sync-cloudflare-workers-preview-name"
              >
                Preview
              </FieldLabel>
              <FieldContent>
                <Combobox
                  aria-labelledby="secret-sync-cloudflare-workers-preview-name-label"
                  aria-describedby={
                    error ? "secret-sync-cloudflare-workers-preview-name-error" : undefined
                  }
                  id="secret-sync-cloudflare-workers-preview-name"
                  isError={Boolean(error)}
                  isLoading={isPreviewsPending && Boolean(connectionId && scriptId)}
                  isDisabled={!connectionId || !scriptId}
                  value={previews.find((preview) => preview.name === value) ?? null}
                  onValueChange={(option) => {
                    onChange(option?.name ?? "");
                  }}
                  options={previews}
                  placeholder="Select a Preview..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                  modal
                />
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
