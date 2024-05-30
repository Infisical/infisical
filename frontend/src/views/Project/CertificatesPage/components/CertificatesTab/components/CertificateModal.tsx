import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
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
import { CaStatus, useCreateCertificate, useGetCert, useListWorkspaceCas } from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const isValidDate = (dateString: string) => {
  if (dateString === "") return true;
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const schema = z.object({
  caId: z.string(),
  commonName: z.string().trim().min(1),
  ttl: z.string().trim().optional(),
  notAfter: z
    .string()
    .trim()
    .refine(isValidDate, { message: "Invalid date format" })
    .transform((val) => (val === "" ? undefined : val))
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
        commonName: cert.commonName,
        ttl: "",
        notAfter: format(new Date(cert.notAfter), "yyyy-MM-dd")
      });
    } else {
      reset({
        caId: "",
        commonName: "",
        ttl: "",
        notAfter: ""
      });
    }
  }, [cert]);

  const onFormSubmit = async ({ caId, commonName, ttl, notAfter }: FormData) => {
    try {
      if (!currentWorkspace?.slug) return;

      const { serialNumber, certificate, certificateChain, privateKey } = await createCertificate({
        projectSlug: currentWorkspace.slug,
        caId,
        commonName,
        ttl: ttl ? Number(ttl) : undefined,
        notBefore: new Date().toISOString(),
        notAfter
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
              name="ttl"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="TTL (seconds)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="86400" isDisabled={Boolean(cert)} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="notAfter"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Valid Until"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="YYYY-MM-DD" isDisabled={Boolean(cert)} />
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
