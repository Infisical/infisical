import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles";
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

const RenewalConfigForm = ({
  control,
  errors,
  onSubmit,
  isLoading,
  buttonText,
  onCancel
}: {
  control: any;
  errors: { renewBeforeDays?: { message?: string } };
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  isLoading: boolean;
  buttonText: string;
  onCancel: () => void;
}) => (
  <form onSubmit={onSubmit}>
    <FormControl
      label="Auto-renew days before expiry"
      isError={Boolean(errors.renewBeforeDays)}
      errorText={errors.renewBeforeDays?.message}
      className="mb-6"
    >
      <Controller
        control={control}
        name="renewBeforeDays"
        render={({ field }) => (
          <Input
            {...field}
            type="number"
            min={MIN_RENEWAL_BEFORE_DAYS}
            max={MAX_RENEWAL_BEFORE_DAYS}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              field.onChange(value);
            }}
            placeholder="Enter days before expiration"
          />
        )}
      />
    </FormControl>

    <div className="flex justify-end gap-3">
      <Button type="button" colorSchema="secondary" variant="plain" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" colorSchema="primary" isLoading={isLoading} isDisabled={isLoading}>
        {buttonText}
      </Button>
    </div>
  </form>
);

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
    formState: { errors },
    reset
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      renewBeforeDays: defaultRenewalDays
    }
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
        text: "Unable to update auto-renewal: Project not found. Please refresh the page and try again.",
        type: "error"
      });
      return;
    }

    await updateRenewalConfig({
      certificateId: certificateData.certificateId,
      renewBeforeDays: data.renewBeforeDays,
      projectSlug: currentProject.slug
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
    <Modal
      isOpen={popUp?.manageRenewal?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("manageRenewal", isOpen);
      }}
    >
      <ModalContent title={getModalTitle()}>
        {hasRenewalError && (
          <div className="mb-6 rounded-md border border-red-600 bg-red-900/20 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600">
                <span className="text-xs font-bold text-white">!</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-red-400">Automatic Renewal Failed</h3>
                <p className="mt-1 text-sm text-red-300">
                  The last automatic renewal attempt failed: {certificateData.renewalError}
                </p>
                <p className="mt-2 text-sm text-red-300">
                  You can reconfigure auto-renewal below or disable it completely.
                </p>
              </div>
            </div>
          </div>
        )}

        {(!isAutoRenewalEnabled || hasRenewalError) && (
          <RenewalConfigForm
            control={control}
            errors={errors}
            onSubmit={handleSubmit(onUpdateRenewal)}
            isLoading={isUpdatingConfig}
            buttonText={isAutoRenewalEnabled ? "Update Configuration" : "Enable Auto-Renewal"}
            onCancel={() => handlePopUpToggle("manageRenewal", false)}
          />
        )}

        {isAutoRenewalEnabled && !hasRenewalError && (
          <RenewalConfigForm
            control={control}
            errors={errors}
            onSubmit={handleSubmit(onUpdateRenewal)}
            isLoading={isUpdatingConfig}
            buttonText="Update Configuration"
            onCancel={() => handlePopUpToggle("manageRenewal", false)}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
