import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useImportCertificate, useGetCert, useListWorkspacePkiCollections } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const schema = z.object({
  certificatePem: z.string().trim().min(1, "Certificate PEM is required"),
  privateKeyPem: z.string().trim().optional(),
  chainPem: z.string().trim().optional(),

  friendlyName: z.string(),
  collectionId: z.string().optional()

  // Can be added as override fields in the future | Also edit /frontend/src/hooks/api/ca/types.ts
  // commonName: z.string().trim().min(1),
  // altNames: z.string(),

  // Can be added as override fields in the future | Also edit /frontend/src/hooks/api/ca/types.ts
  // keyUsages: z.object({
  //   [CertKeyUsage.DIGITAL_SIGNATURE]: z.boolean().optional(),
  //   [CertKeyUsage.KEY_ENCIPHERMENT]: z.boolean().optional(),
  //   [CertKeyUsage.NON_REPUDIATION]: z.boolean().optional(),
  //   [CertKeyUsage.DATA_ENCIPHERMENT]: z.boolean().optional(),
  //   [CertKeyUsage.KEY_AGREEMENT]: z.boolean().optional(),
  //   [CertKeyUsage.KEY_CERT_SIGN]: z.boolean().optional(),
  //   [CertKeyUsage.CRL_SIGN]: z.boolean().optional(),
  //   [CertKeyUsage.ENCIPHER_ONLY]: z.boolean().optional(),
  //   [CertKeyUsage.DECIPHER_ONLY]: z.boolean().optional()
  // }),
  // extendedKeyUsages: z.object({
  //   [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
  //   [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
  //   [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
  //   [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
  //   [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
  //   [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
  // })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificateImport"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateImport"]>,
    state?: boolean
  ) => void;
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

export const CertificateImportModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const { currentWorkspace } = useWorkspace();
  const { data: cert } = useGetCert(
    (popUp?.certificateImport?.data as { serialNumber: string })?.serialNumber || ""
  );

  const { data } = useListWorkspacePkiCollections({
    workspaceId: currentWorkspace?.id || ""
  });

  const { mutateAsync: importCertificate } = useImportCertificate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({
    certificatePem,
    privateKeyPem,
    chainPem,
    friendlyName,
    collectionId
  }: FormData) => {
    try {
      if (!currentWorkspace?.slug) return;

      const { serialNumber, certificate, certificateChain, privateKey } = await importCertificate({
        projectSlug: currentWorkspace.slug,

        certificatePem,
        privateKeyPem,
        chainPem,

        friendlyName,
        pkiCollectionId: collectionId
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to import certificate",
        type: "error"
      });
    }
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
      <ModalContent title={`${cert ? "View" : "Issue"} Certificate`}>
        {!certificateDetails ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="collectionId"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Certificate Collection"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isOptional
                  className="mt-4"
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    isDisabled={Boolean(cert)}
                  >
                    {(data?.collections || []).map(({ id, name }) => (
                      <SelectItem value={id} key={`pki-collection-${id}`}>
                        {name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="friendlyName"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Friendly Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="My Certificate" isDisabled={Boolean(cert)} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="certificatePem"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Certificate PEM"
                  isError={Boolean(error)}
                  isRequired
                  errorText={error?.message}
                >
                  <TextArea
                    {...field}
                    placeholder="TODO(andrey): Pem placeholder"
                    isDisabled={Boolean(cert)}
                  />
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
                  isOptional
                  errorText={error?.message}
                >
                  <TextArea
                    {...field}
                    placeholder="TODO(andrey): Pem placeholder"
                    isDisabled={Boolean(cert)}
                  />
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
                  isOptional
                  errorText={error?.message}
                >
                  <TextArea
                    {...field}
                    placeholder="TODO(andrey): Pem placeholder"
                    isDisabled={Boolean(cert)}
                  />
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
