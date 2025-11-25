import { useEffect } from "react";
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
  useCreateCertTemplate,
  useGetCertTemplate,
  useGetInternalCaById,
  useListWorkspaceCas,
  useListWorkspacePkiCollections,
  useUpdateCertTemplate
} from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

const validateTemplateRegexField = z.string().trim().min(1).max(100);

const schema = z.object({
  caId: z.string(),
  collectionId: z.string().optional(),
  name: z.string().min(1),
  commonName: validateTemplateRegexField,
  subjectAlternativeName: validateTemplateRegexField,
  ttl: z.string().trim().min(1),
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
  caId: string;
  popUp: UsePopUpState<["certificateTemplate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateTemplate"]>,
    state?: boolean
  ) => void;
};

export const CertificateTemplateModal = ({ popUp, handlePopUpToggle, caId }: Props) => {
  const { currentProject } = useProject();

  const { data: ca } = useGetInternalCaById(caId);

  const { data: certTemplate } = useGetCertTemplate(
    (popUp?.certificateTemplate?.data as { id: string })?.id || ""
  );

  const { data: cas } = useListWorkspaceCas({
    projectId: currentProject?.id,
    status: CaStatus.ACTIVE
  });

  const { data: collectionsData } = useListWorkspacePkiCollections({
    projectId: currentProject?.id || ""
  });

  const { mutateAsync: createCertTemplate } = useCreateCertTemplate();
  const { mutateAsync: updateCertTemplate } = useUpdateCertTemplate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      keyUsages: {
        [CertKeyUsage.DIGITAL_SIGNATURE]: true,
        [CertKeyUsage.KEY_ENCIPHERMENT]: true
      }
    }
  });

  useEffect(() => {
    if (certTemplate) {
      reset({
        caId: certTemplate.caId,
        name: certTemplate.name,
        commonName: certTemplate.commonName,
        subjectAlternativeName: certTemplate.subjectAlternativeName,
        collectionId: certTemplate.pkiCollectionId ?? undefined,
        ttl: certTemplate.ttl,
        keyUsages: Object.fromEntries(certTemplate.keyUsages.map((name) => [name, true]) ?? []),
        extendedKeyUsages: Object.fromEntries(
          certTemplate.extendedKeyUsages.map((name) => [name, true]) ?? []
        )
      });
    } else {
      reset({
        caId,
        name: "",
        commonName: "",
        ttl: "",
        keyUsages: {
          [CertKeyUsage.DIGITAL_SIGNATURE]: true,
          [CertKeyUsage.KEY_ENCIPHERMENT]: true
        },
        extendedKeyUsages: {}
      });
    }
  }, [certTemplate, ca]);

  const onFormSubmit = async ({
    collectionId,
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    keyUsages,
    extendedKeyUsages
  }: FormData) => {
    if (!currentProject?.id) {
      return;
    }

    if (certTemplate) {
      await updateCertTemplate({
        id: certTemplate.id,
        projectId: currentProject.id,
        pkiCollectionId: collectionId,
        caId,
        name,
        commonName,
        subjectAlternativeName,
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

      createNotification({
        text: "Successfully updated certificate template",
        type: "success"
      });
    } else {
      await createCertTemplate({
        projectId: currentProject.id,
        pkiCollectionId: collectionId,
        caId,
        name,
        commonName,
        subjectAlternativeName,
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

      createNotification({
        text: "Successfully created certificate template",
        type: "success"
      });
    }

    reset();
    handlePopUpToggle("certificateTemplate", false);
  };

  return (
    <Modal
      isOpen={popUp?.certificateTemplate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateTemplate", isOpen);
        reset();
      }}
    >
      <ModalContent title={certTemplate ? "Certificate Template" : "Create Certificate Template"}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {certTemplate && (
            <FormControl label="Certificate Template ID">
              <Input value={certTemplate.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Template Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="My Certificate Template" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="caId"
            defaultValue={caId}
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
                  isDisabled
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
                >
                  {(collectionsData?.collections || []).map(({ id, name }) => (
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
            name="commonName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={
                  <div>
                    <FormLabel
                      isRequired
                      label="Common Name (CN)"
                      icon={
                        <Tooltip
                          className="text-center"
                          content={
                            <span>
                              This field accepts limited regular expressions: spaces, *, ., @, -, \
                              (for escaping), and alphanumeric characters only
                            </span>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                        </Tooltip>
                      }
                    />
                  </div>
                }
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder=".*\.acme.com" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="subjectAlternativeName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={
                  <div>
                    <FormLabel
                      isRequired
                      label="Alternative Names (SAN)"
                      icon={
                        <Tooltip
                          className="text-center"
                          content={
                            <span>
                              This field accepts limited regular expressions: spaces, *, ., @, -, \
                              (for escaping), and alphanumeric characters only
                            </span>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                        </Tooltip>
                      }
                    />
                  </div>
                }
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="service\.acme.\..*" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Max TTL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
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
          <div className="mt-4 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Save
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("certificateTemplate", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
