import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  Toggle
} from "@app/components/v3";

import { TDiscoveryJobForm } from "./discovery-job-form-schema";

export const SCAN_INTERVAL_OPTIONS = [
  { value: 1, label: "Daily" },
  { value: 7, label: "Weekly" },
  { value: 14, label: "Every 2 weeks" },
  { value: 30, label: "Monthly" }
];

export const DiscoveryDetailsFields = () => {
  const { control, watch } = useFormContext<TDiscoveryJobForm>();
  const isAutoScanEnabled = watch("isAutoScanEnabled");

  return (
    <>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={value ?? ""}
              onChange={onChange}
              placeholder="my-discovery-job"
              isError={Boolean(error)}
              autoComplete="off"
              name="discovery-job-name"
            />
            {!error?.message && (
              <FieldDescription>Lowercase letters, numbers and hyphens</FieldDescription>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Description <span className="text-muted">(optional)</span>
            </FieldLabel>
            <TextArea
              value={value ?? ""}
              onChange={onChange}
              placeholder="Describe what this job looks for..."
              className="resize-none"
              rows={3}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="isAutoScanEnabled"
        render={({ field: { value, onChange } }) => (
          <Field orientation="horizontal" className="mb-4">
            <FieldContent>
              <Label htmlFor="auto-scan-enabled">Scan on a Schedule</Label>
              <FieldDescription>Turn off to only scan when you start it.</FieldDescription>
            </FieldContent>
            <Toggle
              id="auto-scan-enabled"
              variant="project"
              checked={value}
              onCheckedChange={onChange}
            />
          </Field>
        )}
      />
      {isAutoScanEnabled && (
        <Controller
          control={control}
          name="scanIntervalDays"
          render={({ field: { value, onChange } }) => (
            <Field className="mb-4">
              <FieldLabel>Scan Interval</FieldLabel>
              <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {SCAN_INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      )}
    </>
  );
};
