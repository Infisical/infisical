import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
  const revocationReasonId = useId();
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
    <Dialog
      open={popUp?.revokeCertificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("revokeCertificate", isOpen);
        reset();
      }}
    >
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Revoke Certificate</DialogTitle>
          <DialogDescription>Mark this certificate as revoked.</DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col gap-6" onSubmit={handleSubmit(onFormSubmit)}>
          <DialogBody>
            <fieldset disabled={isSubmitting} className="min-w-0">
              <Controller
                control={control}
                name="revocationReason"
                defaultValue={CrlReason.UNSPECIFIED}
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={revocationReasonId}>Revocation Reason</FieldLabel>
                    <Select
                      value={field.value}
                      name={field.name}
                      onValueChange={onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger
                        id={revocationReasonId}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        className="w-full"
                        isError={Boolean(error)}
                      >
                        <SelectValue placeholder="Select a revocation reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {crlReasons.map(({ label, value }) => (
                          <SelectItem value={String(value || "")} key={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" type="submit" isPending={isSubmitting}>
              Revoke
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
