import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, LockIcon, Trash2, UploadIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ColorPicker,
  Field,
  FieldError,
  FieldLabel,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg"];
const ACCEPTED_FORMATS_LABEL = "PNG or JPEG";

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
    return `Invalid file type. Please upload a ${ACCEPTED_FORMATS_LABEL} image.`;
  }
  return null;
};

// Fetch image as base64 data URL using authenticated request
const fetchAssetAsDataUrl = async (
  assetType: "brand-logo" | "brand-favicon"
): Promise<string | null> => {
  try {
    const response = await apiRequest.get(`/api/v1/shared-secrets/branding/${assetType}`, {
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
    setIsDeleteDialogOpen(false);
  };

  return (
    <div className="flex h-28 justify-between gap-2 rounded-md border border-border bg-container p-3">
      <div className="flex min-h-0 flex-col justify-center">
        <p className="mb-1 text-sm font-medium">{title}</p>
        <p className="mb-2 text-xs text-muted">{description}</p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_FILE_TYPES.join(",")}
          onChange={handleFileChange}
          className="hidden"
          disabled={!isAllowed || isPending}
        />
        <div className="flex gap-2">
          <Button
            variant="neutral"
            size="xs"
            onClick={() => inputRef.current?.click()}
            isDisabled={!isAllowed || isPending}
          >
            <UploadIcon />
            Upload {title}
          </Button>
          {previewUrl && (
            <Button
              variant="danger"
              size="xs"
              onClick={() => setIsDeleteDialogOpen(true)}
              isDisabled={!isAllowed || isPending}
            >
              <Trash2 />
              Delete
            </Button>
          )}
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Trash2 />
                </AlertDialogMedia>
                <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the {title.toLowerCase()} from your shared secret pages.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="danger" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="aspect-square h-full w-auto rounded" />
      ) : (
        previewUrl && (
          <img
            src={previewUrl}
            alt={`${title} preview`}
            className="aspect-square h-full w-auto rounded border border-border object-contain p-1"
          />
        )
      )}
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
      text: `Successfully uploaded ${assetType.replace("brand-", "")}`,
      type: "success"
    });
  };

  const handleFileDelete = async (assetType: "brand-logo" | "brand-favicon") => {
    await deleteAsset({ assetType });
    createNotification({
      text: `Successfully deleted ${assetType.replace("brand-", "")}`,
      type: "success"
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Custom Branding
          {!isFeatureEnabled && (
            <Badge variant="info">
              <LockIcon />
              Enterprise
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Customize the appearance of your shared secret pages with your own branding.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isFeatureEnabled ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-container p-4">
            <p className="text-sm text-muted">
              Custom branding for secret sharing pages is available on Enterprise plans.
            </p>
            <Button size="xs" variant="org" asChild>
              <a href="https://infisical.com/schedule-demo" target="_blank" rel="noreferrer">
                Talk to Us
              </a>
            </Button>
          </div>
        ) : (
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <AssetUploadCard
                    assetType="brand-logo"
                    title="Logo"
                    description={`Displayed on shared secret pages. ${ACCEPTED_FORMATS_LABEL}, max 1MB.`}
                    hasAsset={brandingConfig?.hasLogo ?? false}
                    isAllowed={isAllowed}
                    isPending={isPending}
                    onUpload={handleFileUpload}
                    onDelete={handleFileDelete}
                  />
                  <AssetUploadCard
                    assetType="brand-favicon"
                    title="Favicon"
                    description={`Displayed in browser tab. ${ACCEPTED_FORMATS_LABEL}, max 1MB.`}
                    hasAsset={brandingConfig?.hasFavicon ?? false}
                    isAllowed={isAllowed}
                    isPending={isPending}
                    onUpload={handleFileUpload}
                    onDelete={handleFileDelete}
                  />
                </div>

                <form
                  onSubmit={handleSubmit(handleFormSubmit)}
                  autoComplete="off"
                  className="flex flex-col gap-4"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Controller
                      control={control}
                      name="primaryColor"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel>
                            Primary Color
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Background color for the page (hex format, e.g., #82cec0)
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                          <ColorPicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="#0e1014"
                            disabled={!isAllowed}
                            isError={Boolean(error)}
                          />
                          {error && <FieldError>{error.message}</FieldError>}
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="secondaryColor"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel>
                            Secondary Color
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Panel and component background color (hex format, e.g., #14211e)
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                          <ColorPicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="#1e1f22"
                            disabled={!isAllowed}
                            isError={Boolean(error)}
                          />
                          {error && <FieldError>{error.message}</FieldError>}
                        </Field>
                      )}
                    />
                  </div>
                  <div>
                    <Button
                      variant={!isDirty || !isAllowed ? "outline" : "org"}
                      type="submit"
                      isPending={isUpdatingOrg}
                      isDisabled={!isDirty || !isAllowed}
                    >
                      Save Colors
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </OrgPermissionCan>
        )}
      </CardContent>
    </Card>
  );
};
