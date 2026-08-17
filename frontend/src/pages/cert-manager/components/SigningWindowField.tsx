import { Control, Controller, FieldValues, Path } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { parseDurationMs } from "@app/helpers/datetime";

const DURATION_PRESETS = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "8h", label: "8 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

const DEFAULT_UNCAPPED_WINDOW = "1d";

const getSigningWindowOptions = (maxWindowDuration?: string | null) => {
  const maxMs = parseDurationMs(maxWindowDuration);
  if (maxMs === null || !maxWindowDuration) return DURATION_PRESETS;

  const withinPolicy = DURATION_PRESETS.filter((option) => {
    const optionMs = parseDurationMs(option.value);
    return optionMs !== null && optionMs <= maxMs;
  });

  if (withinPolicy.some((option) => parseDurationMs(option.value) === maxMs)) return withinPolicy;
  return [...withinPolicy, { value: maxWindowDuration, label: maxWindowDuration }];
};

export const getDefaultSigningWindow = (maxWindowDuration?: string | null) =>
  maxWindowDuration && parseDurationMs(maxWindowDuration) !== null
    ? maxWindowDuration
    : DEFAULT_UNCAPPED_WINDOW;

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  maxWindowDuration?: string | null;
};

export const SigningWindowField = <T extends FieldValues>({
  control,
  name,
  maxWindowDuration
}: Props<T>) => {
  const options = getSigningWindowOptions(maxWindowDuration);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field>
          <FieldLabel>How long the approval lasts</FieldLabel>
          <FieldContent>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {maxWindowDuration
                ? `Counts down from when the access is granted. Policy caps it at ${maxWindowDuration}.`
                : "Counts down from when the access is granted."}
            </FieldDescription>
          </FieldContent>
        </Field>
      )}
    />
  );
};
