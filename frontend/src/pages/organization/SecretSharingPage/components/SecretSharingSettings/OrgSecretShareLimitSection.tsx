import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import { useUpdateOrg } from "@app/hooks/api";

const MAX_SHARED_SECRET_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds
const MIN_SHARED_SECRET_LIFETIME_SECONDS = 5 * 60; // 5 minutes in seconds

const formSchema = z
  .object({
    maxLifetimeValue: z.number().min(1, "Value must be at least 1"),
    maxLifetimeUnit: z.enum(["m", "h", "d"], {
      invalid_type_error: "Please select a valid time unit"
    }),
    maxViewLimit: z.string(),
    shouldLimitView: z.boolean()
  })
  .superRefine((data, ctx) => {
    const { maxLifetimeValue, maxLifetimeUnit } = data;

    const durationInSeconds = ms(`${maxLifetimeValue}${maxLifetimeUnit}`) / 1000;

    if (durationInSeconds > MAX_SHARED_SECRET_LIFETIME_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration exceeds a maximum of 30 days",
        path: ["maxLifetimeValue"]
      });
    }

    if (durationInSeconds < MIN_SHARED_SECRET_LIFETIME_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration must be at least 5 minutes",
        path: ["maxLifetimeValue"]
      });
    }
  });

type TForm = z.infer<typeof formSchema>;

const viewLimitOptions = [
  { label: "Unlimited", value: false },
  { label: "Limited", value: true }
];

export const OrgSecretShareLimitSection = () => {
  const { mutateAsync } = useUpdateOrg();
  const { currentOrg } = useOrganization();

  const getDefaultFormValues = () => {
    const initialLifetime = getObjectFromSeconds(currentOrg?.maxSharedSecretLifetime, [
      "m",
      "h",
      "d"
    ]);
    return {
      maxLifetimeValue: initialLifetime.value,
      maxLifetimeUnit: initialLifetime.unit as "m" | "h" | "d",
      maxViewLimit: currentOrg?.maxSharedSecretViewLimit?.toString() || "1",
      shouldLimitView: Boolean(currentOrg?.maxSharedSecretViewLimit)
    };
  };

  const {
    control,
    formState: { isSubmitting, isDirty },
    watch,
    handleSubmit,
    reset
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultFormValues()
  });

  const shouldLimitView = watch("shouldLimitView");

  useEffect(() => {
    if (currentOrg) {
      reset(getDefaultFormValues());
    }
  }, [currentOrg, reset]);

  const handleFormSubmit = async (formData: TForm) => {
    const maxSharedSecretLifetimeSeconds =
      ms(`${formData.maxLifetimeValue}${formData.maxLifetimeUnit}`) / 1000;

    await mutateAsync({
      orgId: currentOrg.id,
      maxSharedSecretViewLimit: formData.shouldLimitView ? Number(formData.maxViewLimit) : null,
      maxSharedSecretLifetime: maxSharedSecretLifetimeSeconds
    });

    createNotification({
      text: "Successfully updated secret share limits",
      type: "success"
    });

    reset(formData);
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
        <p className="text-xl font-medium">Secret Share Limits</p>
      </div>
      <p className="mt-2 mb-4 text-sm text-gray-400">
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
                          className="relative py-2 pr-8 pl-6 text-sm hover:bg-mineshaft-700"
                        >
                          <div className="ml-3 font-medium">{label}</div>
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </div>
            <div className="flex max-w-sm items-end gap-2">
              <Controller
                control={control}
                name="shouldLimitView"
                render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Max Views"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    className="w-48"
                  >
                    <Select
                      defaultValue={value.toString()}
                      value={value.toString()}
                      onValueChange={(e) => onChange(e === "true")}
                      className="w-full"
                      position="popper"
                      dropdownContainerClassName="max-w-none"
                      isDisabled={!isAllowed}
                      {...field}
                    >
                      {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                        <SelectItem
                          value={viewLimitValue.toString()}
                          key={viewLimitValue.toString()}
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
              {shouldLimitView && (
                <Controller
                  control={control}
                  name="maxViewLimit"
                  render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-48"
                    >
                      <Input
                        value={value}
                        onChange={onChange}
                        {...field}
                        min={1}
                        max={1000}
                        type="number"
                        isDisabled={!isAllowed}
                      />
                    </FormControl>
                  )}
                />
              )}
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
