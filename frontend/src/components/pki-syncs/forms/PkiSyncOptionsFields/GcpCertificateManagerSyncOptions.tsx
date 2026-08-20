import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  IconButton,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";
import { PreserveItemOnRenewalField } from "./PreserveItemOnRenewalField";

type TGcpForm = TPkiSyncForm & { destination: PkiSync.GcpCertificateManager };

const GcpLabelsEditor = () => {
  const { control } = useFormContext<TGcpForm>();
  const labelFields = useFieldArray({ control, name: "syncOptions.labels" });

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {labelFields.fields.map(({ id }, i) => (
          <div key={id} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-5">
              {i === 0 && <p className="mb-1 text-xs text-muted">Key</p>}
              <Controller
                control={control}
                name={`syncOptions.labels.${i}.key`}
                render={({ field, fieldState: { error } }) => (
                  <>
                    <Input {...field} isError={Boolean(error)} className="h-8" />
                    <FieldError errors={[error]} />
                  </>
                )}
              />
            </div>
            <div className="col-span-6">
              {i === 0 && <p className="mb-1 text-xs text-muted">Value (optional)</p>}
              <Controller
                control={control}
                name={`syncOptions.labels.${i}.value`}
                render={({ field, fieldState: { error } }) => (
                  <>
                    <Input {...field} isError={Boolean(error)} className="h-8" />
                    <FieldError errors={[error]} />
                  </>
                )}
              />
            </div>
            <div className="col-span-1 flex justify-end">
              <IconButton
                variant="ghost-muted"
                aria-label="Remove label"
                size="sm"
                onClick={() => labelFields.remove(i)}
              >
                <Trash2 />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="xs"
        type="button"
        className="w-fit"
        onClick={() => labelFields.append({ key: "", value: "" })}
      >
        <Plus />
        Add label
      </Button>
    </div>
  );
};

export const GcpCertificateManagerSyncOptions = () => {
  const { control, setValue } = useFormContext<TGcpForm>();
  const labels = useWatch({ control, name: "syncOptions.labels" });

  return (
    <>
      <PreserveItemOnRenewalField
        label="Preserve certificate on renewal"
        description="When enabled, an existing GCP certificate is updated in place and keeps its resource name, so certificate map entries and target proxies keep working with no change in GCP. This also pins the name against later edits to the certificate name schema. When disabled, a renewal or a name change creates a new GCP certificate and deletes the old one, which requires repointing anything that referenced it."
      />
      <Field className="mb-4">
        <Field orientation="horizontal">
          <FieldContent>
            <Label htmlFor="gcp-configure-labels">Configure labels</Label>
            <FieldDescription>
              Labels applied to every certificate this sync manages, alongside the
              <span className="font-mono"> managed-by </span>
              and
              <span className="font-mono"> infisical-certificate-id </span>
              labels Infisical sets.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="gcp-configure-labels"
            variant="project"
            checked={Array.isArray(labels)}
            onCheckedChange={(isChecked) =>
              setValue("syncOptions.labels", isChecked ? [{ key: "", value: "" }] : undefined, {
                shouldDirty: true
              })
            }
          />
        </Field>
        {Array.isArray(labels) && <GcpLabelsEditor />}
      </Field>
    </>
  );
};
