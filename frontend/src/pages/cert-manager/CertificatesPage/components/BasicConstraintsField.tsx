import { Control, Controller, UseFormSetValue } from "react-hook-form";

import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  isCA: boolean;
  templateRequiresCA: boolean;
  maxPathLength?: number;
  isPathLengthRequired?: boolean;
  idPrefix?: string;
};

export const BasicConstraintsField = ({
  control,
  setValue,
  isCA,
  templateRequiresCA,
  maxPathLength,
  isPathLengthRequired = false,
  idPrefix = "basic-constraints"
}: Props) => (
  <div>
    <p className="text-sm font-medium text-foreground">Basic Constraints</p>
    <div className="mt-4 space-y-4">
      <Controller
        control={control}
        name="basicConstraints.isCA"
        render={({ field: { value, onChange } }) => (
          <div className="flex items-start gap-3">
            <Checkbox
              id={`${idPrefix}-isCA`}
              variant="project"
              isChecked={templateRequiresCA || value || false}
              isDisabled={templateRequiresCA}
              onCheckedChange={(checked) => {
                if (templateRequiresCA) return;
                onChange(checked);
                if (!checked) setValue("basicConstraints.pathLength", null);
              }}
            />
            <span className="text-sm text-foreground">
              Issue as Certificate Authority
              <span className="mt-1 block text-xs text-muted">
                This certificate will be issued with the CA:TRUE extension.
              </span>
            </span>
          </div>
        )}
      />

      {isCA && (
        <Controller
          control={control}
          name="basicConstraints.pathLength"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Path Length {isPathLengthRequired && <span className="text-danger">*</span>}
              </FieldLabel>
              <Input
                {...field}
                type="number"
                min={0}
                max={maxPathLength}
                isError={Boolean(error)}
                placeholder={
                  isPathLengthRequired
                    ? "Enter path length (required)"
                    : "Leave empty for no constraint"
                }
                value={field.value ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    field.onChange(null);
                    return;
                  }
                  const parsed = parseInt(raw, 10);
                  field.onChange(Number.isNaN(parsed) ? null : parsed);
                }}
              />
              <FieldDescription>
                {maxPathLength !== undefined
                  ? `Sets the pathLen for this CA certificate. Controls how many levels of sub-CAs can exist below. This CA supports 0 to ${maxPathLength}; 0 means it can only sign end-entity certificates.`
                  : "Sets the pathLen for this CA certificate. Controls how many levels of sub-CAs can exist below. Empty means unlimited; 0 means it can only sign end-entity certificates."}
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
    </div>
  </div>
);
