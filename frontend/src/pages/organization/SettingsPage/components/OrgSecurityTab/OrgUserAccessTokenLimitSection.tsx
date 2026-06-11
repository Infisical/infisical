import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock } from "lucide-react";
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
  SelectValue
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

const formSchema = z.object({
  expirationValue: z.number().min(1, "Value must be at least 1"),
  expirationUnit: z.enum(["m", "h", "d", "w"], {
    invalid_type_error: "Please select a valid time unit"
  })
});

type TForm = z.infer<typeof formSchema>;

// Function to parse duration string like "30d" into value and unit
const parseDuration = (duration: string): { value: number; unit: string } => {
  const match = duration.match(/^(\d+)([mhdw])$/);
  if (match) {
    return {
      value: parseInt(match[1], 10),
      unit: match[2]
    };
  }
  // Default to 30 days if invalid format
  return { value: 30, unit: "d" };
};

// Function to format value and unit back to duration string
const formatDuration = (value: number, unit: string): string => {
  return `${value}${unit}`;
};

export const OrgUserAccessTokenLimitSection = () => {
  const { mutateAsync: updateUserTokenExpiration } = useUpdateOrg();
  const { currentOrg } = useOrganization();

  // Parse the current duration or use default
  const currentDuration = parseDuration(currentOrg?.userTokenExpiration || "30d");

  const {
    control,
    formState: { isSubmitting, isDirty },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      expirationValue: currentDuration.value,
      expirationUnit: currentDuration.unit as "m" | "h" | "d" | "w"
    }
  });

  if (!currentOrg) return null;

  const handleUserTokenExpirationSubmit = async (formData: TForm) => {
    const userTokenExpiration = formatDuration(formData.expirationValue, formData.expirationUnit);

    await updateUserTokenExpiration({
      userTokenExpiration,
      orgId: currentOrg.id
    });

    createNotification({
      text: "Successfully updated user token expiration",
      type: "success"
    });
  };

  // Units for the dropdown with readable labels
  const timeUnits = [
    { value: "m", label: "Minutes" },
    { value: "h", label: "Hours" },
    { value: "d", label: "Days" },
    { value: "w", label: "Weeks" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Clock className="size-4 text-accent" />
          Session Length
        </CardTitle>
        <CardDescription>
          Specify the duration of each login session for users in this organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <form onSubmit={handleSubmit(handleUserTokenExpirationSubmit)} autoComplete="off">
              <div className="flex max-w-sm gap-4">
                <Controller
                  control={control}
                  name="expirationValue"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="flex-1">
                      <FieldLabel htmlFor="expiration-value">Expiration Value</FieldLabel>
                      <Input
                        {...field}
                        id="expiration-value"
                        type="number"
                        min={1}
                        step={1}
                        value={field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        isError={Boolean(error)}
                        disabled={!isAllowed}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="expirationUnit"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="flex-1">
                      <FieldLabel htmlFor="expiration-unit">Time Unit</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!isAllowed}
                      >
                        <SelectTrigger
                          id="expiration-unit"
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select time unit" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {timeUnits.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </div>
              <Button
                variant="org"
                type="submit"
                isPending={isSubmitting}
                isDisabled={!isAllowed || !isDirty}
                className="mt-4"
              >
                Save
              </Button>
            </form>
          )}
        </OrgPermissionCan>
      </CardContent>
    </Card>
  );
};
