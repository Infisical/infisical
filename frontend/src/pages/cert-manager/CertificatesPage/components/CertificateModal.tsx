import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  CaStatus,
  useCreateCertificate,
  useGetCert,
  useGetCertTemplate,
  useListWorkspaceCas,
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiCollections
} from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const schema = z.object({
  certificateTemplateId: z.string().optional(),
  caId: z.string(),
  collectionId: z.string().optional(),
  commonName: z.string().trim().min(1),
  subjectAltNames: z.string(),
  ttl: z.string().trim(),
  keyUsages: z.object({
    [CertKeyUsage.DIGITAL_SIGNATURE]: z.boolean().optional(),
    [CertKeyUsage.KEY_ENCIPHERMENT]: z.boolean().optional(),
    [CertKeyUsage.NON_REPUDIATION]: z.boolean().optional(),
    [CertKeyUsage.DATA_ENCIPHERMENT]: z.boolean().optional(),
    [CertKeyUsage.KEY_AGREEMENT]: z.boolean().optional(),
    [CertKeyUsage.KEY_CERT_SIGN]: z.boolean().optional(),
    [CertKeyUsage.CRL_SIGN]: z.boolean().optional(),
    [CertKeyUsage.ENCIPHER_ONLY]: z.boolean().optional(),
    [CertKeyUsage.DECIPHER_ONLY]: z.boolean().optional()
  }),
  extendedKeyUsages: z.object({
    [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
    [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
    [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
    [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
    [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
    [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
  })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificate"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificate"]>, state?: boolean) => void;
  preselectedTemplate?: { id: string; name: string };
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

const CERT_TEMPLATE_NONE_VALUE = "none";

export const CertificateModal = ({ popUp, handlePopUpToggle, preselectedTemplate }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const { currentProject } = useProject();
  const { data: cert } = useGetCert(
    (popUp?.certificate?.data as { serialNumber: string })?.serialNumber || ""
  );

  const { data: cas } = useListWorkspaceCas({
    projectId: currentProject.id,
    status: CaStatus.ACTIVE
  });

  const { data } = useListWorkspacePkiCollections({
    projectId: currentProject?.id || ""
  });

  const { data: templatesData } = useListWorkspaceCertificateTemplates({
    projectId: currentProject?.id || ""
  });

  const { mutateAsync: createCertificate } = useCreateCertificate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    setValue,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      keyUsages: {
        [CertKeyUsage.DIGITAL_SIGNATURE]: true,
        [CertKeyUsage.KEY_ENCIPHERMENT]: true
      },
      extendedKeyUsages: {}
    }
  });

  const selectedCertTemplateId = watch("certificateTemplateId");
  const hasCertTemplateSelected =
    selectedCertTemplateId !== "" && selectedCertTemplateId !== CERT_TEMPLATE_NONE_VALUE;

  const { data: selectedCertTemplate } = useGetCertTemplate(
    hasCertTemplateSelected ? (selectedCertTemplateId as string) : ""
  );

  useEffect(() => {
    if (cert) {
      reset({
        caId: cert.caId,
        commonName: cert.commonName,
        subjectAltNames: cert.subjectAltNames,
        certificateTemplateId: cert.certificateTemplateId ?? CERT_TEMPLATE_NONE_VALUE,
        ttl: "",
        keyUsages: Object.fromEntries((cert.keyUsages || []).map((name) => [name, true])),
        extendedKeyUsages: Object.fromEntries(
          (cert.extendedKeyUsages || []).map((name) => [name, true])
        )
      });
    } else if (popUp?.certificate?.isOpen) {
      const templateId = preselectedTemplate?.id || CERT_TEMPLATE_NONE_VALUE;

      reset({
        caId: "",
        commonName: "",
        subjectAltNames: "",
        ttl: "",
        certificateTemplateId: templateId,
        keyUsages: {
          [CertKeyUsage.DIGITAL_SIGNATURE]: true,
          [CertKeyUsage.KEY_ENCIPHERMENT]: true
        },
        extendedKeyUsages: {}
      });
    }
  }, [cert, preselectedTemplate, popUp?.certificate?.isOpen]);

  useEffect(() => {
    if (!cert && selectedCertTemplate) {
      setValue("ttl", selectedCertTemplate.ttl);
      setValue(
        "keyUsages",
        Object.fromEntries(selectedCertTemplate.keyUsages.map((name) => [name, true]))
      );
      setValue(
        "extendedKeyUsages",
        Object.fromEntries(selectedCertTemplate.extendedKeyUsages.map((name) => [name, true]))
      );
    }
  }, [selectedCertTemplate, cert]);

  const onFormSubmit = async ({
    caId,
    collectionId,
    commonName,
    subjectAltNames,
    ttl,
    keyUsages,
    extendedKeyUsages
  }: FormData) => {
    if (!currentProject?.slug) return;

    const { serialNumber, certificate, certificateChain, privateKey } = await createCertificate({
      caId: !selectedCertTemplate ? caId : undefined,
      certificateTemplateId: selectedCertTemplate ? selectedCertTemplateId : undefined,
      projectSlug: currentProject.slug,
      pkiCollectionId: collectionId,
      commonName,
      subjectAltNames,
      ttl,
      keyUsages: Object.entries(keyUsages)
        .filter(([, value]) => value)
        .map(([key]) =>
          key === CertKeyUsage.CRL_SIGN
            ? "cRLSign"
            : key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        ),
      extendedKeyUsages: Object.entries(extendedKeyUsages)
        .filter(([, value]) => value)
        .map(([key]) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()))
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
      <ModalContent title={`${cert ? "View" : "Request"} Certificate`}>
        {!certificateDetails ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="certificateTemplateId"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label={
                    <div>
                      <FormLabel
                        isRequired
                        label="Certificate Template"
                        icon={
                          <Tooltip
                            className="text-center"
                            content={
                              <span>
                                When a template is selected, the details provided are validated
                                against the template policies.
                              </span>
                            }
                          >
                            <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                          </Tooltip>
                        }
                      />
                    </div>
                  }
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Select
                    value={field.value}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    isDisabled={Boolean(cert) || Boolean(preselectedTemplate)}
                  >
                    <SelectItem value={CERT_TEMPLATE_NONE_VALUE} key="cert-template-none">
                      None
                    </SelectItem>
                    {preselectedTemplate &&
                      !templatesData?.certificateTemplates?.find(
                        (t) => t.id === preselectedTemplate.id
                      ) && (
                        <SelectItem
                          value={preselectedTemplate.id}
                          key={`cert-template-preselected-${preselectedTemplate.id}`}
                        >
                          {preselectedTemplate.name}
                        </SelectItem>
                      )}
                    {(templatesData?.certificateTemplates || []).map(({ id, name }) => (
                      <SelectItem value={id} key={`cert-template-${id}`}>
                        {name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            {(!selectedCertTemplateId ||
              selectedCertTemplateId === CERT_TEMPLATE_NONE_VALUE ||
              cert) && (
              <>
                <Controller
                  control={control}
                  name="caId"
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
              </>
            )}
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
              name="subjectAltNames"
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
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="key-usages" className="data-[state=open]:border-none">
                <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
                  <div className="order-1 ml-3">Key Usage</div>
                </AccordionTrigger>
                <AccordionContent>
                  <Controller
                    control={control}
                    name="keyUsages"
                    render={({ field: { onChange, value }, fieldState: { error } }) => {
                      return (
                        <FormControl
                          label="Key Usage"
                          errorText={error?.message}
                          isError={Boolean(error)}
                        >
                          <div className="mt-2 mb-7 grid grid-cols-2 gap-2">
                            {KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
                              return (
                                <Checkbox
                                  id={optionValue}
                                  key={optionValue}
                                  isDisabled={Boolean(cert)}
                                  isChecked={value[optionValue]}
                                  onCheckedChange={(state) => {
                                    onChange({
                                      ...value,
                                      [optionValue]: state
                                    });
                                  }}
                                >
                                  {label}
                                </Checkbox>
                              );
                            })}
                          </div>
                        </FormControl>
                      );
                    }}
                  />
                  <Controller
                    control={control}
                    name="extendedKeyUsages"
                    render={({ field: { onChange, value }, fieldState: { error } }) => {
                      return (
                        <FormControl
                          label="Extended Key Usage"
                          errorText={error?.message}
                          isError={Boolean(error)}
                        >
                          <div className="mt-2 mb-7 grid grid-cols-2 gap-2">
                            {EXTENDED_KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
                              return (
                                <Checkbox
                                  id={optionValue}
                                  key={optionValue}
                                  isDisabled={Boolean(cert)}
                                  isChecked={value[optionValue]}
                                  onCheckedChange={(state) => {
                                    onChange({
                                      ...value,
                                      [optionValue]: state
                                    });
                                  }}
                                >
                                  {label}
                                </Checkbox>
                              );
                            })}
                          </div>
                        </FormControl>
                      );
                    }}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
                  onClick={() => handlePopUpToggle("certificate", false)}
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
