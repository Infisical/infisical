import { Control, Controller } from "react-hook-form";
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

export const LockoutTab = ({
  control,
  lockoutEnabled,
  lockoutThreshold,
  lockoutDurationValue,
  lockoutDurationUnit,
  lockoutCounterResetValue,
  lockoutCounterResetUnit
}: {
  control: Control<any>;
  lockoutEnabled: boolean;
  lockoutThreshold: string;
  lockoutDurationValue: string;
  lockoutDurationUnit: "s" | "m" | "h" | "d";
  lockoutCounterResetValue: string;
  lockoutCounterResetUnit: "s" | "m" | "h";
}) => {
  const scopeVariant = useScopeVariant();

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
                    {`The lockout feature will prevent login attempts for ${lockoutDurationValue}${lockoutDurationUnit} after ${lockoutThreshold} consecutive login failures. If ${lockoutCounterResetValue}${lockoutCounterResetUnit} pass after the most recent failure, the lockout counter resets.`}
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </FieldContent>
                <Switch
                  id="lockout-enabled"
                  variant={scopeVariant}
                  checked={value}
                  onCheckedChange={onChange}
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
