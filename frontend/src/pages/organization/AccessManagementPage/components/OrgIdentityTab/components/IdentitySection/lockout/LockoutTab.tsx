import { Control, Controller } from "react-hook-form";

import { FormControl, Input, Select, SelectItem, Switch, TabPanel } from "@app/components/v2";

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
  return (
    <TabPanel value={IdentityFormTab.Lockout}>
      <div className="mb-3 flex flex-col">
        <Controller
          control={control}
          name="lockoutEnabled"
          render={({ field: { value, onChange }, fieldState: { error } }) => {
            return (
              <FormControl
                helperText={`The lockout feature will prevent login attempts for ${lockoutDurationValue}${lockoutDurationUnit} after ${lockoutThreshold} consecutive login failures. If ${lockoutCounterResetValue}${lockoutCounterResetUnit} pass after the most recent failure, the lockout counter resets.`}
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Switch
                  className="ml-0 mr-3 bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                  containerClassName="flex-row-reverse w-fit"
                  id="lockout-enabled"
                  thumbClassName="bg-mineshaft-800"
                  onCheckedChange={onChange}
                  isChecked={value}
                >
                  Lockout {value ? "Enabled" : "Disabled"}
                </Switch>
              </FormControl>
            );
          }}
        />
        <div className="flex flex-col gap-2">
          <Controller
            control={control}
            name="lockoutThreshold"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl
                  className={`mb-0 flex-grow ${lockoutEnabled ? "" : "opacity-70"}`}
                  label="Lockout Threshold"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="The amount of times login must fail before locking the identity auth method"
                >
                  <Input
                    {...field}
                    placeholder="Enter lockout threshold..."
                    isDisabled={!lockoutEnabled}
                  />
                </FormControl>
              );
            }}
          />
          <div className="flex items-end gap-2">
            <Controller
              control={control}
              name="lockoutDurationValue"
              render={({ field, fieldState: { error } }) => {
                return (
                  <FormControl
                    className={`mb-0 flex-grow ${lockoutEnabled ? "" : "opacity-70"}`}
                    label="Lockout Duration"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    tooltipText="How long an identity auth method lockout lasts"
                  >
                    <Input
                      {...field}
                      placeholder="Enter lockout duration..."
                      isDisabled={!lockoutEnabled}
                    />
                  </FormControl>
                );
              }}
            />
            <Controller
              control={control}
              name="lockoutDurationUnit"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className={`mb-0 ${lockoutEnabled ? "" : "opacity-70"}`}
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Select
                    isDisabled={!lockoutEnabled}
                    value={field.value}
                    className="min-w-32 pr-2"
                    onValueChange={field.onChange}
                    position="popper"
                  >
                    <SelectItem
                      value="s"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Seconds</div>
                    </SelectItem>
                    <SelectItem
                      value="m"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Minutes</div>
                    </SelectItem>
                    <SelectItem
                      value="h"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Hours</div>
                    </SelectItem>
                    <SelectItem
                      value="d"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Days</div>
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>
          <div className="flex items-end gap-2">
            <Controller
              control={control}
              name="lockoutCounterResetValue"
              render={({ field, fieldState: { error } }) => {
                return (
                  <FormControl
                    className={`mb-0 flex-grow ${lockoutEnabled ? "" : "opacity-70"}`}
                    label="Lockout Counter Reset"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    tooltipText="How long to wait from the most recent failed login until resetting the lockout counter"
                  >
                    <Input
                      {...field}
                      placeholder="Enter lockout counter reset..."
                      isDisabled={!lockoutEnabled}
                    />
                  </FormControl>
                );
              }}
            />
            <Controller
              control={control}
              name="lockoutCounterResetUnit"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className={`mb-0 ${lockoutEnabled ? "" : "opacity-70"}`}
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Select
                    isDisabled={!lockoutEnabled}
                    value={field.value}
                    className="min-w-32 pr-2"
                    onValueChange={field.onChange}
                    position="popper"
                  >
                    <SelectItem
                      value="s"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Seconds</div>
                    </SelectItem>
                    <SelectItem
                      value="m"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Minutes</div>
                    </SelectItem>
                    <SelectItem
                      value="h"
                      className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                    >
                      <div className="ml-3 font-medium">Hours</div>
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>
        </div>
      </div>
    </TabPanel>
  );
};
