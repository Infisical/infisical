import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useProject } from "@app/context";
import { useRevokeCert } from "@app/hooks/api";
import { crlReasons } from "@app/hooks/api/certificates/constants";
import { CrlReason } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  revocationReason: z.enum([
    CrlReason.UNSPECIFIED,
    CrlReason.KEY_COMPROMISE,
    CrlReason.CA_COMPROMISE,
    CrlReason.AFFILIATION_CHANGED,
    CrlReason.SUPERSEDED,
    CrlReason.CESSATION_OF_OPERATION,
    CrlReason.CERTIFICATE_HOLD,
    CrlReason.PRIVILEGE_WITHDRAWN,
    CrlReason.A_A_COMPROMISE
  ])
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["revokeCertificate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["revokeCertificate"]>,
    state?: boolean
  ) => void;
};

export const CertificateRevocationModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync: revokeCertificate } = useRevokeCert();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ revocationReason }: FormData) => {
    if (!currentProject?.slug) return;

    const { certificateId } = popUp.revokeCertificate.data as { certificateId: string };

    await revokeCertificate({
      projectId: currentProject.id,
      id: certificateId,
      revocationReason
    });

    reset();
    handlePopUpToggle("revokeCertificate", false);

    createNotification({
      text: "Successfully revoked certificate",
      type: "success"
    });
  };

  return (
    <Modal
      isOpen={popUp?.revokeCertificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("revokeCertificate", isOpen);
        reset();
      }}
    >
      <ModalContent title="Revoke Certificate">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="revocationReason"
            defaultValue={CrlReason.UNSPECIFIED}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Revocation Reason"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {crlReasons.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Revoke
            </Button>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
