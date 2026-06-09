import { type FocusEvent } from "react";
import { Control, Controller, UseFormTrigger } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TabsContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";

import { IdentityFormTab } from "../types";
import { LOCKOUT_DEFAULT_VALUES } from "./constants";

// Numeric lockout fields must never be left empty, otherwise the description label renders
// values like "m" instead of "5m". On blur, an empty field reverts to its default.
const handleRevertOnBlur =
  (field: { onChange: (value: string) => void; onBlur: () => void }, fallback: string) =>
  (e: FocusEvent<HTMLInputElement>) => {
    field.onBlur();
    if (e.target.value.trim() === "") {
      field.onChange(fallback);
    }
  };

export const LockoutTab = ({
  control,
  trigger,
  lockoutEnabled,
  lockoutThreshold,
  lockoutDurationValue,
  lockoutDurationUnit,
  lockoutCounterResetValue,
  lockoutCounterResetUnit
}: {
  control: Control<any>;
  trigger: UseFormTrigger<any>;
  lockoutEnabled: boolean;
  lockoutThreshold: string;
  lockoutDurationValue: string;
  lockoutDurationUnit: "s" | "m" | "h" | "d";
  lockoutCounterResetValue: string;
  lockoutCounterResetUnit: "s" | "m" | "h";
}) => {
  const scopeVariant = useScopeVariant();

  // Fall back to defaults so the description never collapses to "m"/"s"
  // while a value field is momentarily empty during editing.
  const thresholdLabel = lockoutThreshold || LOCKOUT_DEFAULT_VALUES.lockoutThreshold;
  const durationLabel = lockoutDurationValue || LOCKOUT_DEFAULT_VALUES.lockoutDurationValue;
  const counterResetLabel =
    lockoutCounterResetValue || LOCKOUT_DEFAULT_VALUES.lockoutCounterResetValue;

  return (
    <TabsContent value={IdentityFormTab.Lockout}>
      <FieldGroup>
        <Controller
          control={control}
          name="lockoutEnabled"
          render={({ field: { value, onChange }, fieldState: { error } }) => {
            return (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Lockout</FieldTitle>
                  <FieldDescription>
                    {`The lockout feature will prevent login attempts for ${durationLabel}${lockoutDurationUnit} after ${thresholdLabel} consecutive login failures. If ${counterResetLabel}${lockoutCounterResetUnit} pass after the most recent failure, the lockout counter resets.`}
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </FieldContent>
                <Switch
                  id="lockout-enabled"
                  variant={scopeVariant}
                  checked={value}
                  onCheckedChange={async (checked) => {
                    // Lockout values are always submitted, so block disabling while any are
                    // invalid; otherwise invalid values would silently reach the backend.
                    if (!checked) {
                      const isValid = await trigger([
                        "lockoutThreshold",
                        "lockoutDurationValue",
                        "lockoutCounterResetValue"
                      ]);
                      if (!isValid) return;
                    }
                    onChange(checked);
                  }}
                />
              </Field>
            );
          }}
        />
        <Controller
          control={control}
          name="lockoutThreshold"
          render={({ field, fieldState: { error } }) => {
            return (
              <Field className={lockoutEnabled ? "" : "opacity-70"}>
                <FieldLabel htmlFor="lockoutThreshold" className="inline-flex items-center gap-1.5">
                  Lockout Threshold
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      The amount of times login must fail before locking the identity auth method
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  {...field}
                  id="lockoutThreshold"
                  type="number"
                  placeholder="Threshold..."
                  disabled={!lockoutEnabled}
                  isError={Boolean(error)}
                  onBlur={handleRevertOnBlur(field, LOCKOUT_DEFAULT_VALUES.lockoutThreshold)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            );
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Controller
            control={control}
            name="lockoutDurationValue"
            render={({ field, fieldState: { error } }) => {
              return (
                <Field className={`flex-1 ${lockoutEnabled ? "" : "opacity-70"}`}>
                  <FieldLabel
                    htmlFor="lockoutDurationValue"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    Lockout Duration
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        How long an identity auth method lockout lasts
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="lockoutDurationValue"
                    type="number"
                    placeholder="Duration..."
                    disabled={!lockoutEnabled}
                    isError={Boolean(error)}
                    onBlur={handleRevertOnBlur(field, LOCKOUT_DEFAULT_VALUES.lockoutDurationValue)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              );
            }}
          />
          <Controller
            control={control}
            name="lockoutDurationUnit"
            render={({ field, fieldState: { error } }) => (
              <Field className={lockoutEnabled ? "" : "opacity-70"}>
                <FieldLabel htmlFor="lockoutDurationUnit" className="invisible">
                  Unit
                </FieldLabel>
                <Select
                  disabled={!lockoutEnabled}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="lockoutDurationUnit" isError={Boolean(error)}>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="s">Seconds</SelectItem>
                    <SelectItem value="m">Minutes</SelectItem>
                    <SelectItem value="h">Hours</SelectItem>
                    <SelectItem value="d">Days</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Controller
            control={control}
            name="lockoutCounterResetValue"
            render={({ field, fieldState: { error } }) => {
              return (
                <Field className={`flex-1 ${lockoutEnabled ? "" : "opacity-70"}`}>
                  <FieldLabel
                    htmlFor="lockoutCounterResetValue"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    Lockout Counter Reset
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        How long to wait from the most recent failed login until resetting the
                        lockout counter
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="lockoutCounterResetValue"
                    placeholder="Counter reset..."
                    type="number"
                    disabled={!lockoutEnabled}
                    isError={Boolean(error)}
                    onBlur={handleRevertOnBlur(
                      field,
                      LOCKOUT_DEFAULT_VALUES.lockoutCounterResetValue
                    )}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              );
            }}
          />
          <Controller
            control={control}
            name="lockoutCounterResetUnit"
            render={({ field, fieldState: { error } }) => (
              <Field className={lockoutEnabled ? "" : "opacity-70"}>
                <FieldLabel htmlFor="lockoutCounterResetUnit" className="invisible">
                  Unit
                </FieldLabel>
                <Select
                  disabled={!lockoutEnabled}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="lockoutCounterResetUnit"
                    className="min-w-32"
                    isError={Boolean(error)}
                  >
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="s">Seconds</SelectItem>
                    <SelectItem value="m">Minutes</SelectItem>
                    <SelectItem value="h">Hours</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        </div>
      </FieldGroup>
    </TabsContent>
  );
};
