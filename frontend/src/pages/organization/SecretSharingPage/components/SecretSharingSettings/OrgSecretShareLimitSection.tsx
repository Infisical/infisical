import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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

  const timeUnits = [
    { value: "m", label: "Minutes" },
    { value: "h", label: "Hours" },
    { value: "d", label: "Days" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Secret Share Limits</CardTitle>
        <CardDescription>
          These settings establish the maximum limits for all Shared Secret parameters within this
          organization. Shared secrets cannot be created with values exceeding these limits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <form
              onSubmit={handleSubmit(handleFormSubmit)}
              autoComplete="off"
              className="flex flex-col gap-4"
            >
              <div className="flex max-w-sm gap-4">
                <Controller
                  control={control}
                  name="maxLifetimeValue"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="w-full">
                      <FieldLabel>
                        Max Lifetime
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="size-3 cursor-help text-muted" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            The max amount of time that can be set before the secret share link
                            expires.
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
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
                        isError={Boolean(error)}
                      />
                      {error && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="maxLifetimeUnit"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>Time unit</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!isAllowed}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select time unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeUnits.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {error && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
              </div>
              <div className="flex max-w-sm items-end gap-2">
                <Controller
                  control={control}
                  name="shouldLimitView"
                  render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                    <Field className="w-48">
                      <FieldLabel>Max Views</FieldLabel>
                      <Select
                        value={value.toString()}
                        onValueChange={(e) => onChange(e === "true")}
                        disabled={!isAllowed}
                        {...field}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                            <SelectItem
                              value={viewLimitValue.toString()}
                              key={viewLimitValue.toString()}
                            >
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {error && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
                {shouldLimitView && (
                  <Controller
                    control={control}
                    name="maxViewLimit"
                    render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                      <Field className="w-48">
                        <Input
                          value={value}
                          onChange={onChange}
                          {...field}
                          min={1}
                          max={1000}
                          type="number"
                          disabled={!isAllowed}
                          isError={Boolean(error)}
                        />
                        {error && <FieldError>{error.message}</FieldError>}
                      </Field>
                    )}
                  />
                )}
              </div>
              <div>
                <Button
                  variant={!isDirty || !isAllowed ? "outline" : "org"}
                  type="submit"
                  isPending={isSubmitting}
                  isDisabled={!isDirty || !isAllowed}
                >
                  Save
                </Button>
              </div>
            </form>
          )}
        </OrgPermissionCan>
      </CardContent>
    </Card>
  );
};
