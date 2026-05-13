import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, TextArea } from "@app/components/v2";
import { useGetCert, useImportCertificate } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const schema = z.object({
  certificatePem: z.string().trim().min(1, "Certificate PEM is required"),
  privateKeyPem: z.string().trim().min(1, "Private Key PEM is required"),
  chainPem: z.string().trim().min(1, "Certificate Chain PEM is required")
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificateImport"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateImport"]>,
    state?: boolean
  ) => void;
  applicationId?: string;
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

export const CertificateImportModal = ({ popUp, handlePopUpToggle, applicationId }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const { data: cert } = useGetCert(
    (popUp?.certificateImport?.data as { serialNumber: string })?.serialNumber || ""
  );

  const { mutateAsync: importCertificate } = useImportCertificate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ certificatePem, privateKeyPem, chainPem }: FormData) => {
    const { serialNumber, certificate, certificateChain, privateKey } = await importCertificate({
      certificatePem,
      privateKeyPem,
      chainPem,
      applicationId
    });

    reset();

    setCertificateDetails({
      serialNumber,
      certificate,
      certificateChain,
      privateKey
    });

    createNotification({
      text: "Successfully imported certificate",
      type: "success"
    });
  };

  return (
    <Modal
      isOpen={popUp?.certificateImport?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateImport", isOpen);
        reset();
        setCertificateDetails(null);
      }}
    >
      <ModalContent title={`${cert ? "View" : "Import"} Certificate`}>
        {!certificateDetails ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              defaultValue=""
              name="certificatePem"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Leaf Certificate PEM"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <TextArea {...field} isDisabled={Boolean(cert)} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="privateKeyPem"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Private Key PEM"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <TextArea {...field} isDisabled={Boolean(cert)} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="chainPem"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Certificate Chain PEM"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <TextArea {...field} isDisabled={Boolean(cert)} />
                </FormControl>
              )}
            />
            {!cert && (
              <div className="mt-4 flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting}
                >
                  Create
                </Button>
                <Button
                  colorSchema="secondary"
                  variant="plain"
                  onClick={() => handlePopUpToggle("certificateImport", false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </form>
        ) : (
          <CertificateContent
            serialNumber={certificateDetails.serialNumber}
            certificate={certificateDetails.certificate}
            certificateChain={certificateDetails.certificateChain}
            privateKey={certificateDetails.privateKey}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
