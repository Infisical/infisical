import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon, TrashIcon, UploadIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { Badge, UnstableButton } from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import {
  useDeleteBrandingAsset,
  useGetBrandingConfig,
  useUploadBrandingAsset
} from "@app/hooks/api/secretSharing";

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/webp"
];

const formSchema = z.object({
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

const validateFile = (file: File): string | null => {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`;
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return "Invalid file type. Please upload a PNG, JPEG, GIF, SVG, ICO, or WebP image.";
  }
  return null;
};

// Fetch image as base64 data URL using authenticated request
const fetchAssetAsDataUrl = async (
  assetType: "brand-logo" | "brand-favicon"
): Promise<string | null> => {
  try {
    const response = await apiRequest.get(`/api/v1/secret-sharing/shared/branding/${assetType}`, {
      responseType: "blob"
    });
    const blob = response.data as Blob;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

type AssetUploadCardProps = {
  assetType: "brand-logo" | "brand-favicon";
  title: string;
  description: string;
  hasAsset: boolean;
  isAllowed: boolean;
  isPending: boolean;
  onUpload: (assetType: "brand-logo" | "brand-favicon", file: File) => Promise<void>;
  onDelete: (assetType: "brand-logo" | "brand-favicon") => Promise<void>;
};

const AssetUploadCard = ({
  assetType,
  title,
  description,
  hasAsset,
  isAllowed,
  isPending,
  onUpload,
  onDelete
}: AssetUploadCardProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch existing asset on mount if it exists
  useEffect(() => {
    if (hasAsset) {
      setIsLoading(true);
      fetchAssetAsDataUrl(assetType)
        .then((dataUrl) => {
          setPreviewUrl(dataUrl);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setPreviewUrl(null);
    }
  }, [hasAsset, assetType]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // eslint-disable-next-line no-param-reassign
    event.target.value = "";

    if (file) {
      const error = validateFile(file);
      if (error) {
        createNotification({ text: error, type: "error" });
        return;
      }

      await onUpload(assetType, file);

      // Update preview with the uploaded file
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDelete = async () => {
    await onDelete(assetType);
    setPreviewUrl(null);
  };

  return (
    <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
      <p className="mb-1 text-sm font-medium">{title}</p>
      <p className="mb-2 text-xs text-mineshaft-400">{description}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_FILE_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
        disabled={!isAllowed || isPending}
      />
      <div className="flex gap-2">
        {isLoading ? (
          <div className="size-10 animate-pulse rounded border border-mineshaft-500 bg-mineshaft-600" />
        ) : (
          previewUrl && (
            <img
              src={previewUrl}
              alt={`${title} preview`}
              className="size-10 rounded border border-mineshaft-500 object-contain p-1"
            />
          )
        )}
        <UnstableButton
          variant="neutral"
          size="xs"
          onClick={() => inputRef.current?.click()}
          isDisabled={!isAllowed || isPending}
        >
          <UploadIcon />
          Upload {title}
        </UnstableButton>
        {previewUrl && (
          <UnstableButton
            variant="danger"
            size="xs"
            onClick={handleDelete}
            isDisabled={!isAllowed || isPending}
          >
            <TrashIcon />
            Delete
          </UnstableButton>
        )}
      </div>
    </div>
  );
};

export const SecretSharingBrandingSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { mutateAsync: updateOrg, isPending: isUpdatingOrg } = useUpdateOrg();
  const { mutateAsync: uploadAsset, isPending: isUploadingAsset } = useUploadBrandingAsset();
  const { mutateAsync: deleteAsset, isPending: isDeletingAsset } = useDeleteBrandingAsset();
  const { data: brandingConfig } = useGetBrandingConfig();

  const isFeatureEnabled = subscription?.secretShareExternalBranding;
  const isPending = isUpdatingOrg || isUploadingAsset || isDeletingAsset;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      primaryColor: currentOrg?.secretShareBrandConfig?.primaryColor || "",
      secondaryColor: currentOrg?.secretShareBrandConfig?.secondaryColor || ""
    }
  });

  const handleFormSubmit = async (data: TForm) => {
    if (!currentOrg?.id) return;

    await updateOrg({
      orgId: currentOrg.id,
      secretShareBrandConfig:
        data.primaryColor || data.secondaryColor
          ? {
              primaryColor: data.primaryColor || undefined,
              secondaryColor: data.secondaryColor || undefined
            }
          : null
    });

    reset(data);

    createNotification({
      text: "Successfully updated branding colors",
      type: "success"
    });
  };

  const handleFileUpload = async (assetType: "brand-logo" | "brand-favicon", file: File) => {
    await uploadAsset({ assetType, file });
    createNotification({
      text: `Successfully uploaded ${assetType}`,
      type: "success"
    });
  };

  const handleFileDelete = async (assetType: "brand-logo" | "brand-favicon") => {
    await deleteAsset({ assetType });
    createNotification({
      text: `Successfully deleted ${assetType}`,
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
        <div className="flex items-center justify-between gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
          <p className="text-sm text-mineshaft-300">
            Custom branding for secret sharing pages is available on Enterprise plans.
          </p>
          <UnstableButton
            size="xs"
            variant="default"
            as="a"
            href="https://infisical.com/schedule-demo"
            target="_blank"
          >
            Talk to Us
          </UnstableButton>
        </div>
      ) : (
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <AssetUploadCard
                  assetType="brand-logo"
                  title="Logo"
                  description="Displayed on shared secret pages (max 1MB)"
                  hasAsset={brandingConfig?.hasLogo ?? false}
                  isAllowed={isAllowed}
                  isPending={isPending}
                  onUpload={handleFileUpload}
                  onDelete={handleFileDelete}
                />
                <AssetUploadCard
                  assetType="brand-favicon"
                  title="Favicon"
                  description="Displayed in browser tab (max 1MB)"
                  hasAsset={brandingConfig?.hasFavicon ?? false}
                  isAllowed={isAllowed}
                  isPending={isPending}
                  onUpload={handleFileUpload}
                  onDelete={handleFileDelete}
                />
              </div>

              <form onSubmit={handleSubmit(handleFormSubmit)} autoComplete="off">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                            placeholder="#0e1014"
                            isDisabled={!isAllowed}
                            className="flex-1"
                          />
                          <div
                            className="size-9 shrink-0 rounded border border-mineshaft-500"
                            style={{
                              backgroundColor:
                                field.value && hexColorRegex.test(field.value)
                                  ? field.value
                                  : "#0e1014"
                            }}
                          />
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
                        tooltipText="Panel and component background color (hex format, e.g., #14211e)"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            {...field}
                            placeholder="#1e1f22"
                            isDisabled={!isAllowed}
                            className="flex-1"
                          />
                          <div
                            className="size-9 shrink-0 rounded border border-mineshaft-500"
                            style={{
                              backgroundColor:
                                field.value && hexColorRegex.test(field.value)
                                  ? field.value
                                  : "#1e1f22"
                            }}
                          />
                        </div>
                      </FormControl>
                    )}
                  />
                </div>
                <Button
                  colorSchema="secondary"
                  type="submit"
                  isLoading={isUpdatingOrg}
                  isDisabled={!isDirty || !isAllowed}
                  className="mt-4"
                >
                  Save Colors
                </Button>
              </form>
            </div>
          )}
        </OrgPermissionCan>
      )}
    </div>
  );
};
