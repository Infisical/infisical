import { Controller, useFormContext } from "react-hook-form";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { TAlertForm } from "@app/hooks/api/alerts";
import { SecretScanningScanTrigger } from "@app/hooks/api/secretScanningV2/enums";

const SCAN_TRIGGER_OPTIONS: { id: SecretScanningScanTrigger; name: string }[] = [
  { id: SecretScanningScanTrigger.Push, name: "Push" },
  { id: SecretScanningScanTrigger.PullRequest, name: "Pull request" },
  { id: SecretScanningScanTrigger.Manual, name: "Manual scan" },
  { id: SecretScanningScanTrigger.ResourcesAdded, name: "New resource" }
];

export const ScanTriggerFilterField = () => {
  const {
    control,
    formState: { errors }
  } = useFormContext<TAlertForm>();

  return (
    <Controller
      control={control}
      name="scanTriggers"
      render={({ field: { value, onChange } }) => (
        <Field>
          <FieldLabel>
            Scans <span className="text-muted">(optional)</span>
          </FieldLabel>
          <FieldContent>
            <Combobox
              multiple
              isClearable
              options={SCAN_TRIGGER_OPTIONS}
              value={SCAN_TRIGGER_OPTIONS.filter((option) => value.includes(option.id))}
              onValueChange={(selected) => onChange(selected.map(({ id }) => id))}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              placeholder="All scans"
            />
            <FieldDescription>
              Leave empty to alert on every kind of scan. To stop alerts from pull requests, select
              every kind except Pull request.
            </FieldDescription>
            <FieldError errors={[errors.scanTriggers]} />
          </FieldContent>
        </Field>
      )}
    />
  );
};
