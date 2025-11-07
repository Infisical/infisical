import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const createFormSchema = (ttlDays: number) =>
  z.object({
    renewBeforeDays: z
      .number()
      .min(1, "Renewal days must be at least 1")
      .max(365, "Renewal days cannot exceed 365")
      .refine(
        (value) => value < ttlDays,
        (value) => ({
          message: `Renewal days (${value}) must be less than certificate TTL (${ttlDays} days)`
        })
      )
  });

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

type Props = {
  popUp: UsePopUpState<["configureRenewal"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["configureRenewal"]>,
    state?: boolean
  ) => void;
};

export const CertificateRenewalConfigModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync: updateRenewalConfig, isPending: isSubmitting } = useUpdateRenewalConfig();

  const certificateData = popUp.configureRenewal.data as {
    certificateId: string;
    commonName: string;
    profileId: string;
    renewBeforeDays?: number;
    ttlDays: number;
  };

  const formSchema = createFormSchema(certificateData.ttlDays);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      renewBeforeDays: certificateData?.renewBeforeDays || 1
    }
  });

  const renewBeforeDays = watch("renewBeforeDays");

  const onSubmit = async (data: FormData) => {
    if (!currentProject?.slug) {
      createNotification({
        text: "Project not found",
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
      text: "Successfully updated auto-renewal configuration",
      type: "success"
    });

    handlePopUpToggle("configureRenewal", false);
  };

  return (
    <Modal
      isOpen={popUp?.configureRenewal?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("configureRenewal", isOpen);
      }}
    >
      <ModalContent title={`Configure Auto-Renewal: ${certificateData?.commonName || ""}`}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4">
            <p className="mb-4 text-sm text-mineshaft-300">
              Configure when this certificate should be automatically renewed. The certificate will
              be renewed when it has the specified number of days remaining before expiration.
            </p>

            <div className="mb-4 rounded border bg-mineshaft-800 p-3">
              <p className="text-sm text-mineshaft-300">
                <strong>Certificate TTL:</strong> {certificateData?.ttlDays} days
              </p>
              <p className="text-sm text-mineshaft-300">
                <strong>Current Setting:</strong>{" "}
                {certificateData?.renewBeforeDays
                  ? `${certificateData.renewBeforeDays} days before expiration`
                  : "Disabled"}
              </p>
            </div>

            <Controller
              control={control}
              name="renewBeforeDays"
              render={({ field }) => (
                <FormControl
                  label="Renew Before Days"
                  isError={Boolean(errors.renewBeforeDays)}
                  errorText={errors.renewBeforeDays?.message}
                >
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    max={certificateData?.ttlDays ? certificateData.ttlDays - 1 : undefined}
                    placeholder="Enter days before expiration"
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      field.onChange(Number.isNaN(value) ? 0 : value);
                    }}
                  />
                </FormControl>
              )}
            />

            {renewBeforeDays && certificateData?.ttlDays && (
              <div className="mt-2 rounded bg-primary-900/20 p-2">
                <p className="text-sm text-primary-300">
                  {renewBeforeDays >= certificateData.ttlDays
                    ? "⚠️ Renewal days must be less than certificate TTL"
                    : `✓ Certificate will be renewed ${renewBeforeDays} days before expiration`}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting || renewBeforeDays >= (certificateData?.ttlDays || 0)}
            >
              Update Configuration
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("configureRenewal", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
