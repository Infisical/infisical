import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useCloudflareConnectionListWorkersScripts } from "@app/hooks/api/appConnections/cloudflare";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareWorkersSyncTarget } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

import { TSecretSyncForm } from "../schemas";

const cloudflareWorkersTargetLabels: Record<CloudflareWorkersSyncTarget, string> = {
  [CloudflareWorkersSyncTarget.Script]: "Worker Script",
  [CloudflareWorkersSyncTarget.PreviewsBase]: "Previews Base Config",
  [CloudflareWorkersSyncTarget.Preview]: "Specific Preview"
};
export const CloudflareWorkersSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const target = useWatch({ name: "destinationConfig.target", control });

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
      <Controller
        name="destinationConfig.target"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="secret-sync-cloudflare-workers-target">Sync Target</FieldLabel>
            <FieldContent>
              <Select
                value={value ?? CloudflareWorkersSyncTarget.Script}
                onValueChange={(newTarget) => {
                  onChange(newTarget);
                  setValue("destinationConfig.previewName", "");
                }}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a sync target..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(CloudflareWorkersSyncTarget).map((t) => (
                    <SelectItem value={t} key={t}>
                      {cloudflareWorkersTargetLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {target === CloudflareWorkersSyncTarget.Preview && (
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
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="my-branch-name"
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
