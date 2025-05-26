import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

const MAX_SHARED_SECRET_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds
const MIN_SHARED_SECRET_LIFETIME_SECONDS = 5 * 60; // 5 minutes in seconds

// Helper function to convert duration to seconds
const durationToSeconds = (value: number, unit: "m" | "h" | "d"): number => {
  switch (unit) {
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 60 * 60 * 24;
    default:
      return 0;
  }
};

// Helper function to convert seconds to form lifetime value and unit
const getFormLifetimeFromSeconds = (
  totalSeconds: number | null | undefined
): { maxLifetimeValue: number; maxLifetimeUnit: "m" | "h" | "d" } => {
  const DEFAULT_LIFETIME_VALUE = 30;
  const DEFAULT_LIFETIME_UNIT = "d" as "m" | "h" | "d";

  if (totalSeconds == null || totalSeconds <= 0) {
    return {
      maxLifetimeValue: DEFAULT_LIFETIME_VALUE,
      maxLifetimeUnit: DEFAULT_LIFETIME_UNIT
    };
  }

  const secondsInDay = 24 * 60 * 60;
  const secondsInHour = 60 * 60;
  const secondsInMinute = 60;

  if (totalSeconds % secondsInDay === 0) {
    const value = totalSeconds / secondsInDay;
    if (value >= 1) return { maxLifetimeValue: value, maxLifetimeUnit: "d" };
  }

  if (totalSeconds % secondsInHour === 0) {
    const value = totalSeconds / secondsInHour;
    if (value >= 1) return { maxLifetimeValue: value, maxLifetimeUnit: "h" };
  }

  if (totalSeconds % secondsInMinute === 0) {
    const value = totalSeconds / secondsInMinute;
    if (value >= 1) return { maxLifetimeValue: value, maxLifetimeUnit: "m" };
  }

  return {
    maxLifetimeValue: DEFAULT_LIFETIME_VALUE,
    maxLifetimeUnit: DEFAULT_LIFETIME_UNIT
  };
};

const formSchema = z
  .object({
    maxLifetimeValue: z.number().min(1, "Value must be at least 1"),
    maxLifetimeUnit: z.enum(["m", "h", "d"], {
      invalid_type_error: "Please select a valid time unit"
    }),
    maxViewLimit: z.string()
  })
  .superRefine((data, ctx) => {
    const { maxLifetimeValue, maxLifetimeUnit } = data;

    const durationInSeconds = durationToSeconds(maxLifetimeValue, maxLifetimeUnit);

    // Check max limit
    if (durationInSeconds > MAX_SHARED_SECRET_LIFETIME_SECONDS) {
      let message = "Duration exceeds maximum allowed limit";

      if (maxLifetimeUnit === "m") {
        message = `Maximum allowed minutes is ${MAX_SHARED_SECRET_LIFETIME_SECONDS / 60} (30 days)`;
      } else if (maxLifetimeUnit === "h") {
        message = `Maximum allowed hours is ${MAX_SHARED_SECRET_LIFETIME_SECONDS / (60 * 60)} (30 days)`;
      } else if (maxLifetimeUnit === "d") {
        message = `Maximum allowed days is ${MAX_SHARED_SECRET_LIFETIME_SECONDS / (24 * 60 * 60)}`;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ["maxLifetimeValue"]
      });
    }

    // Check min limit
    if (durationInSeconds < MIN_SHARED_SECRET_LIFETIME_SECONDS) {
      const message = `Duration must be at least ${MIN_SHARED_SECRET_LIFETIME_SECONDS / 60} minutes`; // 5 minutes

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ["maxLifetimeValue"]
      });
    }
  });

type TForm = z.infer<typeof formSchema>;

const viewLimitOptions = [
  { label: "1", value: 1 },
  { label: "Unlimited", value: -1 }
];

export const OrgSecretShareLimitSection = () => {
  const { mutateAsync } = useUpdateOrg();
  const { currentOrg } = useOrganization();

  const getDefaultFormValues = () => {
    const initialLifetime = getFormLifetimeFromSeconds(currentOrg?.maxSharedSecretLifetime);
    return {
      maxLifetimeValue: initialLifetime.maxLifetimeValue,
      maxLifetimeUnit: initialLifetime.maxLifetimeUnit,
      maxViewLimit: currentOrg?.maxSharedSecretViewLimit?.toString() || "-1"
    };
  };

  const {
    control,
    formState: { isSubmitting, isDirty },
    handleSubmit,
    reset
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultFormValues()
  });

  useEffect(() => {
    if (currentOrg) {
      reset(getDefaultFormValues());
    }
  }, [currentOrg, reset]);

  const handleFormSubmit = async (formData: TForm) => {
    try {
      const maxSharedSecretLifetimeSeconds = durationToSeconds(
        formData.maxLifetimeValue,
        formData.maxLifetimeUnit
      );

      await mutateAsync({
        orgId: currentOrg.id,
        maxSharedSecretViewLimit:
          formData.maxViewLimit === "-1" ? null : Number(formData.maxViewLimit),
        maxSharedSecretLifetime: maxSharedSecretLifetimeSeconds
      });

      createNotification({
        text: "Successfully updated secret share limits",
        type: "success"
      });

      reset(formData);
    } catch {
      createNotification({
        text: "Failed to update secret share limits",
        type: "error"
      });
    }
  };

  // Units for the dropdown with readable labels
  const timeUnits = [
    { value: "m", label: "Minutes" },
    { value: "h", label: "Hours" },
    { value: "d", label: "Days" }
  ];

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-semibold">Secret Share Limits</p>
      </div>
      <p className="mb-4 mt-2 text-sm text-gray-400">
        These settings establish the maximum limits for all Shared Secret parameters within this
        organization. Shared secrets cannot be created with values exceeding these limits.
      </p>
      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
        {(isAllowed) => (
          <form onSubmit={handleSubmit(handleFormSubmit)} autoComplete="off">
            <div className="flex max-w-sm gap-4">
              <Controller
                control={control}
                name="maxLifetimeValue"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error)}
                    errorText={error?.message}
                    tooltipText="The max amount of time that can be set before the secret share link expires."
                    label="Max Lifetime"
                    className="w-full"
                  >
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      step={1}
                      value={field.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? "" : parseInt(val, 10));
                      }}
                      disabled={!isAllowed}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="maxLifetimeUnit"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="Time unit"
                  >
                    <Select
                      value={field.value}
                      className="pr-2"
                      onValueChange={field.onChange}
                      placeholder="Select time unit"
                      isDisabled={!isAllowed}
                    >
                      {timeUnits.map(({ value, label }) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                        >
                          <div className="ml-3 font-medium">{label}</div>
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </div>
            <div className="flex max-w-sm">
              <Controller
                control={control}
                name="maxViewLimit"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Max Views"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                      isDisabled={!isAllowed}
                    >
                      {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                        <SelectItem value={String(viewLimitValue || "")} key={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </div>
            <Button
              colorSchema="secondary"
              type="submit"
              isLoading={isSubmitting}
              disabled={!isDirty || !isAllowed}
              className="mt-4"
            >
              Save
            </Button>
          </form>
        )}
      </OrgPermissionCan>
    </div>
  );
};
