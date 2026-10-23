import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { UsePopUpState } from "@app/hooks/usePopUp";

const DEFAULT_RENEWAL_BEFORE_DAYS = 20;
const MIN_RENEWAL_BEFORE_DAYS = 1;
const MAX_RENEWAL_BEFORE_DAYS = 30;

const createFormSchema = (ttlDays: number, notAfter: string) =>
  z.object({
    renewBeforeDays: z
      .number()
      .min(MIN_RENEWAL_BEFORE_DAYS, `Renewal days must be at least ${MIN_RENEWAL_BEFORE_DAYS}`)
      .max(MAX_RENEWAL_BEFORE_DAYS, `Renewal days cannot exceed ${MAX_RENEWAL_BEFORE_DAYS}`)
      .refine(
        (value) => value < ttlDays,
        (value) => ({
          message: `Renewal days (${value}) must be less than certificate TTL (${ttlDays} days)`
        })
      )
      .refine(
        (value) => {
          const expiryDate = new Date(notAfter);
          const renewalDate = new Date(expiryDate.getTime() - value * 24 * 60 * 60 * 1000);
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          return renewalDate >= tomorrow;
        },
        () => ({
          message: "Renewals can only be scheduled from tomorrow onwards."
        })
      )
  });

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

type Props = {
  popUp: UsePopUpState<["manageRenewal"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["manageRenewal"]>, state?: boolean) => void;
};

export const CertificateManageRenewalModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync: updateRenewalConfig, isPending: isUpdatingConfig } =
    useUpdateRenewalConfig();

  const certificateData = popUp.manageRenewal.data as {
    certificateId: string;
    commonName: string;
    profileId: string;
    renewBeforeDays?: number;
    ttlDays?: number;
    notAfter: string;
    renewalError?: string;
    renewedFromCertificateId?: string;
    renewedByCertificateId?: string;
  };

  const { data: profileData } = useGetCertificateProfileById({
    profileId: certificateData?.profileId || ""
  });

  const defaultRenewalDays = useMemo(() => {
    if (certificateData?.renewBeforeDays) {
      return certificateData.renewBeforeDays;
    }
    if (profileData?.apiConfig?.renewBeforeDays) {
      return profileData.apiConfig.renewBeforeDays;
    }
    return DEFAULT_RENEWAL_BEFORE_DAYS;
  }, [certificateData?.renewBeforeDays, profileData?.apiConfig?.renewBeforeDays]);

  const isAutoRenewalEnabled = Boolean(
    certificateData?.renewBeforeDays && certificateData.renewBeforeDays > 0
  );

  const hasRenewalError = Boolean(certificateData?.renewalError);

  const formSchema = createFormSchema(
    certificateData?.ttlDays || 365,
    certificateData?.notAfter || ""
  );

  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      renewBeforeDays: defaultRenewalDays
    }
  });

  const isPending = isUpdatingConfig || isSubmitting;
  const { isDiscardDialogOpen, setIsDiscardDialogOpen, requestDiscard, confirmDiscard } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => handlePopUpToggle("manageRenewal", false)
    });

  useEffect(() => {
    if (popUp.manageRenewal.isOpen) {
      reset({
        renewBeforeDays: defaultRenewalDays
      });
    }
  }, [popUp.manageRenewal.isOpen, defaultRenewalDays, reset]);

  const onUpdateRenewal = async (data: FormData) => {
    if (!currentProject?.slug) {
      createNotification({
        text: "Unable to update auto-renewal: Certificate Manager could not be loaded. Please refresh the page and try again.",
        type: "error"
      });
      return;
    }

    await updateRenewalConfig({
      certificateId: certificateData.certificateId,
      renewBeforeDays: data.renewBeforeDays
    });

    createNotification({
      text: isAutoRenewalEnabled
        ? "Auto-renewal configuration updated successfully"
        : "Auto-renewal enabled successfully",
      type: "success"
    });

    handlePopUpToggle("manageRenewal", false);
  };

  const getModalTitle = () => {
    if (hasRenewalError) {
      return `Fix Auto-Renewal: ${certificateData?.commonName || ""}`;
    }
    if (isAutoRenewalEnabled) {
      return `Manage Auto-Renewal for ${certificateData?.commonName || ""}`;
    }
    return `Enable Auto-Renewal for ${certificateData?.commonName || ""}`;
  };

  if (!certificateData) {
    return null;
  }

  return (
    <>
      <Dialog
        open={popUp.manageRenewal.isOpen}
        onOpenChange={(open) => {
          if (!open && !isPending) requestDiscard();
        }}
      >
        <DialogContent isPending={isPending}>
          <DialogHeader>
            <DialogTitle>{getModalTitle()}</DialogTitle>
            <DialogDescription>
              Configure when this certificate is automatically renewed.
            </DialogDescription>
          </DialogHeader>
          {hasRenewalError && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertTitle>Automatic Renewal Failed</AlertTitle>
              <AlertDescription>
                The last automatic renewal attempt failed: {certificateData.renewalError}
              </AlertDescription>
            </Alert>
          )}
          <form id="certificate-renewal-form" onSubmit={handleSubmit(onUpdateRenewal)}>
            <Controller
              control={control}
              name="renewBeforeDays"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="certificate-renewal-days">
                    Auto-Renew Days Before Expiry
                  </FieldLabel>
                  <Input
                    {...field}
                    id="certificate-renewal-days"
                    type="number"
                    min={MIN_RENEWAL_BEFORE_DAYS}
                    max={MAX_RENEWAL_BEFORE_DAYS}
                    disabled={isPending}
                    isError={Boolean(error)}
                    onChange={(event) => field.onChange(parseInt(event.target.value, 10))}
                    placeholder="Enter days before expiration"
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} isDisabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="certificate-renewal-form"
              variant="project"
              isPending={isPending}
            >
              {isAutoRenewalEnabled ? "Update Configuration" : "Enable Auto-Renewal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your auto-renewal configuration changes will be lost."
      />
    </>
  );
};
