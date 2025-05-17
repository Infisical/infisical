import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
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
    try {
      const userTokenExpiration = formatDuration(formData.expirationValue, formData.expirationUnit);

      await updateUserTokenExpiration({
        userTokenExpiration,
        orgId: currentOrg.id
      });

      createNotification({
        text: "Successfully updated user token expiration",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed updating user token expiration",
        type: "error"
      });
    }
  };

  // Units for the dropdown with readable labels
  const timeUnits = [
    { value: "m", label: "Minutes" },
    { value: "h", label: "Hours" },
    { value: "d", label: "Days" },
    { value: "w", label: "Weeks" }
  ];

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-semibold">Session Length</p>
      </div>
      <p className="mb-4 mt-2 text-sm text-gray-400">
        Specify the duration of each login session for users in this organization.
      </p>
      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
        {(isAllowed) => (
          <form onSubmit={handleSubmit(handleUserTokenExpirationSubmit)} autoComplete="off">
            <div className="flex max-w-sm gap-4">
              <Controller
                control={control}
                name="expirationValue"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="Expiration value"
                    className="w-full"
                  >
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      step={1}
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                      disabled={!isAllowed}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="expirationUnit"
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
            <Button
              colorSchema="secondary"
              type="submit"
              isLoading={isSubmitting}
              disabled={!isDirty}
              className="mt-4"
              isDisabled={!isAllowed}
            >
              Save
            </Button>
          </form>
        )}
      </OrgPermissionCan>
    </div>
  );
};
