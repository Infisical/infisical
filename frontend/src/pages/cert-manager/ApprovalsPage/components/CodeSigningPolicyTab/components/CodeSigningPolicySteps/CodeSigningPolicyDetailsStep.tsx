import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { Checkbox, FormControl, Input, Select, SelectItem } from "@app/components/v2";

import { CodeSigningApprovalMode, TCodeSigningPolicyForm } from "../CodeSigningPolicySchema";

const APPROVAL_MODE_LABELS: Record<CodeSigningApprovalMode, string> = {
  [CodeSigningApprovalMode.Manual]: "One time use",
  [CodeSigningApprovalMode.TimeWindow]: "Time Window",
  [CodeSigningApprovalMode.NSignings]: "N Signings"
};

export const CodeSigningPolicyDetailsStep = () => {
  const { control, watch } = useFormContext<TCodeSigningPolicyForm>();

  const approvalMode = watch("constraints.approvalMode");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full gap-4">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Policy Name"
              className="mb-0 flex-1"
              isRequired
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="Enter policy name" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="maxRequestTtl"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label={<TtlFormLabel label="Max. Request TTL" />}
              className="mb-0"
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="Maximum time a request can be pending (optional)"
            >
              <Input
                {...field}
                value={field.value || ""}
                placeholder="e.g., 7d"
                onChange={(e) => {
                  if (!e.target.value || e.target.value === "") {
                    field.onChange(null);
                    return;
                  }
                  field.onChange(e.target.value);
                }}
              />
            </FormControl>
          )}
        />
      </div>

      <Controller
        control={control}
        name="constraints.approvalMode"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isRequired
            label="Approval Mode"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="How approved requests are consumed"
          >
            <Select value={field.value} onValueChange={field.onChange} className="w-full">
              {Object.values(CodeSigningApprovalMode).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {APPROVAL_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      {approvalMode === CodeSigningApprovalMode.TimeWindow && (
        <Controller
          control={control}
          name="constraints.maxWindowDuration"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Max Window Duration"
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="Maximum signing window duration (e.g., 1h, 1d)"
            >
              <Input
                {...field}
                value={field.value || ""}
                placeholder="e.g., 1h"
                onChange={(e) => {
                  if (!e.target.value || e.target.value === "") {
                    field.onChange(undefined);
                    return;
                  }
                  field.onChange(e.target.value);
                }}
              />
            </FormControl>
          )}
        />
      )}

      {approvalMode === CodeSigningApprovalMode.NSignings && (
        <Controller
          control={control}
          name="constraints.maxSignings"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Max Signings"
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="Maximum number of signings per approved request"
            >
              <Input
                {...field}
                type="number"
                value={field.value ?? ""}
                placeholder="e.g., 10"
                onChange={(e) => {
                  if (!e.target.value || e.target.value === "") {
                    field.onChange(undefined);
                    return;
                  }
                  field.onChange(Number(e.target.value));
                }}
              />
            </FormControl>
          )}
        />
      )}

      <Controller
        control={control}
        name="bypassForMachineIdentities"
        render={({ field: { value, onChange } }) => (
          <div className="mt-2 items-center">
            <Checkbox
              id="csBypassForMachineIdentities"
              isChecked={value}
              onCheckedChange={onChange}
              checkIndicatorBg="text-primary"
            >
              <span className="text-sm text-mineshaft-200">
                Bypass approval for machine identities
              </span>
              <p className="text-xs text-mineshaft-400">
                When enabled, machine identities can sign without requiring approval
              </p>
            </Checkbox>
          </div>
        )}
      />
    </div>
  );
};
