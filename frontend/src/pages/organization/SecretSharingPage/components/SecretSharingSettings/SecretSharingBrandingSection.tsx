import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const formSchema = z.object({
  logoUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  faviconUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  primaryColor: z
    .string()
    .regex(hexColorRegex, "Must be a valid hex color (e.g., #FF5733)")
    .or(z.literal(""))
    .optional(),
  secondaryColor: z
    .string()
    .regex(hexColorRegex, "Must be a valid hex color (e.g., #FF5733)")
    .or(z.literal(""))
    .optional()
});

type TForm = z.infer<typeof formSchema>;

export const SecretSharingBrandingSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { mutateAsync, isPending } = useUpdateOrg();

  const isFeatureEnabled = subscription?.secretShareExternalBranding;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      logoUrl: currentOrg?.secretShareBrandConfig?.logoUrl || "",
      faviconUrl: currentOrg?.secretShareBrandConfig?.faviconUrl || "",
      primaryColor: currentOrg?.secretShareBrandConfig?.primaryColor || "",
      secondaryColor: currentOrg?.secretShareBrandConfig?.secondaryColor || ""
    }
  });

  useEffect(() => {
    if (currentOrg?.secretShareBrandConfig) {
      reset({
        logoUrl: currentOrg.secretShareBrandConfig.logoUrl || "",
        faviconUrl: currentOrg.secretShareBrandConfig.faviconUrl || "",
        primaryColor: currentOrg.secretShareBrandConfig.primaryColor || "",
        secondaryColor: currentOrg.secretShareBrandConfig.secondaryColor || ""
      });
    }
  }, [currentOrg?.secretShareBrandConfig, reset]);

  const handleFormSubmit = async (data: TForm) => {
    if (!currentOrg?.id) return;

    const hasAnyValue = data.logoUrl || data.faviconUrl || data.primaryColor || data.secondaryColor;

    await mutateAsync({
      orgId: currentOrg.id,
      secretShareBrandConfig: hasAnyValue
        ? {
            logoUrl: data.logoUrl || undefined,
            faviconUrl: data.faviconUrl || undefined,
            primaryColor: data.primaryColor || undefined,
            secondaryColor: data.secondaryColor || undefined
          }
        : null
    });

    reset(data);

    createNotification({
      text: "Successfully updated secret sharing branding",
      type: "success"
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xl font-medium">Custom Branding</p>
          {!isFeatureEnabled && (
            <Badge variant="info">
              <LockIcon />
              Enterprise
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-2 mb-4 text-sm text-gray-400">
        Customize the appearance of your shared secret pages with your own branding.
      </p>

      {!isFeatureEnabled ? (
        <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 text-center">
          <p className="text-sm text-mineshaft-300">
            Custom branding for secret sharing pages is available on Enterprise plans.
          </p>
        </div>
      ) : (
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <form onSubmit={handleSubmit(handleFormSubmit)} autoComplete="off">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Controller
                  control={control}
                  name="logoUrl"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Logo URL"
                      tooltipText="URL to your company logo (displayed on shared secret pages)"
                    >
                      <Input
                        {...field}
                        placeholder="https://example.com/logo.png"
                        isDisabled={!isAllowed}
                      />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="faviconUrl"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Favicon URL"
                      tooltipText="URL to your favicon (displayed in browser tab)"
                    >
                      <Input
                        {...field}
                        placeholder="https://example.com/favicon.ico"
                        isDisabled={!isAllowed}
                      />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="primaryColor"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Primary Color"
                      tooltipText="Background color for the page (hex format, e.g., #82cec0)"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          {...field}
                          placeholder="#82cec0"
                          isDisabled={!isAllowed}
                          className="flex-1"
                        />
                        {field.value && hexColorRegex.test(field.value) && (
                          <div
                            className="h-9 w-9 rounded border border-mineshaft-500"
                            style={{ backgroundColor: field.value }}
                          />
                        )}
                      </div>
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="secondaryColor"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Secondary Color"
                      tooltipText="Panel and component colors (hex format, e.g., #14211e)"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          {...field}
                          placeholder="#14211e"
                          isDisabled={!isAllowed}
                          className="flex-1"
                        />
                        {field.value && hexColorRegex.test(field.value) && (
                          <div
                            className="h-9 w-9 rounded border border-mineshaft-500"
                            style={{ backgroundColor: field.value }}
                          />
                        )}
                      </div>
                    </FormControl>
                  )}
                />
              </div>
              <Button
                colorSchema="secondary"
                type="submit"
                isLoading={isPending}
                isDisabled={!isDirty || !isAllowed}
                className="mt-4"
              >
                Save
              </Button>
            </form>
          )}
        </OrgPermissionCan>
      )}
    </div>
  );
};
