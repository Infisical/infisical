import { useEffect, useState } from "react";
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
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  CaStatus,
  useCreateCertificate,
  useGetCert,
  useListWorkspaceCas,
  useListWorkspacePkiCollections
} from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const schema = z.object({
  caId: z.string(),
  collectionId: z.string().optional(),
  friendlyName: z.string(),
  commonName: z.string().trim().min(1),
  altNames: z.string(),
  ttl: z.string().trim()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificate"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificate"]>, state?: boolean) => void;
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

export const CertificateModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const { currentWorkspace } = useWorkspace();
  const { data: cert } = useGetCert(
    (popUp?.certificate?.data as { serialNumber: string })?.serialNumber || ""
  );

  const { data: cas } = useListWorkspaceCas({
    projectSlug: currentWorkspace?.slug ?? "",
    status: CaStatus.ACTIVE
  });

  const { data } = useListWorkspacePkiCollections({
    workspaceId: currentWorkspace?.id || ""
  });

  const { mutateAsync: createCertificate } = useCreateCertificate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    setValue
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (cert) {
      reset({
        caId: cert.caId,
        friendlyName: cert.friendlyName,
        commonName: cert.commonName,
        altNames: cert.altNames,
        ttl: ""
      });
    } else {
      reset({
        caId: "",
        friendlyName: "",
        commonName: "",
        altNames: "",
        ttl: ""
      });
    }
  }, [cert]);

  const onFormSubmit = async ({
    caId,
    collectionId,
    friendlyName,
    commonName,
    altNames,
    ttl
  }: FormData) => {
    try {
      if (!currentWorkspace?.slug) return;

      const { serialNumber, certificate, certificateChain, privateKey } = await createCertificate({
        projectSlug: currentWorkspace.slug,
        caId,
        pkiCollectionId: collectionId,
        friendlyName,
        commonName,
        altNames,
        ttl
      });

      reset();

      setCertificateDetails({
        serialNumber,
        certificate,
        certificateChain,
        privateKey
      });

      createNotification({
        text: "Successfully created certificate",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create certificate",
        type: "error"
      });
    }
  };

  useEffect(() => {
    if (cas?.length) {
      setValue("caId", cas[0].id);
    }
  }, [cas]);

  return (
    <Modal
      isOpen={popUp?.certificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificate", isOpen);
        reset();
        setCertificateDetails(null);
      }}
    >
      <ModalContent title={`${cert ? "View" : "Issue"} Certificate`}>
        {!certificateDetails ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="caId"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Issuing CA"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  className="mt-4"
                  isRequired
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    isDisabled={Boolean(cert)}
                  >
                    {(cas || []).map(({ id, type, dn }) => (
                      <SelectItem value={id} key={`ca-${id}`}>
                        {`${caTypeToNameMap[type]}: ${dn}`}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            {!cert && (
              <Controller
                control={control}
                name="collectionId"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Certificate Collection (Optional)"
                    errorText={error?.message}
                    isError={Boolean(error)}
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
            )}
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
              name="commonName"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Common Name (CN)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Input {...field} placeholder="service.acme.com" isDisabled={Boolean(cert)} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="altNames"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Alternative Names (SANs)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input
                    {...field}
                    placeholder="app1.acme.com, app2.acme.com, ..."
                    isDisabled={Boolean(cert)}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="ttl"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="TTL"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Input
                    {...field}
                    placeholder="2 days, 1d, 2h, 1y, ..."
                    isDisabled={Boolean(cert)}
                  />
                </FormControl>
              )}
            />
            {!cert && (
              <div className="flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting}
                >
                  Create
                </Button>
                <Button colorSchema="secondary" variant="plain">
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
